export interface SettlementRequest {
  order_id: string;
  route_id: string;
  reference_id: string;
  correlation_id: string;
}

export interface SettlementResponse {
  settlement_id: string;
  chainId?: number;
  txHash?: string;
  blockNumber?: number;
  status?: "submitted" | "pending" | "confirmed" | "finalized" | "failed";
}

export interface LedgerClient {
  settle(request: SettlementRequest): Promise<SettlementResponse>;
}
