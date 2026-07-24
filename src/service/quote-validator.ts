import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";

export class QuoteValidator {
  isValid(intent: MarketIntent, quote: Quote, now: Date = new Date()): boolean {
    const nowMs = now.getTime();
    const startMs = new Date(quote.valid_from).getTime();
    const endMs = new Date(quote.valid_until).getTime();

    return (
      intent.base_asset === quote.base_asset &&
      intent.quote_asset === quote.quote_asset &&
      intent.side === quote.side &&
      intent.size > 0 &&
      intent.size <= quote.max_size &&
      Number.isFinite(intent.max_slippage_bps) &&
      intent.max_slippage_bps >= 0 &&
      nowMs >= startMs &&
      nowMs <= endMs
    );
  }
}
