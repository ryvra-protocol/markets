export interface FeePolicy {
  fee_policy_version: string;
  platformFeeBps: number;
  partnerShareBps: number;
  minFeeAtomic?: string;
  maxFeeAtomic?: string;
}

export interface FeeComputationContext {
  partnerShareBps?: number;
  sponsorOffsetAtomic?: string;
}

export const DEFAULT_FEE_POLICY: FeePolicy = {
  fee_policy_version: "fees@1.0.0",
  platformFeeBps: 0,
  partnerShareBps: 0
};

export function parseFeeComputationContext(context?: Record<string, string>): FeeComputationContext {
  if (!context) {
    return {};
  }

  const parsed: FeeComputationContext = {};

  if (context.partner_share_bps !== undefined) {
    const partnerShareBps = Number.parseInt(context.partner_share_bps, 10);
    if (!Number.isInteger(partnerShareBps) || partnerShareBps < 0 || partnerShareBps > 10_000) {
      throw new Error("INVALID_PARTNER_SHARE_BPS");
    }
    parsed.partnerShareBps = partnerShareBps;
  }

  if (context.sponsor_offset_atomic !== undefined) {
    if (!/^\d+$/.test(context.sponsor_offset_atomic)) {
      throw new Error("INVALID_SPONSOR_OFFSET");
    }
    parsed.sponsorOffsetAtomic = context.sponsor_offset_atomic;
  }

  return parsed;
}

export function assertValidFeePolicy(policy: FeePolicy): void {
  if (!policy.fee_policy_version.trim()) {
    throw new Error("MISSING_FEE_POLICY_VERSION");
  }
  if (!Number.isInteger(policy.platformFeeBps) || policy.platformFeeBps < 0 || policy.platformFeeBps > 10_000) {
    throw new Error("INVALID_PLATFORM_FEE_BPS");
  }
  if (!Number.isInteger(policy.partnerShareBps) || policy.partnerShareBps < 0 || policy.partnerShareBps > 10_000) {
    throw new Error("INVALID_PARTNER_SHARE_BPS");
  }

  if (policy.minFeeAtomic !== undefined && !/^\d+$/.test(policy.minFeeAtomic)) {
    throw new Error("INVALID_MIN_FEE");
  }
  if (policy.maxFeeAtomic !== undefined && !/^\d+$/.test(policy.maxFeeAtomic)) {
    throw new Error("INVALID_MAX_FEE");
  }

  if (
    policy.minFeeAtomic !== undefined &&
    policy.maxFeeAtomic !== undefined &&
    BigInt(policy.minFeeAtomic) > BigInt(policy.maxFeeAtomic)
  ) {
    throw new Error("INVALID_FEE_CAP_FLOOR");
  }
}
