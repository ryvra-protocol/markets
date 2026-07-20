export type OrderState =
  | "created"
  | "validated"
  | "routed"
  | "partially_filled"
  | "filled"
  | "canceled"
  | "expired"
  | "failed"
  | "settled";

export interface Order {
  id: string;
  clientRef: string;
  state: OrderState;
  createdAt: string;
  updatedAt: string;
}
