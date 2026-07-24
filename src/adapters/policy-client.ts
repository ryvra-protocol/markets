import type { MarketIntent } from "../types/market-intent.js";

export const POLICY_REASON_CODE_PREFIX = "policy_" as const;

export type PolicyDecisionType = "ALLOW" | "DENY" | "REVIEW";
export type PolicyReasonCode = `${typeof POLICY_REASON_CODE_PREFIX}${string}`;
export type NonEmptyArray<T> = [T, ...T[]];

export type PolicyDecision =
  | { decision: "ALLOW" }
  | { decision: "REVIEW"; reason_codes?: PolicyReasonCode[] }
  | { decision: "DENY"; reason_codes: NonEmptyArray<PolicyReasonCode> };

export function isPolicyReasonCode(value: string): value is PolicyReasonCode {
  return value.startsWith(POLICY_REASON_CODE_PREFIX) && value.length > POLICY_REASON_CODE_PREFIX.length;
}

export function ensurePolicyReasonCodes(
  reason_codes: readonly string[] | undefined,
  fallback: PolicyReasonCode = "policy_denied"
): NonEmptyArray<PolicyReasonCode> {
  const normalized = (reason_codes ?? []).filter(isPolicyReasonCode);
  if (normalized.length === 0) {
    return [fallback];
  }

  return normalized as NonEmptyArray<PolicyReasonCode>;
}

export interface PolicyClient {
  pre_trade_check(intent: MarketIntent): Promise<PolicyDecision>;
  pre_settlement_check(reference_id: string): Promise<PolicyDecision>;
}
