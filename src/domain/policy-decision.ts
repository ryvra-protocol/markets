export type PolicyDecisionType = "ALLOW" | "DENY" | "REVIEW";

export interface PolicyDecision {
  decision: PolicyDecisionType;
  reason_codes: string[];
  policy_version: string;
}
