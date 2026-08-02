import type { FeeBreakdown } from "./fee-breakdown.js";
import type { PolicyDecision } from "./policy-decision.js";
import type { TradeIntent } from "./trade-intent.js";

const MAX_SLIPPAGE_BPS = 10_000;

function parseAtomicAmount(amount: string, field: string): bigint {
  if (!/^\d+$/.test(amount)) {
    throw new Error(`${field} must be an unsigned integer string`);
  }

  return BigInt(amount);
}

export function assertValidTradeIntent(intent: TradeIntent, now: Date = new Date()): void {
  if (intent.slippageBps < 0 || intent.slippageBps > MAX_SLIPPAGE_BPS) {
    throw new Error("slippageBps out of range");
  }

  const deadline = new Date(intent.deadline);
  if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= now.getTime()) {
    throw new Error("deadline must be a valid future timestamp");
  }

  if (!intent.intent_id || !intent.correlation_id || !intent.idempotency_key) {
    throw new Error("canonical identifiers are required");
  }
}

export function assertValidPolicyDecision(decision: PolicyDecision): void {
  if (!decision.policy_version.trim()) {
    throw new Error("policy_version is required");
  }
  if (!decision.explanation.trim()) {
    throw new Error("explanation is required");
  }

  if (decision.decision === "DENY" && decision.reason_codes.length === 0) {
    throw new Error("DENY decisions require reason_codes");
  }
  if (decision.decision === "REVIEW" && decision.reason_codes.length === 0) {
    throw new Error("REVIEW decisions require reason_codes");
  }
}

export function assertFeeBreakdownIntegrity(fee: FeeBreakdown): void {
  const grossAmount = parseAtomicAmount(fee.grossAmount, "grossAmount");
  const platformFee = parseAtomicAmount(fee.platformFee, "platformFee");
  const partnerFee = parseAtomicAmount(fee.partnerFee, "partnerFee");
  const sponsorOffset = parseAtomicAmount(fee.sponsorOffset, "sponsorOffset");
  const netAmount = parseAtomicAmount(fee.netAmount, "netAmount");

  const expectedNet = grossAmount - platformFee - partnerFee + sponsorOffset;
  if (expectedNet < 0n) {
    throw new Error("fee arithmetic produced negative net amount");
  }
  if (expectedNet !== netAmount) {
    throw new Error("fee totals are inconsistent");
  }
}
