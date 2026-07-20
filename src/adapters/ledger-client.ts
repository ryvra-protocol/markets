export interface SettlementRequest {
  orderId: string;
  routeId: string;
}

export interface LedgerClient {
  settle(request: SettlementRequest): Promise<{ settlementId: string }>;
}
