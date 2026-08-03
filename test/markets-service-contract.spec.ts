import { describe, expect, it } from "vitest";

import type { ExecutionAdapter } from "../src/adapters/execution-adapter.js";
import type { AccountsRuntimeClient } from "../src/adapters/accounts-runtime-client.js";
import type { AssetRegistryClient } from "../src/adapters/asset-registry-client.js";
import type { LedgerClient } from "../src/adapters/ledger-client.js";
import type { PolicyClient, PolicyDecision } from "../src/adapters/policy-client.js";
import { ensurePolicyReasonCodes } from "../src/adapters/policy-client.js";
import { ExecutionRouter } from "../src/routing/execution-router.js";
import type { ExecutionBuildInput, ExecutionBuildResult } from "../src/service/execution-tx-builder.js";
import {
  MarketsService,
  PolicyDeniedError,
  type AssetNormalizationObservedEvent,
  type SettlementSubmissionObservedEvent
} from "../src/service/markets-service.js";
import { QuoteValidator } from "../src/service/quote-validator.js";
import { UnifiedAssetService } from "../src/service/unified-asset-service.js";
import { Aa4337UserOpService, type Aa4337ExecutionInput } from "../src/service/aa4337-userop-service.js";
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

  it("emits settlement submission event with correlation continuity", async () => {
    const observed: SettlementSubmissionObservedEvent[] = [];
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
      settle: async () => ({
        settlement_id: "settle-1",
        chainId: 1,
        txHash: "0xabc",
        blockNumber: 44,
        status: "submitted"
      })
    };

    const service = new MarketsService(
      policy,
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      undefined,
      (event) => {
        observed.push(event);
      }
    );
    const result = await service.submitIntentV2(intent);

    expect(result.accepted).toBe(true);
    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      event_type: "settlement.submitted",
      settlement_id: "settle-1",
      intent_id: "ref-1",
      execution_id: "route-1",
      correlation_id: "corr-1",
      chainId: 1,
      txHash: "0xabc",
      blockNumber: 44,
      status: "submitted"
    });
  });

  it("normalizes assets before execution build with correlation-safe observability", async () => {
    const observedNormalization: AssetNormalizationObservedEvent[] = [];
    const policy: PolicyClient = {
      pre_trade_check_with_context: async (input) => {
        expect(input.domain_context.unified_assets).toMatchObject({
          base_asset: { canonical_id: "asset:btc", symbol: "BTC" },
          quote_asset: { canonical_id: "asset:usd", symbol: "USD" }
        });
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
    const registry: AssetRegistryClient = {
      resolve_asset: async ({ asset, chain_id }) => ({
        canonical_id: `asset:${asset.toLowerCase()}`,
        symbol: asset.toUpperCase(),
        decimals: asset === "USD" ? 2 : 8,
        chain_id
      })
    };
    const txBuildInputs: ExecutionBuildInput[] = [];
    const txBuilder = {
      build: async (input: ExecutionBuildInput): Promise<ExecutionBuildResult> => {
        txBuildInputs.push(input);
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
      txBuilder,
      undefined,
      new UnifiedAssetService(registry),
      (event) => {
        observedNormalization.push(event);
      }
    );

    await service.submitIntentV2({
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
        execution_input_token_decimals: "2",
        execution_output_token_decimals: "8",
        execution_quote_amount_in: "1000000",
        execution_quote_amount_out: "2000000",
        execution_quote_input_token_decimals: "2",
        execution_quote_output_token_decimals: "8"
      }
    });

    expect(observedNormalization).toHaveLength(1);
    expect(observedNormalization[0]).toMatchObject({
      event_type: "markets.asset.normalization",
      correlation_id: "corr-1",
      reference_id: "ref-1",
      chain_id: 1,
      assets: {
        base_asset_canonical_id: "asset:btc",
        quote_asset_canonical_id: "asset:usd"
      }
    });
    expect(txBuildInputs).toHaveLength(1);
    expect(txBuildInputs[0].inputToken.symbol).toBe("USD");
    expect(txBuildInputs[0].outputToken.symbol).toBe("BTC");
  });

  it("invokes aa4337 userop path only on ALLOW with normalized assets", async () => {
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
    const registry: AssetRegistryClient = {
      resolve_asset: async ({ asset, chain_id }) => ({
        canonical_id: `asset:${asset.toLowerCase()}`,
        symbol: asset.toUpperCase(),
        decimals: asset === "USD" ? 2 : 8,
        chain_id
      })
    };

    const aaInputs: Aa4337ExecutionInput[] = [];
    const aaRuntime: AccountsRuntimeClient = {
      build: async (input) => {
        aaInputs.push({
          correlation_id: input.correlation_id,
          reference_id: input.reference_id,
          idempotency_key: input.idempotency_key,
          side: input.trade.side,
          size: Number(input.trade.size),
          chain_id: input.chain_id,
          account_id: input.account_id,
          amount_in: input.trade.amount_in,
          amount_out: input.trade.amount_out,
          execution_target: input.execution.target,
          execution_calldata: input.execution.calldata,
          execution_value: input.execution.value,
          execution_recipient: input.execution.recipient,
          deadline: input.execution.deadline,
          nonce: input.execution.nonce,
          input_token_decimals: input.execution.input_token.decimals,
          output_token_decimals: input.execution.output_token.decimals,
          quote_input_token_decimals: input.execution.input_token.decimals,
          quote_output_token_decimals: input.execution.output_token.decimals,
          assets: {
            base_asset: {
              canonical_id: input.trade.base_asset.canonical_id,
              symbol: input.trade.base_asset.symbol,
              decimals: input.trade.base_asset.decimals,
              chain_id: input.chain_id,
              address: input.trade.base_asset.address
            },
            quote_asset: {
              canonical_id: input.trade.quote_asset.canonical_id,
              symbol: input.trade.quote_asset.symbol,
              decimals: input.trade.quote_asset.decimals,
              chain_id: input.chain_id,
              address: input.trade.quote_asset.address
            }
          }
        });
        return { user_operation: {} };
      },
      simulate: async () => ({ success: true }),
      send: async () => ({ user_operation_hash: "0xaaa" }),
      getReceipt: async () => ({ status: "included", transaction_hash: "0xbbb", block_number: 1 })
    };

    const service = new MarketsService(
      policy,
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      undefined,
      undefined,
      new UnifiedAssetService(registry),
      undefined,
      new Aa4337UserOpService(aaRuntime)
    );

    await service.submitIntentV2({
      ...intent,
      created_at: "2026-01-01T00:00:00.000Z",
      meta: {
        execution_chain_id: "1",
        execution_target: "0x1111111111111111111111111111111111111111",
        execution_calldata: "0xabcdef",
        execution_recipient: "0x2222222222222222222222222222222222222222",
        execution_value: "0",
        execution_amount_in: "1000000",
        execution_amount_out: "2000000",
        execution_input_token_decimals: "2",
        execution_output_token_decimals: "8",
        execution_quote_input_token_decimals: "2",
        execution_quote_output_token_decimals: "8"
      }
    });

    expect(aaInputs).toHaveLength(1);
    expect(aaInputs[0].assets.base_asset.canonical_id).toBe("asset:btc");
    expect(aaInputs[0].assets.quote_asset.canonical_id).toBe("asset:usd");
  });

  it("does not execute aa4337 userop path for DENY/REVIEW", async () => {
    let buildCount = 0;
    const aaRuntime: AccountsRuntimeClient = {
      build: async () => {
        buildCount += 1;
        return { user_operation: {} };
      },
      simulate: async () => ({ success: true }),
      send: async () => ({ user_operation_hash: "0xaaa" }),
      getReceipt: async () => ({ status: "included" })
    };
    const aaService = new Aa4337UserOpService(aaRuntime);
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
    const registry: AssetRegistryClient = {
      resolve_asset: async ({ asset, chain_id }) => ({
        canonical_id: `asset:${asset.toLowerCase()}`,
        symbol: asset.toUpperCase(),
        decimals: asset === "USD" ? 2 : 8,
        chain_id
      })
    };

    const denyService = new MarketsService(
      {
        pre_trade_check: async () => ({
          decision: "DENY",
          policy_version: "policy-risk@2.0.0",
          explanation: "Denied",
          reason_codes: ["policy_denied"]
        }),
        pre_settlement_check: async () => ({ decision: "ALLOW" })
      },
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      undefined,
      undefined,
      new UnifiedAssetService(registry),
      undefined,
      aaService
    );
    await expect(denyService.submitIntentV2(intent)).rejects.toBeInstanceOf(PolicyDeniedError);

    const reviewService = new MarketsService(
      {
        pre_trade_check: async () => ({
          decision: "REVIEW",
          policy_version: "policy-risk@2.0.0",
          explanation: "Review",
          reason_codes: ["policy_review_required"]
        }),
        pre_settlement_check: async () => ({ decision: "ALLOW" })
      },
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      undefined,
      undefined,
      new UnifiedAssetService(registry),
      undefined,
      aaService
    );
    const review = await reviewService.submitIntentV2(intent);
    expect(review.accepted).toBe(false);
    expect(buildCount).toBe(0);
  });

  it("fails closed when policy dependency times out and never builds/submits", async () => {
    let routeSubmitCount = 0;
    let buildCount = 0;
    const adapter: ExecutionAdapter = {
      name: "test",
      fetch_quote: async () => {
        throw new Error("should not fetch quote");
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
    const txBuilder = {
      build: async (): Promise<ExecutionBuildResult> => {
        buildCount += 1;
        throw new Error("should not be invoked");
      }
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };
    const service = new MarketsService(
      {
        pre_trade_check: async () => {
          throw new Error("policy timed out");
        },
        pre_settlement_check: async () => ({ decision: "ALLOW" })
      },
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      txBuilder
    );

    const result = await service.submitIntentV2(intent);
    expect(result).toEqual({
      accepted: false,
      reason_codes: ["policy_dependency_timeout"]
    });
    expect(buildCount).toBe(0);
    expect(routeSubmitCount).toBe(0);
  });

  it("records allow/blocked/failure metrics and emits sanitized execution events", async () => {
    const counters: Array<{ name: string; labels?: Record<string, string> }> = [];
    const events: Array<{ event_type: string; reason_code?: string; reason_codes?: readonly string[] }> = [];
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
      submit: async () => {
        throw new Error("adapter timeout");
      },
      cancel: async () => {}
    };
    const ledger: LedgerClient = {
      settle: async () => ({ settlement_id: "settle-1" })
    };
    const service = new MarketsService(
      policy,
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (event) => {
        events.push(event);
      },
      {
        incrementCounter: (name, labels) => {
          counters.push({ name, labels });
        }
      }
    );

    await expect(service.submitIntentV2(intent)).rejects.toThrow("adapter timeout");
    expect(counters.some((entry) => entry.name === "markets_allow_path_total")).toBe(true);
    expect(counters.some((entry) => entry.name === "markets_execution_failure_total")).toBe(true);
    expect(events.some((entry) => entry.event_type === "markets.execution.allowed")).toBe(true);
    expect(events.some((entry) => entry.event_type === "markets.execution.failed")).toBe(true);

    const denied = new MarketsService(
      {
        pre_trade_check: async () => ({
          decision: "REVIEW",
          policy_version: "policy-risk@2.0.0",
          explanation: "Review",
          reason_codes: ["policy_review_required"]
        }),
        pre_settlement_check: async () => ({ decision: "ALLOW" })
      },
      new ExecutionRouter(adapter),
      new QuoteValidator(),
      ledger,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (event) => {
        events.push(event);
      },
      {
        incrementCounter: (name, labels) => {
          counters.push({ name, labels });
        }
      }
    );
    await denied.submitIntentV2(intent);
    expect(counters.some((entry) => entry.name === "markets_execution_blocked_total")).toBe(true);
    expect(events.some((entry) => entry.event_type === "markets.execution.blocked")).toBe(true);
  });
});

describe("ensurePolicyReasonCodes", () => {
  it("returns fallback policy code when empty", () => {
    expect(ensurePolicyReasonCodes([])).toEqual(["policy_denied"]);
  });
});
