export interface Aa4337AssetDescriptor {
  canonical_id: string;
  symbol: string;
  decimals: number;
  address?: string;
}

export interface Aa4337BuildUserOperationInput {
  correlation_id: string;
  idempotency_key: string;
  reference_id: string;
  chain_id: number;
  account_id: string;
  paymaster?: string;
  trade: {
    side: "buy" | "sell";
    size: string;
    base_asset: Aa4337AssetDescriptor;
    quote_asset: Aa4337AssetDescriptor;
    amount_in: string;
    amount_out: string;
  };
  execution: {
    target: string;
    calldata: string;
    value: string;
    recipient: string;
    deadline: string;
    nonce?: string;
    input_token: Aa4337AssetDescriptor;
    output_token: Aa4337AssetDescriptor;
  };
}

export interface Aa4337BuiltUserOperation {
  user_operation: Record<string, unknown>;
}

export interface Aa4337SimulationResult {
  success: boolean;
  reason_code?: string;
}

export interface Aa4337SendResult {
  user_operation_hash: string;
}

export interface Aa4337ReceiptResult {
  status: "included" | "failed" | "pending";
  transaction_hash?: string;
  block_number?: number;
  reason_code?: string;
}

export interface AccountsRuntimeClient {
  build(input: Aa4337BuildUserOperationInput): Promise<Aa4337BuiltUserOperation>;
  simulate(input: Aa4337BuiltUserOperation): Promise<Aa4337SimulationResult>;
  send(input: Aa4337BuiltUserOperation): Promise<Aa4337SendResult>;
  getReceipt(input: { user_operation_hash: string }): Promise<Aa4337ReceiptResult>;
}
