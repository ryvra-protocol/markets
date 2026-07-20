import { describe, expect, it } from "vitest";

import type { MarketIntent } from "../src/types/market-intent.js";
import type { Quote } from "../src/types/quote.js";
import { QuoteValidator } from "../src/service/quote-validator.js";

const intent: MarketIntent = {
  side: "buy",
  baseAsset: "BTC",
  quoteAsset: "USD",
  size: 1,
  maxSlippageBps: 50,
  ttlMs: 30000,
  clientRef: "ref-1"
};

describe("QuoteValidator", () => {
  const validator = new QuoteValidator();

  it("accepts fresh matching quotes", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const quote: Quote = {
      quoteId: "q-1",
      baseAsset: "BTC",
      quoteAsset: "USD",
      side: "buy",
      price: 100000,
      maxSize: 2,
      validFrom: "2025-12-31T23:59:00.000Z",
      validUntil: "2026-01-01T00:01:00.000Z",
      source: "rfq"
    };

    expect(validator.isValid(intent, quote, now)).toBe(true);
  });

  it("rejects expired quotes", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const quote: Quote = {
      quoteId: "q-2",
      baseAsset: "BTC",
      quoteAsset: "USD",
      side: "buy",
      price: 100000,
      maxSize: 2,
      validFrom: "2025-12-31T23:50:00.000Z",
      validUntil: "2025-12-31T23:59:00.000Z",
      source: "rfq"
    };

    expect(validator.isValid(intent, quote, now)).toBe(false);
  });
});
