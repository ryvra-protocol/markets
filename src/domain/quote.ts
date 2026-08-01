export interface QuoteRouteHop {
  poolId: string;
  feeTierBps: number;
  tokenIn: string;
  tokenOut: string;
}

export interface RawQuote {
  quote_id: string;
  intent_id: string;
  correlation_id: string;
  source: string;
  chainId: number;
  assetIn: string;
  assetOut: string;
  amountIn: string;
  amountOut: string;
  estimatedGasUnits?: string;
  estimatedPriceImpactBps?: number;
  route: QuoteRouteHop[];
  quotedAt: string;
  validUntil: string;
}

export interface NetQuote extends RawQuote {
  netAmountIn: string;
  netAmountOut: string;
  fee_policy_version: string;
}
