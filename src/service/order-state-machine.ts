import type { OrderState } from "../types/order.js";

const transitions: Record<OrderState, ReadonlyArray<OrderState>> = {
  created: ["validated", "canceled", "expired", "failed"],
  validated: ["routed", "canceled", "expired", "failed"],
  routed: ["partially_filled", "filled", "canceled", "expired", "failed"],
  partially_filled: ["partially_filled", "filled", "canceled", "expired", "failed"],
  filled: ["settled", "failed"],
  canceled: [],
  expired: [],
  failed: [],
  settled: []
};

export class OrderStateMachine {
  canTransition(from: OrderState, to: OrderState): boolean {
    return transitions[from].includes(to);
  }
}
