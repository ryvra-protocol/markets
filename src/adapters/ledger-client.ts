export interface SettlementProvenance {
  actorType?: "USER" | "APP" | "AGENT";
  actorId?: string;
  agentId?: string;
  mandateId?: string;
  intentId?: string;
  authorizationId?: string;
  riskAssessmentId?: string;
  policyVersion?: string;
  policyHash?: string;
  userOperationHash?: string;
  executionMode?: "PUBLIC" | "PRIVATE" | "CONFIDENTIAL";
  privacyMode?: "TRANSPARENT" | "SHIELDED" | "CONFIDENTIAL";
}

export interface SettlementRequest {
  order_id: string;
  route_id: string;
  reference_id: string;
  correlation_id: string;
  provenance?: SettlementProvenance;
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
