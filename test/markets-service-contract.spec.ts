import { describe, expect, it } from "vitest";

import type { ExecutionAdapter } from "../src/adapters/execution-adapter.js";
import type { LedgerClient } from "../src/adapters/ledger-client.js";
import type { PolicyClient, PolicyDecision } from "../src/adapters/policy-client.js";
import { ensurePolicyReasonCodes } from "../src/adapters/policy-client.js";
import { ExecutionRouter } from "../src/routing/execution-router.js";
import type { ExecutionBuildInput, ExecutionBuildResult } from "../src/service/execution-tx-builder.js";
import { MarketsService, PolicyDeniedError } from "../src/service/markets-service.js";
import { QuoteValidator } from "../src/service/quote-validator.js";
import type { MarketIntent } from "../src/types/market-intent.js";

const intent: MarketIntent = {
  side: "buy",
  base_asset: "BTC",
  quote_asset: "USD",
  size: 1,
  max_slippage_bps: 50,
  ttl_ms: 30000,
  reference_id: "ref-1",
  idempotency_key: "idem-1",
  correlation_id: "corr-1",
  account_id: "acct-1"
};

describe("policy + idempotency contract alignment", () => {
  it("enforces DENY reason_codes non-empty", async () => {
    const policy: PolicyClient = {
      pre_trade_check: async () => ({ decision: "DENY", reason_codes: [] } as unknown as PolicyDecision),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };
    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => {
        throw new Error("should not fetch quote for DENY");
      },
      submit: async () => {
        throw new Error("should not submit route for DENY");
      },
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };

    const service = new MarketsService(policy, new ExecutionRouter(adapter), new QuoteValidator(), ledger);
    const result = await service.submitIntent(intent);

    expect(result.accepted).toBe(false);
    if (!result.accepted) {
      expect(result.reason_codes.length).toBeGreaterThan(0);
      expect(result.reason_codes.every((code) => code.startsWith("policy_"))).toBe(true);
    }
  });

  it("fails fast with typed error for DENY in v2 flow", async () => {
    const policy: PolicyClient = {
      pre_trade_check: async () => ({
        decision: "DENY",
        policy_version: "policy-risk@2.0.0",
        explanation: "Denied by risk controls",
        reason_codes: ["policy_blocked_account"]
      }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };

    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => {
        throw new Error("should not fetch quote for DENY");
      },
      submit: async () => {
        throw new Error("should not submit route for DENY");
      },
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };

    const service = new MarketsService(policy, new ExecutionRouter(adapter), new QuoteValidator(), ledger);
    await expect(service.submitIntentV2(intent)).rejects.toBeInstanceOf(PolicyDeniedError);
  });

  it("halts and returns review-required signal for REVIEW", async () => {
    const policy: PolicyClient = {
      pre_trade_check: async () => ({
        decision: "REVIEW",
        policy_version: "policy-risk@2.0.0",
        explanation: "Requires manual review",
        reason_codes: ["policy_review_required"]
      }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };
    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => {
        throw new Error("should not fetch quote for REVIEW");
      },
      submit: async () => {
        throw new Error("should not submit route for REVIEW");
      },
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };

    const service = new MarketsService(policy, new ExecutionRouter(adapter), new QuoteValidator(), ledger);
    const result = await service.submitIntentV2(intent);

    expect(result).toEqual({
      accepted: false,
      review_required: true,
      policy_version: "policy-risk@2.0.0",
      reason_codes: ["policy_review_required"],
      explanation: "Requires manual review"
    });
  });

  it("supports idempotent replay by idempotency_key", async () => {
    const policy: PolicyClient = {
      pre_trade_check: async () => ({ decision: "ALLOW" }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };

    let quoteFetchCount = 0;
    let routeSubmitCount = 0;
    let settleCount = 0;

    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => {
        quoteFetchCount += 1;
        return {
          quote_id: "q-1",
          base_asset: "BTC",
          quote_asset: "USD",
          side: "buy",
          price: 100000,
          max_size: 10,
          valid_from: "2025-01-01T00:00:00.000Z",
          valid_until: "2100-01-01T00:00:00.000Z",
          source: "rfq"
        };
      },
      submit: async () => {
        routeSubmitCount += 1;
        return {
          route_id: "route-1",
          status: "accepted",
          reference_id: "ref-1",
          correlation_id: "corr-1"
        };
      },
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => {
        settleCount += 1;
        return { settlement_id: "settle-1" };
      }
    };

    const service = new MarketsService(policy, new ExecutionRouter(adapter), new QuoteValidator(), ledger);
    const firstResult = await service.submitIntent(intent);
    const replayResult = await service.submitIntent(intent);

    expect(firstResult).toEqual(replayResult);
    expect(quoteFetchCount).toBe(1);
    expect(routeSubmitCount).toBe(1);
    expect(settleCount).toBe(1);
  });

  it("emits sanitized policy decision observability event", async () => {
    const observedEvents: unknown[] = [];
    const policy: PolicyClient = {
      pre_trade_check_with_context: async (input) => {
        expect(input.domain_context.trade_intent?.intent_id).toBe(intent.reference_id);
        return {
          decision: "ALLOW",
          policy_version: "policy-risk@2.0.0",
          explanation: "Allowed"
        };
      },
      pre_trade_check: async () => ({ decision: "ALLOW" }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };
    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => ({
        quote_id: "q-1",
        base_asset: "BTC",
        quote_asset: "USD",
        side: "buy",
        price: 100000,
        max_size: 10,
        valid_from: "2025-01-01T00:00:00.000Z",
        valid_until: "2100-01-01T00:00:00.000Z",
        source: "rfq"
      }),
      submit: async () => ({
        route_id: "route-1",
        status: "accepted",
        reference_id: "ref-1",
        correlation_id: "corr-1"
      }),
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };

    const service = new MarketsService(policy, new ExecutionRouter(adapter), new QuoteValidator(), ledger, (event) => {
      observedEvents.push(event);
    });
    await service.submitIntentV2(intent);

    expect(observedEvents).toHaveLength(1);
    expect(observedEvents[0]).toMatchObject({
      event_type: "markets.policy.decision",
      correlation_id: "corr-1",
      reference_id: "ref-1",
      policy: {
        decision: "ALLOW",
        policy_version: "policy-risk@2.0.0",
        reason_codes: [],
        explanation: "Allowed"
      },
      sanitized_context: {
        has_trade_intent: true,
        has_quote: false,
        has_fee_breakdown: false,
        has_execution_plan: false
      }
    });
  });

  it("invokes execution tx builder only on ALLOW path", async () => {
    const capturedBuildInputs: ExecutionBuildInput[] = [];
    const policy: PolicyClient = {
      pre_trade_check: async () => ({
        decision: "ALLOW",
        policy_version: "policy-risk@2.0.0",
        explanation: "Allowed"
      }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };
    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => ({
        quote_id: "q-1",
        base_asset: "BTC",
        quote_asset: "USD",
        side: "buy",
        price: 100000,
        max_size: 10,
        valid_from: "2025-01-01T00:00:00.000Z",
        valid_until: "2100-01-01T00:00:00.000Z",
        source: "rfq"
      }),
      submit: async () => ({
        route_id: "route-1",
        status: "accepted",
        reference_id: "ref-1",
        correlation_id: "corr-1"
      }),
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };
    const txBuilder = {
      build: async (input: ExecutionBuildInput): Promise<ExecutionBuildResult> => {
        capturedBuildInputs.push(input);
        return {
          payloads: [
            {
              chainId: input.chainId,
              target: input.target,
              calldata: input.calldata,
              value: input.value,
              recipient: input.recipient,
              minOut: input.minOut,
              maxIn: input.maxIn,
              deadline: input.deadline,
              nonce: input.nonce,
              idempotencyKey: input.idempotencyKey ?? "idem"
            }
          ],
          metadata: {
            chainId: input.chainId,
            target: input.target,
            calldata: input.calldata,
            value: input.value,
            minOut: input.minOut,
            maxIn: input.maxIn,
            deadline: input.deadline,
            recipient: input.recipient,
            nonce: input.nonce,
            idempotencyKey: input.idempotencyKey ?? "idem",
            fingerprintHash: "hash"
          }
        };
      }
    };
    const service = new MarketsService(
      policy,
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      txBuilder
    );

    const result = await service.submitIntentV2({
      ...intent,
      created_at: "2026-01-01T00:00:00.000Z",
      meta: {
        execution_chain_id: "1",
        execution_target: "0x1111111111111111111111111111111111111111",
        execution_calldata: "0xabcdef",
        execution_recipient: "0x2222222222222222222222222222222222222222",
        execution_amount_type: "exactIn",
        execution_amount_in: "1000000",
        execution_amount_out: "2000000",
        execution_min_out: "1900000",
        execution_input_token_address: "0x3333333333333333333333333333333333333333",
        execution_output_token_address: "0x4444444444444444444444444444444444444444",
        execution_input_token_decimals: "6",
        execution_output_token_decimals: "18",
        execution_quote_amount_in: "1000000",
        execution_quote_amount_out: "2000000",
        execution_quote_input_token_decimals: "6",
        execution_quote_output_token_decimals: "18"
      }
    });

    expect(result.accepted).toBe(true);
    expect(capturedBuildInputs).toHaveLength(1);
  });

  it("does not invoke execution tx builder on DENY or REVIEW paths", async () => {
    let buildCount = 0;
    const txBuilder = {
      build: async (): Promise<ExecutionBuildResult> => {
        buildCount += 1;
        throw new Error("should not be invoked");
      }
    };

    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => {
        throw new Error("should not fetch quote");
      },
      submit: async () => {
        throw new Error("should not submit route");
      },
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };

    const denyPolicy: PolicyClient = {
      pre_trade_check: async () => ({
        decision: "DENY",
        policy_version: "policy-risk@2.0.0",
        explanation: "Denied",
        reason_codes: ["policy_denied"]
      }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };
    const denyService = new MarketsService(
      denyPolicy,
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      txBuilder
    );
    await expect(denyService.submitIntentV2(intent)).rejects.toBeInstanceOf(PolicyDeniedError);

    const reviewPolicy: PolicyClient = {
      pre_trade_check: async () => ({
        decision: "REVIEW",
        policy_version: "policy-risk@2.0.0",
        explanation: "Review",
        reason_codes: ["policy_review_required"]
      }),
      pre_settlement_check: async () => ({ decision: "ALLOW" })
    };
    const reviewService = new MarketsService(
      reviewPolicy,
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      txBuilder
    );
    const reviewResult = await reviewService.submitIntentV2(intent);
    expect(reviewResult.accepted).toBe(false);
    expect(buildCount).toBe(0);
  });
});

describe("ensurePolicyReasonCodes", () => {
  it("returns fallback policy code when empty", () => {
    expect(ensurePolicyReasonCodes([])).toEqual(["policy_denied"]);
  });
});
