import { describe, expect, it } from "vitest";

import type { ExecutionAdapter } from "../src/adapters/execution-adapter.js";
import type { LedgerClient } from "../src/adapters/ledger-client.js";
import type { PolicyClient, PolicyDecision } from "../src/adapters/policy-client.js";
import { ensurePolicyReasonCodes } from "../src/adapters/policy-client.js";
import { ExecutionRouter } from "../src/routing/execution-router.js";
import { MarketsService } from "../src/service/markets-service.js";
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
});

describe("ensurePolicyReasonCodes", () => {
  it("returns fallback policy code when empty", () => {
    expect(ensurePolicyReasonCodes([])).toEqual(["policy_denied"]);
  });
});
