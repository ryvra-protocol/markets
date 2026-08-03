import type {
  Aa4337AssetDescriptor,
  Aa4337BuildUserOperationInput,
  AccountsRuntimeClient
} from "../adapters/accounts-runtime-client.js";
import type { UnifiedAssetPair } from "./unified-asset-service.js";

export class Aa4337ExecutionError extends Error {
  constructor(
    message: string,
    readonly reason_code:
      | "aa4337_chain_account_incompatible"
      | "aa4337_paymaster_incompatible"
      | "aa4337_amount_decimals_mismatch"
      | "aa4337_replay_detected"
      | "aa4337_simulation_failed"
      | "aa4337_submission_failed"
      | "aa4337_receipt_failed"
  ) {
    super(message);
    this.name = "Aa4337ExecutionError";
  }
}

export interface Aa4337SubmittedObservedEvent {
  event_type: "markets.aa4337.userop.submitted";
  timestamp: string;
  correlation_id: string;
  reference_id: string;
  chain_id: number;
  user_operation_hash: string;
}

export interface Aa4337IncludedObservedEvent {
  event_type: "markets.aa4337.userop.included";
  timestamp: string;
  correlation_id: string;
  reference_id: string;
  chain_id: number;
  user_operation_hash: string;
  transaction_hash?: string;
  block_number?: number;
}

export interface Aa4337FailedObservedEvent {
  event_type: "markets.aa4337.userop.failed";
  timestamp: string;
  correlation_id: string;
  reference_id: string;
  chain_id: number;
  reason_code: Aa4337ExecutionError["reason_code"];
}

export type Aa4337ExecutionObservedEvent =
  | Aa4337SubmittedObservedEvent
  | Aa4337IncludedObservedEvent
  | Aa4337FailedObservedEvent;

export type Aa4337ExecutionObserver = (event: Aa4337ExecutionObservedEvent) => void | Promise<void>;

export interface Aa4337ExecutionInput {
  correlation_id: string;
  reference_id: string;
  idempotency_key: string;
  side: "buy" | "sell";
  size: number;
  chain_id: number;
  account_id?: string;
  paymaster?: string;
  paymaster_chain_id?: number;
  paymaster_account_id?: string;
  amount_in: string;
  amount_out: string;
  execution_target: string;
  execution_calldata: string;
  execution_value: string;
  execution_recipient: string;
  deadline: string;
  nonce?: string;
  input_token_decimals: number;
  output_token_decimals: number;
  quote_input_token_decimals: number;
  quote_output_token_decimals: number;
  assets: UnifiedAssetPair;
}

function normalizeAddress(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : undefined;
}

function normalizeReasonCode(reasonCode: string | undefined, fallback: Aa4337ExecutionError["reason_code"]) {
  const normalized = reasonCode?.trim();
  return normalized && normalized.startsWith("aa4337_") ? normalized : fallback;
}

function toAssetDescriptor(asset: UnifiedAssetPair["base_asset"]): Aa4337AssetDescriptor {
  return {
    canonical_id: asset.canonical_id,
    symbol: asset.symbol,
    decimals: asset.decimals,
    address: normalizeAddress(asset.address)
  };
}

export function normalizeAa4337BuildRequest(input: Aa4337ExecutionInput): Aa4337BuildUserOperationInput {
  const accountId = input.account_id?.trim() ?? "";
  if (!accountId) {
    throw new Aa4337ExecutionError("account_id is required for aa4337 execution", "aa4337_chain_account_incompatible");
  }

  const paymaster = normalizeAddress(input.paymaster);
  const baseAsset = toAssetDescriptor(input.assets.base_asset);
  const quoteAsset = toAssetDescriptor(input.assets.quote_asset);
  const inputToken = input.side === "buy" ? quoteAsset : baseAsset;
  const outputToken = input.side === "buy" ? baseAsset : quoteAsset;

  return {
    correlation_id: input.correlation_id,
    idempotency_key: input.idempotency_key.trim(),
    reference_id: input.reference_id,
    chain_id: input.chain_id,
    account_id: accountId,
    paymaster,
    trade: {
      side: input.side,
      size: String(input.size),
      base_asset: baseAsset,
      quote_asset: quoteAsset,
      amount_in: input.amount_in.trim(),
      amount_out: input.amount_out.trim()
    },
    execution: {
      target: normalizeAddress(input.execution_target) ?? "",
      calldata: input.execution_calldata.trim().toLowerCase(),
      value: input.execution_value.trim(),
      recipient: normalizeAddress(input.execution_recipient) ?? "",
      deadline: input.deadline,
      nonce: input.nonce?.trim(),
      input_token: inputToken,
      output_token: outputToken
    }
  };
}

export class Aa4337UserOpService {
  private readonly idempotencyKeys = new Set<string>();

  constructor(
    private readonly runtime: AccountsRuntimeClient,
    private readonly observer?: Aa4337ExecutionObserver
  ) {}

  async execute(input: Aa4337ExecutionInput): Promise<void> {
    try {
      this.assertGuardrails(input);

      const buildInput = normalizeAa4337BuildRequest(input);
      const built = await this.runtime.build(buildInput);
      const simulation = await this.runtime.simulate(built);
      if (!simulation.success) {
        throw new Aa4337ExecutionError(
          "aa4337 user operation simulation failed",
          normalizeReasonCode(simulation.reason_code, "aa4337_simulation_failed") as Aa4337ExecutionError["reason_code"]
        );
      }

      const sendResult = await this.runtime.send(built);
      await this.observer?.({
        event_type: "markets.aa4337.userop.submitted",
        timestamp: new Date().toISOString(),
        correlation_id: input.correlation_id,
        reference_id: input.reference_id,
        chain_id: input.chain_id,
        user_operation_hash: sendResult.user_operation_hash
      });

      const receipt = await this.runtime.getReceipt({ user_operation_hash: sendResult.user_operation_hash });
      if (receipt.status !== "included") {
        throw new Aa4337ExecutionError(
          "aa4337 user operation was not included",
          normalizeReasonCode(receipt.reason_code, "aa4337_receipt_failed") as Aa4337ExecutionError["reason_code"]
        );
      }

      await this.observer?.({
        event_type: "markets.aa4337.userop.included",
        timestamp: new Date().toISOString(),
        correlation_id: input.correlation_id,
        reference_id: input.reference_id,
        chain_id: input.chain_id,
        user_operation_hash: sendResult.user_operation_hash,
        transaction_hash: receipt.transaction_hash,
        block_number: receipt.block_number
      });
    } catch (error) {
      const normalized =
        error instanceof Aa4337ExecutionError
          ? error
          : new Aa4337ExecutionError("aa4337 user operation submission failed", "aa4337_submission_failed");
      await this.observer?.({
        event_type: "markets.aa4337.userop.failed",
        timestamp: new Date().toISOString(),
        correlation_id: input.correlation_id,
        reference_id: input.reference_id,
        chain_id: input.chain_id,
        reason_code: normalized.reason_code
      });
      throw normalized;
    }
  }

  private assertGuardrails(input: Aa4337ExecutionInput): void {
    const accountId = input.account_id?.trim();
    if (!accountId) {
      throw new Aa4337ExecutionError("missing account_id for aa4337 path", "aa4337_chain_account_incompatible");
    }
    if (!Number.isInteger(input.chain_id) || input.chain_id <= 0) {
      throw new Aa4337ExecutionError("invalid chain_id for aa4337 path", "aa4337_chain_account_incompatible");
    }
    if (
      input.paymaster_chain_id !== undefined &&
      (input.paymaster_chain_id !== input.chain_id || !Number.isInteger(input.paymaster_chain_id))
    ) {
      throw new Aa4337ExecutionError("paymaster chain is incompatible", "aa4337_paymaster_incompatible");
    }
    if (
      input.paymaster_account_id !== undefined &&
      input.paymaster_account_id.trim().length > 0 &&
      input.paymaster_account_id.trim() !== accountId
    ) {
      throw new Aa4337ExecutionError("paymaster account is incompatible", "aa4337_paymaster_incompatible");
    }

    if (this.idempotencyKeys.has(input.idempotency_key)) {
      throw new Aa4337ExecutionError("duplicate idempotency_key for aa4337 path", "aa4337_replay_detected");
    }
    this.idempotencyKeys.add(input.idempotency_key);

    const expectedInputDecimals = input.side === "buy" ? input.assets.quote_asset.decimals : input.assets.base_asset.decimals;
    const expectedOutputDecimals = input.side === "buy" ? input.assets.base_asset.decimals : input.assets.quote_asset.decimals;
    if (input.input_token_decimals !== expectedInputDecimals || input.quote_input_token_decimals !== expectedInputDecimals) {
      throw new Aa4337ExecutionError("input token decimals are inconsistent", "aa4337_amount_decimals_mismatch");
    }
    if (
      input.output_token_decimals !== expectedOutputDecimals ||
      input.quote_output_token_decimals !== expectedOutputDecimals
    ) {
      throw new Aa4337ExecutionError("output token decimals are inconsistent", "aa4337_amount_decimals_mismatch");
    }

    if (!/^\d+$/.test(input.amount_in.trim()) || !/^\d+$/.test(input.amount_out.trim())) {
      throw new Aa4337ExecutionError("aa4337 amounts must be unsigned integer strings", "aa4337_amount_decimals_mismatch");
    }
  }
}
