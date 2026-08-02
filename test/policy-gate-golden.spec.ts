import { describe, expect, it } from "vitest";

import { normalizePolicyDecision } from "../src/adapters/policy-client.js";

describe("policy gate golden outputs", () => {
  it("normalizes legacy DENY decision deterministically", () => {
    const normalized = normalizePolicyDecision({
      decision: "DENY",
      reason_codes: []
    });

    expect(normalized).toEqual({
      decision: "DENY",
      policy_version: "policy-risk@legacy",
      explanation: "Trade intent denied by policy-risk gate",
      reason_codes: ["policy_denied"]
    });
  });

  it("normalizes legacy REVIEW decision deterministically", () => {
    const normalized = normalizePolicyDecision({
      decision: "REVIEW"
    });

    expect(normalized).toEqual({
      decision: "REVIEW",
      policy_version: "policy-risk@legacy",
      explanation: "Trade intent requires manual policy review",
      reason_codes: ["policy_review_required"]
    });
  });

  it("normalizes legacy ALLOW decision deterministically", () => {
    const normalized = normalizePolicyDecision({
      decision: "ALLOW"
    });

    expect(normalized).toEqual({
      decision: "ALLOW",
      policy_version: "policy-risk@legacy",
      explanation: "Trade intent passed policy-risk gate",
      reason_codes: []
    });
  });
});
