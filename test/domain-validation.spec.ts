import { describe, expect, it } from "vitest";

import {
  assertFeeBreakdownIntegrity,
  assertValidPolicyDecision,
  assertValidTradeIntent,
  type FeeBreakdown,
  type PolicyDecision,
  type TradeIntent
} from "../src/domain/index.js";

describe("domain validation invariants", () => {
  const validIntent: TradeIntent = {
    intent_id: "intent-1",
    correlation_id: "corr-1",
    idempotency_key: "idem-1",
    side: "buy",
    assetIn: "USDC",
    assetOut: "WETH",
    amount: { type: "exactIn", value: "1000000" },
    chainId: 1,
    slippageBps: 50,
    deadline: "2027-01-01T00:00:00.000Z"
  };

  it("rejects invalid slippage", () => {
    expect(() =>
      assertValidTradeIntent({ ...validIntent, slippageBps: 10_001 }, new Date("2026-01-01T00:00:00.000Z"))
    ).toThrow("slippageBps out of range");
  });

  it("rejects non-future deadlines", () => {
    expect(() =>
      assertValidTradeIntent({ ...validIntent, deadline: "2026-01-01T00:00:00.000Z" }, new Date("2026-01-01T00:00:00.000Z"))
    ).toThrow("deadline must be a valid future timestamp");
  });

  it("requires reason_codes on DENY decisions", () => {
    const deny: PolicyDecision = {
      decision: "DENY",
      reason_codes: [],
      policy_version: "policy-risk@1.0.0"
    };

    expect(() => assertValidPolicyDecision(deny)).toThrow("DENY decisions require reason_codes");
  });

  it("enforces fee totals arithmetic integrity", () => {
    const validFee: FeeBreakdown = {
      fee_policy_version: "fees@1.0.0",
      asset: "USDC",
      grossAmount: "1000000",
      platformFee: "1000",
      partnerFee: "500",
      sponsorOffset: "200",
      netAmount: "998700"
    };

    expect(() => assertFeeBreakdownIntegrity(validFee)).not.toThrow();

    const invalidFee: FeeBreakdown = {
      ...validFee,
      netAmount: "998600"
    };

    expect(() => assertFeeBreakdownIntegrity(invalidFee)).toThrow("fee totals are inconsistent");
  });
});
