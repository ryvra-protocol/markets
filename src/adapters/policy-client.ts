import type { MarketIntent } from "../types/market-intent.js";

export interface PolicyDecision {
  allowed: boolean;
  reasonCode?: string;
}

export interface PolicyClient {
  preTradeCheck(intent: MarketIntent): Promise<PolicyDecision>;
  preSettlementCheck(orderId: string): Promise<PolicyDecision>;
}
