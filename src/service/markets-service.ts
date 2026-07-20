import type { LedgerClient } from "../adapters/ledger-client.js";
import type { PolicyClient } from "../adapters/policy-client.js";
import type { ExecutionRouter } from "../routing/execution-router.js";
import type { MarketIntent } from "../types/market-intent.js";
import type { QuoteValidator } from "./quote-validator.js";

export class MarketsService {
  constructor(
    private readonly policy: PolicyClient,
    private readonly router: ExecutionRouter,
    private readonly quoteValidator: QuoteValidator,
    private readonly ledger: LedgerClient
  ) {}

  async submitIntent(intent: MarketIntent) {
    const policyDecision = await this.policy.preTradeCheck(intent);
    if (!policyDecision.allowed) {
      return { accepted: false as const, reasonCode: policyDecision.reasonCode ?? "policy_denied" };
    }

    const quote = await this.router["adapter"].fetchQuote(intent);
    if (!this.quoteValidator.isValid(intent, quote)) {
      return { accepted: false as const, reasonCode: "quote_invalid" };
    }

    const route = await this.router.route(intent, quote);
    if (route.status !== "accepted") {
      return { accepted: false as const, reasonCode: route.reasonCode ?? "route_rejected" };
    }

    await this.ledger.settle({ orderId: intent.clientRef, routeId: route.routeId });

    return { accepted: true as const, routeId: route.routeId };
  }
}
