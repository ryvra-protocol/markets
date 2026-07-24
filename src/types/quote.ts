import type { MarketSide } from "./market-intent.js";

export interface Quote {
  quote_id: string;
  base_asset: string;
  quote_asset: string;
  side: MarketSide;
  price: number;
  max_size: number;
  valid_from: string;
  valid_until: string;
  source: string;
}
