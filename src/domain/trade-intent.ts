export type TradeSide = "buy" | "sell";

export type TradeAmountType = "exactIn" | "exactOut";

export type ActorType = "USER" | "APP" | "AGENT";

export type ExecutionMode = "PUBLIC" | "PRIVATE" | "CONFIDENTIAL";

export type PrivacyMode = "TRANSPARENT" | "SHIELDED" | "CONFIDENTIAL";

export interface TradeAuthorityScopeReference {
  action: string;
  venue: string;
  instrument: string;
  approved: boolean;
  active: boolean;
}

export interface TradePolicyReference {
  decision: "ALLOW" | "DENY" | "REVIEW";
  compatible: boolean;
}

export interface TradeRiskReference {
  decision: "ALLOW" | "DENY" | "REVIEW";
  compatible: boolean;
  autonomy_level: string;
  within_limits: boolean;
}

export interface TradeFundingReference {
  required?: boolean;
  reservation_ready?: boolean;
  funding_ready?: boolean;
}

export interface TradeAuthorityReferences {
  mandate_scope?: TradeAuthorityScopeReference;
  policy?: TradePolicyReference;
  risk?: TradeRiskReference;
  funding?: TradeFundingReference;
  intent_expires_at?: string;
  user_operation_hash?: string;
}

export interface TradeAmount {
  type: TradeAmountType;
  value: string;
}

export interface TradeIntent {
  intent_id: string;
  correlation_id: string;
  idempotency_key: string;
  side: TradeSide;
  pair?: string;
  assetIn: string;
  assetOut: string;
  amount: TradeAmount;
  walletAddress?: string;
  accountId?: string;
  chainId: number;
  slippageBps: number;
  deadline: string;
  metadata?: Record<string, string>;
  actorType?: ActorType;
  actorId?: string;
  agentId?: string;
  mandateId?: string;
  riskAssessmentId?: string;
  authorizationId?: string;
  policyVersion?: string;
  policyHash?: string;
  privacyMode?: PrivacyMode;
  executionMode?: ExecutionMode;
  authority?: TradeAuthorityReferences;
}
