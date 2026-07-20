import type { MarketSide } from "./market-intent.js";

export interface Quote {
  quoteId: string;
  baseAsset: string;
  quoteAsset: string;
  side: MarketSide;
  price: number;
  maxSize: number;
  validFrom: string;
  validUntil: string;
  source: string;
}
