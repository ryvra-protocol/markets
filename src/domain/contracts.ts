import type { ExecutionPlan } from "./execution-plan.js";
import type { FeeBreakdown } from "./fee-breakdown.js";
import type { PolicyDecision } from "./policy-decision.js";
import type { NetQuote, RawQuote } from "./quote.js";
import type { SettlementEvent } from "./settlement-event.js";
import type { TradeIntent } from "./trade-intent.js";

export interface QuoteProvider {
  getRawQuote(intent: TradeIntent): Promise<RawQuote>;
}

export interface FeeEngine {
  computeNetQuote(input: {
    intent: TradeIntent;
    rawQuote: RawQuote;
    context?: Record<string, string>;
  }): Promise<{ feeBreakdown: FeeBreakdown; netQuote: NetQuote }>;
}

export interface PolicyClient {
  evaluate(intent: TradeIntent): Promise<PolicyDecision>;
}

export interface ExecutionPlanner {
  build(input: {
    intent: TradeIntent;
    policyDecision: PolicyDecision;
    rawQuote: RawQuote;
    feeBreakdown: FeeBreakdown;
    netQuote: NetQuote;
  }): Promise<ExecutionPlan>;
}

export interface SettlementEmitter {
  emit(event: SettlementEvent): Promise<void>;
}
