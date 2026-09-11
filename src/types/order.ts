import type { ActorType, ExecutionMode, PrivacyMode } from "../domain/trade-intent.js";

export const ORDER_LIFECYCLE_STATES = [
  "created",
  "validated",
  "routed",
  "partially_filled",
  "filled",
  "canceled",
  "expired",
  "failed",
  "settled"
] as const;

export type OrderState = (typeof ORDER_LIFECYCLE_STATES)[number];

export interface Order {
  id: string;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  state: OrderState;
  created_at: string;
  updated_at: string;
  actor_type?: ActorType;
  actor_id?: string;
  agent_id?: string;
  mandate_id?: string;
  risk_assessment_id?: string;
  authorization_id?: string;
  policy_version?: string;
  policy_hash?: string;
  intent_id?: string;
  privacy_mode?: PrivacyMode;
  execution_mode?: ExecutionMode;
  user_operation_hash?: string;
  tx_hash?: string;
  settlement_reference?: string;
}

export interface OrderAuditQueryFilters {
  account_id: string;
  reference_id?: string;
  correlation_id?: string;
  route_id?: string;
  intent_id?: string;
  agent_id?: string;
  mandate_id?: string;
}
