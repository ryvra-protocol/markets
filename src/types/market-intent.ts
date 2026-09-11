import type {
  ActorType,
  ExecutionMode,
  PrivacyMode,
  TradeAuthorityReferences
} from "../domain/trade-intent.js";

export type MarketSide = "buy" | "sell";

export interface MarketIntent {
  side: MarketSide;
  base_asset: string;
  quote_asset: string;
  size: number;
  max_slippage_bps: number;
  ttl_ms: number;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  account_id?: string;
  created_at?: string;
  meta?: Record<string, string>;
  actorType?: ActorType;
  actorId?: string;
  agentId?: string;
  mandateId?: string;
  riskAssessmentId?: string;
  authorizationId?: string;
  policyVersion?: string;
  policyHash?: string;
  intentId?: string;
  privacyMode?: PrivacyMode;
  executionMode?: ExecutionMode;
  authority?: TradeAuthorityReferences;
}
