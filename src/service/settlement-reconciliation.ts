import {
  createSettlementLifecycleEvent,
  type SettlementLifecycleEvent,
  type SettlementLifecycleEventType
} from "../domain/settlement-event.js";

export type SettlementDiscrepancyCategory =
  | "amount_mismatch"
  | "fee_mismatch"
  | "status_mismatch"
  | "missing_receipt"
  | "stale_pending";

export interface SettlementDiscrepancy {
  category: SettlementDiscrepancyCategory;
  field: string;
  expected?: string;
  observed?: string;
  detail: string;
}

export type SettlementReconciliationStatus = "match" | "mismatch" | "pending" | "failed";

export interface SettlementReconciliationResult {
  status: SettlementReconciliationStatus;
  discrepancies: SettlementDiscrepancy[];
}

export interface IntendedExecutionSnapshot {
  chainId: number;
  status?: "submitted" | "pending" | "confirmed" | "finalized" | "failed";
  amountIn?: string;
  amountOut?: string;
  fee?: string;
}

export interface SubmittedTxSnapshot {
  chainId: number;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  maxFee?: string;
}

export interface OnchainReceiptSnapshot {
  txHash?: string;
  blockNumber?: number;
  status: "pending" | "confirmed" | "finalized" | "reverted" | "failed" | "dropped";
  amountIn?: string;
  amountOut?: string;
  feePaid?: string;
  confirmations?: number;
  observed_at?: string;
  reorg_detected?: boolean;
}

export interface SettlementReconciliationInput {
  intended: IntendedExecutionSnapshot;
  submitted: SubmittedTxSnapshot;
  receipt?: OnchainReceiptSnapshot;
  pendingStartedAt?: string;
  stalePendingThresholdMs?: number;
  now?: () => Date;
}

export function reconcileSettlement(input: SettlementReconciliationInput): SettlementReconciliationResult {
  const now = input.now ?? (() => new Date());
  const discrepancies: SettlementDiscrepancy[] = [];

  if (input.intended.chainId !== input.submitted.chainId) {
    discrepancies.push({
      category: "status_mismatch",
      field: "chainId",
      expected: String(input.intended.chainId),
      observed: String(input.submitted.chainId),
      detail: "submitted chain differs from intended execution"
    });
  }

  const compareString = (
    category: SettlementDiscrepancyCategory,
    field: string,
    expected: string | undefined,
    observed: string | undefined,
    detail: string
  ): void => {
    if (expected !== undefined && observed !== undefined && expected !== observed) {
      discrepancies.push({ category, field, expected, observed, detail });
    }
  };

  compareString(
    "amount_mismatch",
    "amountIn",
    input.intended.amountIn,
    input.submitted.amountIn,
    "submitted amountIn differs from intended amountIn"
  );
  compareString(
    "amount_mismatch",
    "amountOut",
    input.intended.amountOut,
    input.submitted.amountOut,
    "submitted amountOut differs from intended amountOut"
  );

  if (!input.receipt) {
    discrepancies.push({
      category: "missing_receipt",
      field: "receipt",
      detail: "on-chain receipt is not available"
    });

    const staleThreshold = input.stalePendingThresholdMs;
    if (staleThreshold !== undefined && input.pendingStartedAt) {
      const pendingStartedMs = new Date(input.pendingStartedAt).getTime();
      const pendingAgeMs = now().getTime() - pendingStartedMs;
      if (!Number.isNaN(pendingStartedMs) && pendingAgeMs > staleThreshold) {
        discrepancies.push({
          category: "stale_pending",
          field: "pending_age_ms",
          expected: `<=${staleThreshold}`,
          observed: String(pendingAgeMs),
          detail: "pending settlement age exceeds configured threshold"
        });
      }
    }

    return {
      status: discrepancies.some((entry) => entry.category === "stale_pending") ? "failed" : "pending",
      discrepancies
    };
  }

  compareString(
    "amount_mismatch",
    "receipt.amountIn",
    input.intended.amountIn,
    input.receipt.amountIn,
    "observed settled amountIn differs from expected amountIn"
  );
  compareString(
    "amount_mismatch",
    "receipt.amountOut",
    input.intended.amountOut,
    input.receipt.amountOut,
    "observed settled amountOut differs from expected amountOut"
  );
  compareString(
    "fee_mismatch",
    "receipt.feePaid",
    input.intended.fee,
    input.receipt.feePaid,
    "observed settled fee differs from expected fee"
  );
  compareString(
    "status_mismatch",
    "txHash",
    input.submitted.txHash,
    input.receipt.txHash,
    "receipt txHash differs from submitted txHash"
  );

  if (input.receipt.status === "reverted" || input.receipt.status === "failed" || input.receipt.status === "dropped") {
    discrepancies.push({
      category: "status_mismatch",
      field: "receipt.status",
      expected: "confirmed|finalized",
      observed: input.receipt.status,
      detail: "receipt outcome indicates failed settlement"
    });
    return { status: "failed", discrepancies };
  }

  if (input.receipt.status === "pending") {
    return { status: discrepancies.length === 0 ? "pending" : "mismatch", discrepancies };
  }

  return { status: discrepancies.length === 0 ? "match" : "mismatch", discrepancies };
}

export interface SettlementMetricsRecorder {
  incrementCounter(name: string, labels?: Record<string, string>): void;
  recordTiming(name: string, durationMs: number, labels?: Record<string, string>): void;
}

export interface SettlementLifecycleObserver {
  (event: SettlementLifecycleEvent): void | Promise<void>;
}

export interface SettlementRetryRequest {
  reason_code: "dropped_tx" | "stale_pending" | "missing_receipt_timeout";
  correlation_id: string;
  execution_id: string;
  txHash?: string;
}

export interface SettlementEscalationRequest {
  reason_code: string;
  correlation_id: string;
  execution_id: string;
  txHash?: string;
}

export interface SettlementTrackingHooks {
  getReceipt: (input: { settlement_id: string }) => Promise<OnchainReceiptSnapshot | undefined>;
  onRetryRequested?: (request: SettlementRetryRequest) => void | Promise<void>;
  onEscalationRequested?: (request: SettlementEscalationRequest) => void | Promise<void>;
}

export interface SettlementTrackingInput {
  settlement_id: string;
  correlation_id: string;
  intent_id: string;
  execution_id: string;
  chainId: number;
  txHash?: string;
  expected_amount_in?: string;
  expected_amount_out?: string;
  expected_fee?: string;
  submitted_amount_in?: string;
  submitted_amount_out?: string;
  submitted_max_fee?: string;
}

export interface SettlementTrackerConfig {
  pendingTimeoutMs: number;
  missingReceiptTimeoutMs: number;
  finalityConfirmations: number;
  maxPollAttempts: number;
}

export const DEFAULT_SETTLEMENT_TRACKER_CONFIG: SettlementTrackerConfig = {
  pendingTimeoutMs: 30_000,
  missingReceiptTimeoutMs: 45_000,
  finalityConfirmations: 12,
  maxPollAttempts: 3
};

export interface SettlementTrackingResult {
  lifecycle: "finalized" | "confirmed" | "failed" | "pending";
  reconciliation: SettlementReconciliationResult;
}

export class SettlementTracker {
  constructor(
    private readonly config: SettlementTrackerConfig = DEFAULT_SETTLEMENT_TRACKER_CONFIG,
    private readonly observer?: SettlementLifecycleObserver,
    private readonly metrics?: SettlementMetricsRecorder,
    private readonly now: () => Date = () => new Date()
  ) {}

  async track(input: SettlementTrackingInput, hooks: SettlementTrackingHooks): Promise<SettlementTrackingResult> {
    const startedAt = this.now();
    await this.emit("settlement.submitted", input, { timestamp: startedAt.toISOString() });

    let firstPendingAt: string | undefined;
    for (let attempt = 0; attempt < this.config.maxPollAttempts; attempt += 1) {
      const receipt = await hooks.getReceipt({ settlement_id: input.settlement_id });
      const reconciliation = reconcileSettlement({
        intended: {
          chainId: input.chainId,
          amountIn: input.expected_amount_in,
          amountOut: input.expected_amount_out,
          fee: input.expected_fee
        },
        submitted: {
          chainId: input.chainId,
          txHash: input.txHash,
          amountIn: input.submitted_amount_in,
          amountOut: input.submitted_amount_out,
          maxFee: input.submitted_max_fee
        },
        receipt,
        pendingStartedAt: firstPendingAt,
        stalePendingThresholdMs: this.config.pendingTimeoutMs,
        now: this.now
      });

      if (!receipt) {
        if (!firstPendingAt) {
          firstPendingAt = this.now().toISOString();
        }

        await this.emit("settlement.pending", input, {
          timestamp: this.now().toISOString(),
          reason_code: "missing_receipt"
        });

        const elapsedMs = this.now().getTime() - startedAt.getTime();
        if (elapsedMs >= this.config.missingReceiptTimeoutMs) {
          await this.failWithRetryAndEscalation(input, hooks, "missing_receipt_timeout", "missing_receipt_timeout");
          return { lifecycle: "failed", reconciliation };
        }
        continue;
      }

      if (receipt.reorg_detected) {
        await this.emit("settlement.reorg_detected", input, {
          timestamp: this.now().toISOString(),
          blockNumber: receipt.blockNumber,
          reason_code: "reorg_detected"
        });
      }

      if (receipt.status === "pending") {
        if (!firstPendingAt) {
          firstPendingAt = this.now().toISOString();
        }
        await this.emit("settlement.pending", input, {
          timestamp: this.now().toISOString(),
          blockNumber: receipt.blockNumber
        });

        const pendingAgeMs = this.now().getTime() - new Date(firstPendingAt).getTime();
        if (pendingAgeMs >= this.config.pendingTimeoutMs) {
          await this.failWithRetryAndEscalation(input, hooks, "stale_pending", "stale_pending");
          return { lifecycle: "failed", reconciliation };
        }
        continue;
      }

      if (receipt.status === "dropped") {
        await this.failWithRetryAndEscalation(input, hooks, "dropped_tx", "dropped_tx", receipt.blockNumber);
        return { lifecycle: "failed", reconciliation };
      }

      if (receipt.status === "reverted" || receipt.status === "failed") {
        await this.emit("settlement.failed", input, {
          timestamp: this.now().toISOString(),
          blockNumber: receipt.blockNumber,
          reason_code: "reverted_tx"
        });
        await this.emitEscalation(input, hooks, "reverted_tx");
        this.metrics?.incrementCounter("settlement_failure_total", { reason_code: "reverted_tx" });
        return { lifecycle: "failed", reconciliation };
      }

      await this.emit("settlement.confirmed", input, {
        timestamp: this.now().toISOString(),
        blockNumber: receipt.blockNumber
      });

      const timeToConfirmMs = this.now().getTime() - startedAt.getTime();
      this.metrics?.recordTiming("settlement_time_to_confirm_ms", timeToConfirmMs, { chainId: String(input.chainId) });

      if (reconciliation.status === "mismatch") {
        this.metrics?.incrementCounter("reconciliation_mismatch_total", { chainId: String(input.chainId) });
      }

      if ((receipt.confirmations ?? 0) >= this.config.finalityConfirmations || receipt.status === "finalized") {
        await this.emit("settlement.finalized", input, {
          timestamp: this.now().toISOString(),
          blockNumber: receipt.blockNumber
        });
        this.metrics?.incrementCounter("settlement_success_total", { chainId: String(input.chainId), state: "finalized" });
        return { lifecycle: "finalized", reconciliation };
      }

      this.metrics?.incrementCounter("settlement_success_total", { chainId: String(input.chainId), state: "confirmed" });
      return { lifecycle: "confirmed", reconciliation };
    }

    const reconciliation = reconcileSettlement({
      intended: {
        chainId: input.chainId,
        amountIn: input.expected_amount_in,
        amountOut: input.expected_amount_out,
        fee: input.expected_fee
      },
      submitted: {
        chainId: input.chainId,
        txHash: input.txHash,
        amountIn: input.submitted_amount_in,
        amountOut: input.submitted_amount_out,
        maxFee: input.submitted_max_fee
      },
      receipt: undefined,
      pendingStartedAt: startedAt.toISOString(),
      stalePendingThresholdMs: this.config.missingReceiptTimeoutMs,
      now: this.now
    });

    await this.failWithRetryAndEscalation(input, hooks, "missing_receipt_timeout", "missing_receipt_timeout");
    return { lifecycle: "failed", reconciliation };
  }

  private async failWithRetryAndEscalation(
    input: SettlementTrackingInput,
    hooks: SettlementTrackingHooks,
    reason: "dropped_tx" | "stale_pending" | "missing_receipt_timeout",
    reasonCode: string,
    blockNumber?: number
  ): Promise<void> {
    await this.emit("settlement.failed", input, {
      timestamp: this.now().toISOString(),
      blockNumber,
      reason_code: reasonCode
    });

    await hooks.onRetryRequested?.({
      reason_code: reason,
      correlation_id: input.correlation_id,
      execution_id: input.execution_id,
      txHash: input.txHash
    });

    await this.emitEscalation(input, hooks, reasonCode);
    this.metrics?.incrementCounter("settlement_failure_total", { reason_code: reasonCode });
  }

  private async emitEscalation(
    input: SettlementTrackingInput,
    hooks: SettlementTrackingHooks,
    reasonCode: string
  ): Promise<void> {
    await this.emit("settlement.escalated", input, {
      timestamp: this.now().toISOString(),
      reason_code: reasonCode
    });
    await hooks.onEscalationRequested?.({
      reason_code: reasonCode,
      correlation_id: input.correlation_id,
      execution_id: input.execution_id,
      txHash: input.txHash
    });
  }

  private async emit(
    type: SettlementLifecycleEventType,
    input: SettlementTrackingInput,
    options: { timestamp: string; blockNumber?: number; reason_code?: string }
  ): Promise<void> {
    if (!this.observer) {
      return;
    }

    await this.observer(
      createSettlementLifecycleEvent({
        event_type: type,
        correlation_id: input.correlation_id,
        intent_id: input.intent_id,
        execution_id: input.execution_id,
        chainId: input.chainId,
        txHash: input.txHash,
        blockNumber: options.blockNumber,
        timestamp: options.timestamp,
        reason_code: options.reason_code
      })
    );
  }
}
