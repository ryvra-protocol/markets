import type { PolicyDecision } from "./policy-decision.js";

export interface CalldataEnvelopePlaceholder {
  target: string;
  value: string;
  data: string;
  nonceDomainTag?: string;
}

export interface ExecutionPlan {
  execution_id: string;
  intent_id: string;
  quote_id: string;
  correlation_id: string;
  idempotency_key: string;
  routeSummary: {
    venue: string;
    hops: number;
  };
  minOut?: string;
  maxIn?: string;
  expiry: string;
  calldata: CalldataEnvelopePlaceholder;
  policy: Pick<PolicyDecision, "decision" | "reason_codes" | "policy_version">;
}
