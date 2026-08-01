import type { ExecutionPlan } from "./execution-plan.js";
import type { FeeBreakdown } from "./fee-breakdown.js";
import type { PolicyDecision } from "./policy-decision.js";
import type { RawQuote } from "./quote.js";

export type SettlementStatus = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";

export interface SettlementEvent {
  event_id: string;
  event_type: "markets.settlement";
  occurred_at: string;
  intent_id: string;
  quote_id: string;
  execution_id: string;
  correlation_id: string;
  idempotency_key: string;
  status: SettlementStatus;
  quote: Pick<RawQuote, "assetIn" | "assetOut" | "amountIn" | "amountOut">;
  fee: FeeBreakdown;
  policy: Pick<PolicyDecision, "decision" | "reason_codes" | "policy_version">;
  execution: Pick<ExecutionPlan, "expiry" | "routeSummary">;
  txHash?: string;
  metadata?: Record<string, string>;
}
