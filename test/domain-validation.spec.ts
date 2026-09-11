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

  it("requires programmable authority identifiers for agent flows", () => {
    expect(() =>
      assertValidTradeIntent(
        {
          ...validIntent,
          actorType: "AGENT",
          actorId: "actor-1",
          mandateId: "mandate-1",
          riskAssessmentId: "risk-1",
          authorizationId: "auth-1",
          policyVersion: "policy-risk@2.0.0"
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toThrow("agentId is required for agent flows");
  });

  it("rejects invalid execution or privacy modes", () => {
    expect(() =>
      assertValidTradeIntent(
        {
          ...validIntent,
          executionMode: "LOCAL" as never
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toThrow("executionMode is invalid");

    expect(() =>
      assertValidTradeIntent(
        {
          ...validIntent,
          privacyMode: "OPAQUE" as never
        },
        new Date("2026-01-01T00:00:00.000Z")
      )
    ).toThrow("privacyMode is invalid");
  });

  it("requires reason_codes on DENY decisions", () => {
    const deny: PolicyDecision = {
      decision: "DENY",
      reason_codes: [] as unknown as [string, ...string[]],
      explanation: "Denied",
      policy_version: "policy-risk@1.0.0"
    };

    expect(() => assertValidPolicyDecision(deny)).toThrow("DENY decisions require reason_codes");
  });

  it("requires explanation on policy decisions", () => {
    const deny: PolicyDecision = {
      decision: "DENY",
      reason_codes: ["policy_denied"],
      explanation: " ",
      policy_version: "policy-risk@1.0.0"
    };

    expect(() => assertValidPolicyDecision(deny)).toThrow("explanation is required");
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
