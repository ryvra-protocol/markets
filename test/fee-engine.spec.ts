import { describe, expect, it } from "vitest";

import { assertFeeBreakdownIntegrity, type RawQuote, type TradeIntent } from "../src/domain/index.js";
import { CustomFeeEngine } from "../src/fees/fee-engine.js";

const baseIntent: TradeIntent = {
  intent_id: "intent-fee-1",
  correlation_id: "corr-fee-1",
  idempotency_key: "idem-fee-1",
  side: "buy",
  assetIn: "USDC",
  assetOut: "WETH",
  amount: { type: "exactIn", value: "1000000" },
  chainId: 1,
  slippageBps: 20,
  deadline: "2027-01-01T00:00:00.000Z"
};

const baseRawQuote: RawQuote = {
  quote_id: "quote-1",
  intent_id: "intent-fee-1",
  correlation_id: "corr-fee-1",
  source: "uniswap",
  chainId: 1,
  assetIn: "USDC",
  assetOut: "WETH",
  amountIn: "1000000",
  amountOut: "500000",
  route: [
    {
      poolId: "pool-1",
      feeTierBps: 30,
      tokenIn: "USDC",
      tokenOut: "WETH"
    }
  ],
  quotedAt: "2027-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:30.000Z"
};

describe("CustomFeeEngine golden scenarios", () => {
  it("zero fee policy keeps gross == net", async () => {
    const engine = new CustomFeeEngine({
      fee_policy_version: "fees@zero",
      platformFeeBps: 0,
      partnerShareBps: 0
    });

    const { feeBreakdown, netQuote } = await engine.computeNetQuote({
      intent: baseIntent,
      rawQuote: baseRawQuote
    });

    expect(feeBreakdown.platformFee).toBe("0");
    expect(feeBreakdown.partnerFee).toBe("0");
    expect(feeBreakdown.netAmount).toBe(baseRawQuote.amountOut);
    expect(netQuote.netAmountOut).toBe(baseRawQuote.amountOut);
    assertFeeBreakdownIntegrity(feeBreakdown);
  });

  it("applies standard platform fee", async () => {
    const engine = new CustomFeeEngine({
      fee_policy_version: "fees@standard",
      platformFeeBps: 100,
      partnerShareBps: 0
    });

    const { feeBreakdown } = await engine.computeNetQuote({
      intent: baseIntent,
      rawQuote: baseRawQuote
    });

    expect(feeBreakdown.grossAmount).toBe("500000");
    expect(feeBreakdown.platformFee).toBe("5000");
    expect(feeBreakdown.partnerFee).toBe("0");
    expect(feeBreakdown.netAmount).toBe("495000");
    assertFeeBreakdownIntegrity(feeBreakdown);
  });

  it("supports partner split from total fee", async () => {
    const engine = new CustomFeeEngine({
      fee_policy_version: "fees@partner",
      platformFeeBps: 100,
      partnerShareBps: 4000
    });

    const { feeBreakdown } = await engine.computeNetQuote({
      intent: baseIntent,
      rawQuote: baseRawQuote
    });

    expect(feeBreakdown.platformFee).toBe("3000");
    expect(feeBreakdown.partnerFee).toBe("2000");
    expect(feeBreakdown.netAmount).toBe("495000");
    assertFeeBreakdownIntegrity(feeBreakdown);
  });

  it("applies sponsor offset with cap to total fee", async () => {
    const engine = new CustomFeeEngine({
      fee_policy_version: "fees@sponsor",
      platformFeeBps: 100,
      partnerShareBps: 0
    });

    const { feeBreakdown } = await engine.computeNetQuote({
      intent: baseIntent,
      rawQuote: baseRawQuote,
      context: {
        sponsor_offset_atomic: "9999999"
      }
    });

    expect(feeBreakdown.platformFee).toBe("5000");
    expect(feeBreakdown.sponsorOffset).toBe("5000");
    expect(feeBreakdown.netAmount).toBe("500000");
    assertFeeBreakdownIntegrity(feeBreakdown);
  });

  it("enforces floor and cap constraints", async () => {
    const lowGrossQuote: RawQuote = { ...baseRawQuote, amountOut: "1000" };
    const highGrossQuote: RawQuote = { ...baseRawQuote, amountOut: "5000000" };

    const engine = new CustomFeeEngine({
      fee_policy_version: "fees@bounds",
      platformFeeBps: 1,
      partnerShareBps: 0,
      minFeeAtomic: "50",
      maxFeeAtomic: "100"
    });

    const lowGross = await engine.computeNetQuote({
      intent: baseIntent,
      rawQuote: lowGrossQuote
    });
    const highGross = await engine.computeNetQuote({
      intent: baseIntent,
      rawQuote: highGrossQuote
    });

    expect(lowGross.feeBreakdown.platformFee).toBe("50");
    expect(highGross.feeBreakdown.platformFee).toBe("100");
    assertFeeBreakdownIntegrity(lowGross.feeBreakdown);
    assertFeeBreakdownIntegrity(highGross.feeBreakdown);
  });
});

describe("CustomFeeEngine sanity properties", () => {
  it("is monotonic: higher gross should not reduce total fees for uncapped policy", async () => {
    const engine = new CustomFeeEngine({
      fee_policy_version: "fees@mono",
      platformFeeBps: 100,
      partnerShareBps: 2500
    });

    const fees: bigint[] = [];
    for (const amountOut of ["1000", "2000", "5000", "10000", "20000"]) {
      const { feeBreakdown } = await engine.computeNetQuote({
        intent: baseIntent,
        rawQuote: { ...baseRawQuote, amountOut }
      });
      fees.push(BigInt(feeBreakdown.platformFee) + BigInt(feeBreakdown.partnerFee));
    }

    for (let i = 1; i < fees.length; i += 1) {
      expect(fees[i]).toBeGreaterThanOrEqual(fees[i - 1]);
    }
  });
});
