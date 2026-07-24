export type MarketSide = "buy" | "sell";

export interface MarketIntent {
  side: MarketSide;
  base_asset: string;
  quote_asset: string;
  size: number;
  max_slippage_bps: number;
  ttl_ms: number;
  reference_id: string;
  idempotency_key: string;
  correlation_id: string;
  account_id?: string;
  created_at?: string;
  meta?: Record<string, string>;
}
