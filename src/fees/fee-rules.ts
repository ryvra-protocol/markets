import type { FeeComputationContext, FeePolicy } from "./fee-policy.js";

export interface FeeRuleInput {
  grossAmountAtomic: string;
  defaultPolicy: FeePolicy;
  context?: FeeComputationContext;
}

export interface FeeRuleResult {
  fee_policy_version: string;
  grossAmount: string;
  platformFee: string;
  partnerFee: string;
  sponsorOffset: string;
  netAmount: string;
}

const BPS_DENOMINATOR = 10_000n;

function parseAtomicAmount(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }

  return BigInt(value);
}

function mulDivFloor(amount: bigint, numerator: bigint, denominator: bigint): bigint {
  return (amount * numerator) / denominator;
}

function applyFeeCapFloor(totalFee: bigint, policy: FeePolicy): bigint {
  let nextFee = totalFee;

  if (policy.minFeeAtomic !== undefined) {
    const minFee = BigInt(policy.minFeeAtomic);
    if (nextFee < minFee) {
      nextFee = minFee;
    }
  }

  if (policy.maxFeeAtomic !== undefined) {
    const maxFee = BigInt(policy.maxFeeAtomic);
    if (nextFee > maxFee) {
      nextFee = maxFee;
    }
  }

  return nextFee;
}

export function computeFeeRuleResult(input: FeeRuleInput): FeeRuleResult {
  const grossAmount = parseAtomicAmount(input.grossAmountAtomic, "gross_amount");
  const policy = input.defaultPolicy;

  const totalFeeBeforeCaps = mulDivFloor(grossAmount, BigInt(policy.platformFeeBps), BPS_DENOMINATOR);
  const totalFee = applyFeeCapFloor(totalFeeBeforeCaps, policy);

  const partnerShareBps = input.context?.partnerShareBps ?? policy.partnerShareBps;
  const partnerFee = mulDivFloor(totalFee, BigInt(partnerShareBps), BPS_DENOMINATOR);
  const platformFee = totalFee - partnerFee;

  const requestedSponsorOffset = input.context?.sponsorOffsetAtomic
    ? parseAtomicAmount(input.context.sponsorOffsetAtomic, "sponsor_offset")
    : 0n;

  const sponsorOffset = requestedSponsorOffset > totalFee ? totalFee : requestedSponsorOffset;
  const netAmount = grossAmount - platformFee - partnerFee + sponsorOffset;

  if (netAmount < 0n) {
    throw new Error("NEGATIVE_NET_AMOUNT");
  }

  return {
    fee_policy_version: policy.fee_policy_version,
    grossAmount: grossAmount.toString(),
    platformFee: platformFee.toString(),
    partnerFee: partnerFee.toString(),
    sponsorOffset: sponsorOffset.toString(),
    netAmount: netAmount.toString()
  };
}
