export type TradeSide = "buy" | "sell";

export type TradeAmountType = "exactIn" | "exactOut";

export interface TradeAmount {
  type: TradeAmountType;
  value: string;
}

export interface TradeIntent {
  intent_id: string;
  correlation_id: string;
  idempotency_key: string;
  side: TradeSide;
  pair?: string;
  assetIn: string;
  assetOut: string;
  amount: TradeAmount;
  walletAddress?: string;
  accountId?: string;
  chainId: number;
  slippageBps: number;
  deadline: string;
  metadata?: Record<string, string>;
}
