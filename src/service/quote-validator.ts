import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";

export class QuoteValidator {
  isValid(intent: MarketIntent, quote: Quote, now: Date = new Date()): boolean {
    const nowMs = now.getTime();
    const startMs = new Date(quote.validFrom).getTime();
    const endMs = new Date(quote.validUntil).getTime();

    return (
      intent.baseAsset === quote.baseAsset &&
      intent.quoteAsset === quote.quoteAsset &&
      intent.side === quote.side &&
      intent.size > 0 &&
      intent.size <= quote.maxSize &&
      Number.isFinite(intent.maxSlippageBps) &&
      intent.maxSlippageBps >= 0 &&
      nowMs >= startMs &&
      nowMs <= endMs
    );
  }
}
