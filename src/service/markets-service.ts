import type { LedgerClient } from "../adapters/ledger-client.js";
import { ensurePolicyReasonCodes } from "../adapters/policy-client.js";
import type { PolicyClient } from "../adapters/policy-client.js";
import type { ExecutionRouter } from "../routing/execution-router.js";
import type { MarketIntent } from "../types/market-intent.js";
import type { QuoteValidator } from "./quote-validator.js";

type SubmitIntentResult =
  | { accepted: true; route_id: string; reference_id: string; correlation_id: string }
  | { accepted: false; reason_codes: [string, ...string[]] };

export class MarketsService {
  private readonly idempotentResults = new Map<string, SubmitIntentResult>();

  constructor(
    private readonly policy: PolicyClient,
    private readonly router: ExecutionRouter,
    private readonly quoteValidator: QuoteValidator,
    private readonly ledger: LedgerClient
  ) {}

  async submitIntent(intent: MarketIntent): Promise<SubmitIntentResult> {
    const idempotencyCacheKey = `${intent.account_id ?? ""}:${intent.idempotency_key}`;
    const replayResult = this.idempotentResults.get(idempotencyCacheKey);
    if (replayResult) {
      return replayResult;
    }

    const policyDecision = await this.policy.pre_trade_check(intent);
    if (policyDecision.decision === "DENY") {
      const deniedResult = {
        accepted: false as const,
        reason_codes: ensurePolicyReasonCodes(policyDecision.reason_codes)
      };
      this.idempotentResults.set(idempotencyCacheKey, deniedResult);
      return deniedResult;
    }
    if (policyDecision.decision === "REVIEW") {
      const reviewResult = {
        accepted: false as const,
        reason_codes: ensurePolicyReasonCodes(policyDecision.reason_codes, "policy_review_required")
      };
      this.idempotentResults.set(idempotencyCacheKey, reviewResult);
      return reviewResult;
    }

    const quote = await this.router.fetch_quote(intent);
    if (!this.quoteValidator.isValid(intent, quote)) {
      const invalidQuoteResult = { accepted: false as const, reason_codes: ["quote_invalid"] as [string] };
      this.idempotentResults.set(idempotencyCacheKey, invalidQuoteResult);
      return invalidQuoteResult;
    }

    const route = await this.router.route(intent, quote);
    if (route.status !== "accepted") {
      const routeRejectedResult = {
        accepted: false as const,
        reason_codes: route.reason_codes?.length ? route.reason_codes : (["route_rejected"] as [string])
      };
      this.idempotentResults.set(idempotencyCacheKey, routeRejectedResult);
      return routeRejectedResult;
    }

    await this.ledger.settle({
      order_id: intent.reference_id,
      route_id: route.route_id,
      reference_id: route.reference_id,
      correlation_id: route.correlation_id
    });

    const acceptedResult = {
      accepted: true as const,
      route_id: route.route_id,
      reference_id: route.reference_id,
      correlation_id: route.correlation_id
    };
    this.idempotentResults.set(idempotencyCacheKey, acceptedResult);
    return acceptedResult;
  }
}
