import type { OrderState } from "./order.js";

export interface EventEnvelope<TPayload = Record<string, unknown>> {
  event_id: string;
  correlation_id: string;
  reference_id: string;
  event_type: string;
  timestamp: string;
  payload: TPayload;
}

export type OrderLifecycleEventType = `order.${OrderState}`;

export interface OrderLifecycleEventEnvelope<TPayload = Record<string, unknown>>
  extends EventEnvelope<TPayload> {
  event_type: OrderLifecycleEventType;
}
