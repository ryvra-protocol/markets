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
}
