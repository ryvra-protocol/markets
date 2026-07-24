export interface SettlementRequest {
  order_id: string;
  route_id: string;
  reference_id: string;
  correlation_id: string;
}

export interface LedgerClient {
  settle(request: SettlementRequest): Promise<{ settlement_id: string }>;
}
