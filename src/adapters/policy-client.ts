import type { ExecutionPlan } from "../domain/execution-plan.js";
import type { FeeBreakdown } from "../domain/fee-breakdown.js";
import type { RawQuote } from "../domain/quote.js";
import type { TradeIntent } from "../domain/trade-intent.js";
import type { ExposureSnapshot, UnifiedAsset } from "../domain/unified-asset.js";
import type { MarketIntent } from "../types/market-intent.js";

export const POLICY_REASON_CODE_PREFIX = "policy_" as const;

export type PolicyDecisionType = "ALLOW" | "DENY" | "REVIEW";
export type PolicyReasonCode = `${typeof POLICY_REASON_CODE_PREFIX}${string}`;
export type NonEmptyArray<T> = [T, ...T[]];

interface PolicyDecisionBase {
  decision: PolicyDecisionType;
  policy_version: string;
  explanation: string;
}

export type PolicyDecision =
  | (PolicyDecisionBase & { decision: "ALLOW"; reason_codes?: readonly PolicyReasonCode[] })
  | (PolicyDecisionBase & { decision: "REVIEW"; reason_codes: NonEmptyArray<PolicyReasonCode> })
  | (PolicyDecisionBase & { decision: "DENY"; reason_codes: NonEmptyArray<PolicyReasonCode> });

export type LegacyPolicyDecision =
  | { decision: "ALLOW" }
  | { decision: "REVIEW"; reason_codes?: PolicyReasonCode[] }
  | { decision: "DENY"; reason_codes?: readonly string[] };

export interface PolicyDomainContext {
  trade_intent?: TradeIntent;
  quote?: RawQuote;
  fee_breakdown?: FeeBreakdown;
  execution_plan?: ExecutionPlan;
  unified_assets?: {
    base_asset: UnifiedAsset;
    quote_asset: UnifiedAsset;
  };
  exposure_snapshot?: ExposureSnapshot;
}

export interface PreTradePolicyInput {
  intent: MarketIntent;
  domain_context: PolicyDomainContext;
}

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

function ensurePolicyVersion(version: string | undefined): string {
  const normalized = version?.trim();
  if (normalized) {
    return normalized;
  }

  return "policy-risk@legacy";
}

function ensureExplanation(explanation: string | undefined, fallback: string): string {
  const normalized = explanation?.trim();
  if (normalized) {
    return normalized;
  }

  return fallback;
}

export function normalizePolicyDecision(decision: PolicyDecision | LegacyPolicyDecision): PolicyDecision {
  if (decision.decision === "ALLOW") {
    return {
      decision: "ALLOW",
      policy_version: ensurePolicyVersion("policy_version" in decision ? decision.policy_version : undefined),
      explanation: ensureExplanation(
        "explanation" in decision ? decision.explanation : undefined,
        "Trade intent passed policy-risk gate"
      ),
      reason_codes: []
    };
  }

  if (decision.decision === "REVIEW") {
    return {
      decision: "REVIEW",
      policy_version: ensurePolicyVersion("policy_version" in decision ? decision.policy_version : undefined),
      explanation: ensureExplanation(
        "explanation" in decision ? decision.explanation : undefined,
        "Trade intent requires manual policy review"
      ),
      reason_codes: ensurePolicyReasonCodes(decision.reason_codes, "policy_review_required")
    };
  }

  return {
    decision: "DENY",
    policy_version: ensurePolicyVersion("policy_version" in decision ? decision.policy_version : undefined),
    explanation: ensureExplanation(
      "explanation" in decision ? decision.explanation : undefined,
      "Trade intent denied by policy-risk gate"
    ),
    reason_codes: ensurePolicyReasonCodes(decision.reason_codes, "policy_denied")
  };
}

export interface PolicyClient {
  pre_trade_check(intent: MarketIntent): Promise<PolicyDecision | LegacyPolicyDecision>;
  pre_trade_check_with_context?(input: PreTradePolicyInput): Promise<PolicyDecision | LegacyPolicyDecision>;
  pre_settlement_check(reference_id: string): Promise<PolicyDecision | LegacyPolicyDecision>;
}
