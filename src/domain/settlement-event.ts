import { createHash } from "node:crypto";

import type { ExecutionPlan } from "./execution-plan.js";
import type { FeeBreakdown } from "./fee-breakdown.js";
import type { PolicyDecision } from "./policy-decision.js";
import type { RawQuote } from "./quote.js";

export type SettlementStatus = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";

export interface SettlementEvent {
  event_id: string;
  event_type: "markets.settlement";
  occurred_at: string;
  intent_id: string;
  quote_id: string;
  execution_id: string;
  correlation_id: string;
  idempotency_key: string;
  status: SettlementStatus;
  quote: Pick<RawQuote, "assetIn" | "assetOut" | "amountIn" | "amountOut">;
  fee: FeeBreakdown;
  policy: Pick<PolicyDecision, "decision" | "reason_codes" | "policy_version">;
  execution: Pick<ExecutionPlan, "expiry" | "routeSummary">;
  txHash?: string;
  metadata?: Record<string, string>;
}

export type SettlementLifecycleEventType =
  | "settlement.submitted"
  | "settlement.pending"
  | "settlement.confirmed"
  | "settlement.failed"
  | "settlement.reorg_detected"
  | "settlement.finalized"
  | "settlement.escalated";

export type SettlementLifecycleStatus =
  | "SUBMITTED"
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"
  | "REORG_DETECTED"
  | "FINALIZED"
  | "ESCALATED";

export interface SettlementLifecycleEvent {
  event_id: string;
  event_type: SettlementLifecycleEventType;
  correlation_id: string;
  intent_id: string;
  execution_id: string;
  chainId: number;
  txHash?: string;
  blockNumber?: number;
  status: SettlementLifecycleStatus;
  timestamp: string;
  reason_code?: string;
  error_code?: string;
  metadata?: Record<string, string>;
}

export interface SettlementLifecycleEventInput {
  event_type: SettlementLifecycleEventType;
  correlation_id: string;
  intent_id: string;
  execution_id: string;
  chainId: number;
  txHash?: string;
  blockNumber?: number;
  timestamp: string;
  reason_code?: string;
  error_code?: string;
  metadata?: Record<string, unknown>;
}

const STATUS_BY_EVENT_TYPE: Record<SettlementLifecycleEventType, SettlementLifecycleStatus> = {
  "settlement.submitted": "SUBMITTED",
  "settlement.pending": "PENDING",
  "settlement.confirmed": "CONFIRMED",
  "settlement.failed": "FAILED",
  "settlement.reorg_detected": "REORG_DETECTED",
  "settlement.finalized": "FINALIZED",
  "settlement.escalated": "ESCALATED"
};

const SENSITIVE_METADATA_KEY_PATTERN = /(secret|token|private|signature|key)/i;

function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: Record<string, string> = {};
  for (const key of Object.keys(metadata).sort()) {
    if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) {
      continue;
    }

    const value = metadata[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = String(value);
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function stableSerialize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableSerialize(item));
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const keys = Object.keys(objectValue).sort();
    const normalized: Record<string, unknown> = {};
    for (const key of keys) {
      normalized[key] = stableSerialize(objectValue[key]);
    }
    return normalized;
  }

  return value;
}

function deterministicEventId(payload: Omit<SettlementLifecycleEvent, "event_id">): string {
  return createHash("sha256").update(JSON.stringify(stableSerialize(payload))).digest("hex");
}

export function createSettlementLifecycleEvent(input: SettlementLifecycleEventInput): SettlementLifecycleEvent {
  const eventWithoutId: Omit<SettlementLifecycleEvent, "event_id"> = {
    event_type: input.event_type,
    correlation_id: input.correlation_id,
    intent_id: input.intent_id,
    execution_id: input.execution_id,
    chainId: input.chainId,
    txHash: input.txHash,
    blockNumber: input.blockNumber,
    status: STATUS_BY_EVENT_TYPE[input.event_type],
    timestamp: input.timestamp,
    reason_code: input.reason_code,
    error_code: input.error_code,
    metadata: sanitizeMetadata(input.metadata)
  };

  return {
    ...eventWithoutId,
    event_id: deterministicEventId(eventWithoutId)
  };
}
