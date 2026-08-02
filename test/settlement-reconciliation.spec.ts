import { describe, expect, it } from "vitest";

import { createSettlementLifecycleEvent } from "../src/domain/settlement-event.js";
import {
  reconcileSettlement,
  SettlementTracker,
  type SettlementEscalationRequest,
  type SettlementLifecycleObserver,
  type SettlementMetricsRecorder,
  type SettlementRetryRequest
} from "../src/service/settlement-reconciliation.js";

function fixedNow(iso: string): () => Date {
  return () => new Date(iso);
}

describe("settlement lifecycle event transitions", () => {
  it("maps every PR6 lifecycle event to expected status", () => {
    const base = {
      correlation_id: "corr-1",
      intent_id: "intent-1",
      execution_id: "exec-1",
      chainId: 1,
      timestamp: "2026-01-01T00:00:00.000Z"
    };

    expect(createSettlementLifecycleEvent({ ...base, event_type: "settlement.submitted" }).status).toBe("SUBMITTED");
    expect(createSettlementLifecycleEvent({ ...base, event_type: "settlement.pending" }).status).toBe("PENDING");
    expect(createSettlementLifecycleEvent({ ...base, event_type: "settlement.confirmed" }).status).toBe("CONFIRMED");
    expect(createSettlementLifecycleEvent({ ...base, event_type: "settlement.failed" }).status).toBe("FAILED");
    expect(createSettlementLifecycleEvent({ ...base, event_type: "settlement.reorg_detected" }).status).toBe("REORG_DETECTED");
    expect(createSettlementLifecycleEvent({ ...base, event_type: "settlement.finalized" }).status).toBe("FINALIZED");
  });
});

describe("reconciliation classifier categories", () => {
  it("classifies amount, fee, and status mismatches", () => {
    const result = reconcileSettlement({
      intended: { chainId: 1, amountIn: "100", amountOut: "200", fee: "3" },
      submitted: { chainId: 10, txHash: "0xabc", amountIn: "100", amountOut: "210" },
      receipt: {
        txHash: "0xdef",
        status: "confirmed",
        amountIn: "110",
        amountOut: "200",
        feePaid: "5"
      }
    });

    expect(result.status).toBe("mismatch");
    expect(result.discrepancies.map((entry) => entry.category)).toEqual(
      expect.arrayContaining(["amount_mismatch", "fee_mismatch", "status_mismatch"])
    );
  });

  it("classifies missing receipt and stale pending", () => {
    const result = reconcileSettlement({
      intended: { chainId: 1 },
      submitted: { chainId: 1 },
      receipt: undefined,
      pendingStartedAt: "2026-01-01T00:00:00.000Z",
      stalePendingThresholdMs: 1,
      now: fixedNow("2026-01-01T00:00:00.010Z")
    });

    expect(result.status).toBe("failed");
    expect(result.discrepancies.map((entry) => entry.category)).toEqual(
      expect.arrayContaining(["missing_receipt", "stale_pending"])
    );
  });
});

describe("settlement tracker integration", () => {
  it("tracks happy path from submitted to confirmed/finalized", async () => {
    const observedTypes: string[] = [];
    const metrics: { counters: string[]; timings: number[] } = { counters: [], timings: [] };
    const observer: SettlementLifecycleObserver = (event) => {
      observedTypes.push(event.event_type);
    };
    const recorder: SettlementMetricsRecorder = {
      incrementCounter: (name) => metrics.counters.push(name),
      recordTiming: (_name, durationMs) => metrics.timings.push(durationMs)
    };

    const tracker = new SettlementTracker(
      { pendingTimeoutMs: 1000, missingReceiptTimeoutMs: 1000, finalityConfirmations: 2, maxPollAttempts: 2 },
      observer,
      recorder,
      fixedNow("2026-01-01T00:00:00.000Z")
    );

    const result = await tracker.track(
      {
        settlement_id: "sett-1",
        correlation_id: "corr-1",
        intent_id: "intent-1",
        execution_id: "exec-1",
        chainId: 1,
        txHash: "0xabc",
        expected_amount_in: "100",
        expected_amount_out: "200",
        expected_fee: "3",
        submitted_amount_in: "100",
        submitted_amount_out: "200"
      },
      {
        getReceipt: async () => ({
          txHash: "0xabc",
          status: "confirmed",
          blockNumber: 42,
          amountIn: "100",
          amountOut: "200",
          feePaid: "3",
          confirmations: 2
        })
      }
    );

    expect(result.lifecycle).toBe("finalized");
    expect(result.reconciliation.status).toBe("match");
    expect(observedTypes).toEqual(["settlement.submitted", "settlement.confirmed", "settlement.finalized"]);
    expect(metrics.counters).toContain("settlement_success_total");
    expect(metrics.timings.length).toBe(1);
  });

  it("handles reverted tx failure and escalation hook", async () => {
    const escalations: SettlementEscalationRequest[] = [];
    const observedTypes: string[] = [];
    const tracker = new SettlementTracker(
      { pendingTimeoutMs: 1000, missingReceiptTimeoutMs: 1000, finalityConfirmations: 12, maxPollAttempts: 1 },
      (event) => observedTypes.push(event.event_type),
      undefined,
      fixedNow("2026-01-01T00:00:00.000Z")
    );

    const result = await tracker.track(
      {
        settlement_id: "sett-2",
        correlation_id: "corr-2",
        intent_id: "intent-2",
        execution_id: "exec-2",
        chainId: 1,
        txHash: "0xdef"
      },
      {
        getReceipt: async () => ({ txHash: "0xdef", status: "reverted", blockNumber: 77 }),
        onEscalationRequested: async (request) => {
          escalations.push(request);
        }
      }
    );

    expect(result.lifecycle).toBe("failed");
    expect(result.reconciliation.status).toBe("failed");
    expect(observedTypes).toEqual(["settlement.submitted", "settlement.failed", "settlement.escalated"]);
    expect(escalations).toEqual([
      {
        reason_code: "reverted_tx",
        correlation_id: "corr-2",
        execution_id: "exec-2",
        txHash: "0xdef"
      }
    ]);
  });

  it("handles missing receipt timeout with retry + escalation", async () => {
    const retries: SettlementRetryRequest[] = [];
    const escalations: SettlementEscalationRequest[] = [];
    const observedTypes: string[] = [];

    const tracker = new SettlementTracker(
      { pendingTimeoutMs: 10, missingReceiptTimeoutMs: 0, finalityConfirmations: 12, maxPollAttempts: 1 },
      (event) => observedTypes.push(event.event_type),
      undefined,
      fixedNow("2026-01-01T00:00:00.000Z")
    );

    const result = await tracker.track(
      {
        settlement_id: "sett-3",
        correlation_id: "corr-3",
        intent_id: "intent-3",
        execution_id: "exec-3",
        chainId: 1,
        txHash: "0x123"
      },
      {
        getReceipt: async () => undefined,
        onRetryRequested: async (request) => {
          retries.push(request);
        },
        onEscalationRequested: async (request) => {
          escalations.push(request);
        }
      }
    );

    expect(result.lifecycle).toBe("failed");
    expect(observedTypes).toEqual([
      "settlement.submitted",
      "settlement.pending",
      "settlement.failed",
      "settlement.escalated"
    ]);
    expect(retries[0]?.reason_code).toBe("missing_receipt_timeout");
    expect(escalations[0]?.reason_code).toBe("missing_receipt_timeout");
  });

  it("detects mismatch path and records mismatch metrics", async () => {
    const metrics: string[] = [];
    const tracker = new SettlementTracker(
      { pendingTimeoutMs: 1000, missingReceiptTimeoutMs: 1000, finalityConfirmations: 1, maxPollAttempts: 1 },
      undefined,
      {
        incrementCounter: (name) => metrics.push(name),
        recordTiming: () => {}
      },
      fixedNow("2026-01-01T00:00:00.000Z")
    );

    const result = await tracker.track(
      {
        settlement_id: "sett-4",
        correlation_id: "corr-4",
        intent_id: "intent-4",
        execution_id: "exec-4",
        chainId: 1,
        txHash: "0x999",
        expected_amount_in: "100",
        expected_amount_out: "200",
        expected_fee: "2",
        submitted_amount_in: "100",
        submitted_amount_out: "200"
      },
      {
        getReceipt: async () => ({
          txHash: "0x999",
          status: "confirmed",
          blockNumber: 55,
          amountIn: "100",
          amountOut: "199",
          feePaid: "2",
          confirmations: 1
        })
      }
    );

    expect(result.lifecycle).toBe("finalized");
    expect(result.reconciliation.status).toBe("mismatch");
    expect(metrics).toContain("reconciliation_mismatch_total");
  });
});
