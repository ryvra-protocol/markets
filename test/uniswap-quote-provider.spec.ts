import { describe, expect, it } from "vitest";

import type { TradeIntent } from "../src/domain/trade-intent.js";
import { mapUniswapSnapshotToRawQuote, normalizeAtomicAmount } from "../src/adapters/uniswap/mappers.js";
import {
  UniswapQuoteProvider,
  type UniswapQuoteClient,
  type UniswapQuoteRequest,
  type UniswapQuoteResponse
} from "../src/adapters/uniswap/uniswap-quote-provider.js";

const baseIntent: TradeIntent = {
  intent_id: "intent-2",
  correlation_id: "corr-2",
  idempotency_key: "idem-2",
  side: "buy",
  assetIn: "USDC",
  assetOut: "WETH",
  amount: { type: "exactIn", value: "100" },
  chainId: 1,
  slippageBps: 30,
  deadline: "2027-01-01T00:01:00.000Z"
};

class MockClient implements UniswapQuoteClient {
  constructor(private readonly responseFactory: (request: UniswapQuoteRequest) => UniswapQuoteResponse) {}

  async getQuote(request: UniswapQuoteRequest): Promise<UniswapQuoteResponse> {
    return this.responseFactory(request);
  }
}

describe("UniswapQuoteProvider", () => {
  it("returns deterministic mapped raw quote", async () => {
    const quotedAt = "2027-01-01T00:00:00.000Z";
    const validUntil = "2027-01-01T00:00:30.000Z";

    const provider = new UniswapQuoteProvider(
      new MockClient(() => ({
        amountIn: "100.000000",
        amountOut: "0.0456789",
        quotedAt,
        validUntil,
        estimatedGasUnits: "210000.7",
        estimatedPriceImpactBps: 12,
        route: [
          {
            poolId: "0xpool-a",
            feeTierBps: 30,
            tokenIn: "USDC",
            tokenOut: "WETH"
          }
        ]
      })),
      undefined,
      () => new Date("2027-01-01T00:00:10.000Z")
    );

    const first = await provider.getRawQuote(baseIntent);
    const second = await provider.getRawQuote(baseIntent);

    expect(first).toEqual(second);
    expect(first.route).toEqual([
      {
        poolId: "0xpool-a",
        feeTierBps: 30,
        tokenIn: "USDC",
        tokenOut: "WETH"
      }
    ]);
    expect(first.amountIn).toBe("100000000000000000000");
    expect(first.amountOut).toBe("45678900000000000");
    expect(first.estimatedGasUnits).toBe("210001");
    expect(first.quote_id.startsWith("quote_")).toBe(true);
  });

  it("fails for unsupported pairs", async () => {
    const provider = new UniswapQuoteProvider(
      new MockClient(() => ({
        amountIn: "10",
        amountOut: "10",
        quotedAt: "2027-01-01T00:00:00.000Z",
        route: [
          {
            poolId: "0xpool-a",
            feeTierBps: 30,
            tokenIn: "USDC",
            tokenOut: "WETH"
          }
        ]
      })),
      undefined,
      () => new Date("2027-01-01T00:00:10.000Z")
    );

    await expect(provider.getRawQuote({ ...baseIntent, assetOut: "SOL" })).rejects.toMatchObject({
      code: "UNSUPPORTED_PAIR"
    });
  });

  it("fails on stale quotes", async () => {
    const provider = new UniswapQuoteProvider(
      new MockClient(() => ({
        amountIn: "10",
        amountOut: "10",
        quotedAt: "2027-01-01T00:00:00.000Z",
        validUntil: "2027-01-01T00:00:05.000Z",
        route: [
          {
            poolId: "0xpool-a",
            feeTierBps: 30,
            tokenIn: "USDC",
            tokenOut: "WETH"
          }
        ]
      })),
      undefined,
      () => new Date("2027-01-01T00:00:10.000Z")
    );

    await expect(provider.getRawQuote(baseIntent)).rejects.toMatchObject({
      code: "STALE_QUOTE"
    });
  });

  it("fails when no route is returned", async () => {
    const provider = new UniswapQuoteProvider(
      new MockClient(() => ({
        amountIn: "10",
        amountOut: "10",
        quotedAt: "2027-01-01T00:00:00.000Z",
        validUntil: "2027-01-01T00:00:30.000Z",
        route: []
      })),
      undefined,
      () => new Date("2027-01-01T00:00:10.000Z")
    );

    await expect(provider.getRawQuote(baseIntent)).rejects.toMatchObject({
      code: "NO_ROUTE"
    });
  });
});

describe("Uniswap mappers (golden normalization)", () => {
  it("applies deterministic numeric rounding policy", () => {
    expect(normalizeAtomicAmount("1.234567", 4, "floor")).toBe("12345");
    expect(normalizeAtomicAmount("1.234567", 4, "ceil")).toBe("12346");

    const rawQuote = mapUniswapSnapshotToRawQuote({
      source: "uniswap",
      intent: {
        ...baseIntent,
        amount: { type: "exactOut", value: "100" }
      },
      snapshot: {
        amountIn: "10.0000001",
        amountOut: "2.1234567",
        quotedAt: "2027-01-01T00:00:00.000Z",
        route: [
          {
            poolId: "0xpool-a",
            feeTierBps: 5,
            tokenIn: "USDC",
            tokenOut: "WETH"
          }
        ]
      },
      quoteTtlSeconds: 30,
      now: new Date("2027-01-01T00:00:01.000Z"),
      assetInDecimals: 6,
      assetOutDecimals: 6
    });

    expect(rawQuote.amountIn).toBe("10000001");
    expect(rawQuote.amountOut).toBe("2123457");
    expect(rawQuote.validUntil).toBe("2027-01-01T00:00:30.000Z");
  });
});
