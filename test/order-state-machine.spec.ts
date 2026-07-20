import { describe, expect, it } from "vitest";

import { OrderStateMachine } from "../src/service/order-state-machine.js";

describe("OrderStateMachine", () => {
  const machine = new OrderStateMachine();

  it("allows canonical forward transitions", () => {
    expect(machine.canTransition("created", "validated")).toBe(true);
    expect(machine.canTransition("validated", "routed")).toBe(true);
    expect(machine.canTransition("filled", "settled")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(machine.canTransition("created", "settled")).toBe(false);
    expect(machine.canTransition("settled", "filled")).toBe(false);
  });
});
