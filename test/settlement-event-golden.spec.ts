import { describe, expect, it } from "vitest";

import { createSettlementLifecycleEvent } from "../src/domain/settlement-event.js";

describe("settlement lifecycle event golden payloads", () => {
  it("normalizes schema deterministically and sanitizes sensitive metadata", () => {
    const input = {
      event_type: "settlement.failed" as const,
      correlation_id: "corr-1",
      intent_id: "intent-1",
      execution_id: "exec-1",
      chainId: 1,
      txHash: "0xabc",
      blockNumber: 99,
      timestamp: "2026-01-01T00:00:00.000Z",
      reason_code: "reverted_tx",
      error_code: "EVM_REVERT",
      metadata: {
        zeta: "z",
        alpha: "a",
        apiToken: "do-not-emit",
        privateKey: "do-not-emit",
        attempts: 2,
        escalated: true
      }
    };

    const first = createSettlementLifecycleEvent(input);
    const second = createSettlementLifecycleEvent(input);

    expect(first).toEqual(second);
    expect(first).toEqual({
      event_id: "ca7db1f8f88ff8f251fc40d8a8f10fd7f8c1f4b0eb038f15b495f4868850d0e6",
      event_type: "settlement.failed",
      correlation_id: "corr-1",
      intent_id: "intent-1",
      execution_id: "exec-1",
      chainId: 1,
      txHash: "0xabc",
      blockNumber: 99,
      status: "FAILED",
      timestamp: "2026-01-01T00:00:00.000Z",
      reason_code: "reverted_tx",
      error_code: "EVM_REVERT",
      metadata: {
        alpha: "a",
        attempts: "2",
        escalated: "true",
        zeta: "z"
      }
    });
  });
});
