export type PolicyDecisionType = "ALLOW" | "DENY" | "REVIEW";

interface PolicyDecisionBase {
  decision: PolicyDecisionType;
  policy_version: string;
  explanation: string;
}

export type PolicyDecision =
  | (PolicyDecisionBase & { decision: "ALLOW"; reason_codes?: string[] })
  | (PolicyDecisionBase & { decision: "DENY"; reason_codes: [string, ...string[]] })
  | (PolicyDecisionBase & { decision: "REVIEW"; reason_codes: [string, ...string[]] });
