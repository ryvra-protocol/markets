import type { FeeEngine } from "../domain/contracts.js";
import type { FeeBreakdown } from "../domain/fee-breakdown.js";
import type { NetQuote, RawQuote } from "../domain/quote.js";
import type { TradeIntent } from "../domain/trade-intent.js";

import {
  assertValidFeePolicy,
  DEFAULT_FEE_POLICY,
  parseFeeComputationContext,
  type FeePolicy
} from "./fee-policy.js";
import { computeFeeRuleResult } from "./fee-rules.js";

function applyNetQuote(rawQuote: RawQuote, intent: TradeIntent, netAmount: string): NetQuote {
  if (intent.amount.type === "exactIn") {
    return {
      ...rawQuote,
      netAmountIn: rawQuote.amountIn,
      netAmountOut: netAmount,
      fee_policy_version: ""
    };
  }

  return {
    ...rawQuote,
    netAmountIn: netAmount,
    netAmountOut: rawQuote.amountOut,
    fee_policy_version: ""
  };
}

export class CustomFeeEngine implements FeeEngine {
  constructor(private readonly policy: FeePolicy = DEFAULT_FEE_POLICY) {
    assertValidFeePolicy(policy);
  }

  async computeNetQuote(input: {
    intent: TradeIntent;
    rawQuote: RawQuote;
    context?: Record<string, string>;
  }): Promise<{ feeBreakdown: FeeBreakdown; netQuote: NetQuote }> {
    const context = parseFeeComputationContext(input.context);
    const feeAsset = input.intent.amount.type === "exactIn" ? input.rawQuote.assetOut : input.rawQuote.assetIn;
    const grossAmount = input.intent.amount.type === "exactIn" ? input.rawQuote.amountOut : input.rawQuote.amountIn;

    const result = computeFeeRuleResult({
      grossAmountAtomic: grossAmount,
      defaultPolicy: this.policy,
      context
    });

    const feeBreakdown: FeeBreakdown = {
      fee_policy_version: result.fee_policy_version,
      asset: feeAsset,
      grossAmount: result.grossAmount,
      platformFee: result.platformFee,
      partnerFee: result.partnerFee,
      sponsorOffset: result.sponsorOffset,
      netAmount: result.netAmount
    };

    const netQuote = applyNetQuote(input.rawQuote, input.intent, result.netAmount);
    netQuote.fee_policy_version = result.fee_policy_version;

    return { feeBreakdown, netQuote };
  }
}
