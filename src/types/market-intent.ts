export type MarketSide = "buy" | "sell";

export interface MarketIntent {
  side: MarketSide;
  baseAsset: string;
  quoteAsset: string;
  size: number;
  maxSlippageBps: number;
  ttlMs: number;
  clientRef: string;
  accountId?: string;
  createdAt?: string;
  meta?: Record<string, string>;
}
