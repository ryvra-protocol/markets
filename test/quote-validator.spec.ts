import { describe, expect, it } from "vitest";

import type { MarketIntent } from "../src/types/market-intent.js";
import type { Quote } from "../src/types/quote.js";
import { QuoteValidator } from "../src/service/quote-validator.js";

const intent: MarketIntent = {
  side: "buy",
  base_asset: "BTC",
  quote_asset: "USD",
  size: 1,
  max_slippage_bps: 50,
  ttl_ms: 30000,
  reference_id: "ref-1",
  idempotency_key: "idem-1",
  correlation_id: "corr-1"
};

describe("QuoteValidator", () => {
  const validator = new QuoteValidator();

  it("accepts fresh matching quotes", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const quote: Quote = {
      quote_id: "q-1",
      base_asset: "BTC",
      quote_asset: "USD",
      side: "buy",
      price: 100000,
      max_size: 2,
      valid_from: "2025-12-31T23:59:00.000Z",
      valid_until: "2026-01-01T00:01:00.000Z",
      source: "rfq"
    };

    expect(validator.isValid(intent, quote, now)).toBe(true);
  });

  it("rejects expired quotes", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const quote: Quote = {
      quote_id: "q-2",
      base_asset: "BTC",
      quote_asset: "USD",
      side: "buy",
      price: 100000,
      max_size: 2,
      valid_from: "2025-12-31T23:50:00.000Z",
      valid_until: "2025-12-31T23:59:00.000Z",
      source: "rfq"
    };

    expect(validator.isValid(intent, quote, now)).toBe(false);
  });
});
