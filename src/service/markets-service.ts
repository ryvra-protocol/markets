import { ensureRouteReasonCodes } from "../adapters/execution-adapter.js";
import type { LedgerClient } from "../adapters/ledger-client.js";
import { ensurePolicyReasonCodes } from "../adapters/policy-client.js";
import { normalizePolicyDecision } from "../adapters/policy-client.js";
import type { PreTradePolicyInput } from "../adapters/policy-client.js";
import type { PolicyClient } from "../adapters/policy-client.js";
import type { TradeIntent } from "../domain/trade-intent.js";
import type { ExecutionRouter } from "../routing/execution-router.js";
import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";
import type { Aa4337UserOpService } from "./aa4337-userop-service.js";
import type { QuoteValidator } from "./quote-validator.js";
import {
  QuoteConstraintViolationError,
  type ExecutionBuildInput,
  type ExecutionTxBuildClient
} from "./execution-tx-builder.js";
import { UnifiedAssetNormalizationError, type UnifiedAssetPair, type UnifiedAssetService } from "./unified-asset-service.js";

export type SubmitIntentResult =
  | { accepted: true; route_id: string; reference_id: string; correlation_id: string }
  | { accepted: false; reason_codes: [string, ...string[]] };

export type SubmitIntentV2Result =
  | { accepted: true; route_id: string; reference_id: string; correlation_id: string }
  | {
      accepted: false;
      review_required: true;
      policy_version: string;
      reason_codes: [string, ...string[]];
      explanation: string;
    }
  | {
      accepted: false;
      review_required?: false;
      reason_codes: [string, ...string[]];
    };

export class PolicyDeniedError extends Error {
  readonly decision = "DENY" as const;

  constructor(
    readonly policy_version: string,
    readonly reason_codes: [string, ...string[]],
    readonly explanation: string
  ) {
    super(explanation);
    this.name = "PolicyDeniedError";
  }
}

export interface PolicyDecisionObservedEvent {
  event_type: "markets.policy.decision";
  timestamp: string;
  correlation_id: string;
  reference_id: string;
  policy: {
    decision: "ALLOW" | "DENY" | "REVIEW";
    policy_version: string;
    reason_codes: readonly string[];
    explanation: string;
  };
  sanitized_context: {
    has_trade_intent: boolean;
    has_quote: boolean;
    has_fee_breakdown: boolean;
    has_execution_plan: boolean;
  };
}

export type PolicyDecisionObserver = (event: PolicyDecisionObservedEvent) => void | Promise<void>;

export interface SettlementSubmissionObservedEvent {
  event_type: "settlement.submitted";
  timestamp: string;
  settlement_id: string;
  intent_id: string;
  execution_id: string;
  correlation_id: string;
  chainId?: number;
  txHash?: string;
  blockNumber?: number;
  status: "submitted";
}

export type SettlementSubmissionObserver = (event: SettlementSubmissionObservedEvent) => void | Promise<void>;

export interface AssetNormalizationObservedEvent {
  event_type: "markets.asset.normalization";
  timestamp: string;
  correlation_id: string;
  reference_id: string;
  chain_id: number;
  assets: {
    base_asset_canonical_id: string;
    quote_asset_canonical_id: string;
  };
}

export type AssetNormalizationObserver = (event: AssetNormalizationObservedEvent) => void | Promise<void>;

export interface MarketsExecutionObservedEvent {
  event_type: "markets.execution.allowed" | "markets.execution.blocked" | "markets.execution.failed";
  timestamp: string;
  correlation_id: string;
  reference_id: string;
  idempotency_key: string;
  reason_codes?: readonly string[];
  reason_code?: string;
}

export type MarketsExecutionObserver = (event: MarketsExecutionObservedEvent) => void | Promise<void>;

export interface MarketsExecutionMetricsRecorder {
  incrementCounter(name: string, labels?: Record<string, string>): void;
}

interface NormalizedExecutionMetadata {
  chain_id: number;
  target: string;
  calldata: string;
  value: string;
  recipient: string;
  amount_type: "exactIn" | "exactOut";
  amount_in: string;
  amount_out: string;
  min_out?: string;
  max_in?: string;
  nonce?: string;
  input_token_address: string;
  output_token_address: string;
  input_token_decimals: number;
  output_token_decimals: number;
  quote_amount_in: string;
  quote_amount_out: string;
  quote_input_token_decimals: number;
  quote_output_token_decimals: number;
  paymaster?: string;
  paymaster_chain_id?: number;
  paymaster_account_id?: string;
  deadline: string;
}

function normalizeAddress(value: string): string {
  return value.trim().toLowerCase();
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = `${error.name}:${error.message}`.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("etimedout") ||
    message.includes("abort")
  );
}

export class MarketsService {
  private readonly idempotentResults = new Map<string, SubmitIntentV2Result>();
  private readonly idempotentErrors = new Map<string, PolicyDeniedError>();

  constructor(
    private readonly policy: PolicyClient,
    private readonly router: ExecutionRouter,
    private readonly quoteValidator: QuoteValidator,
    private readonly ledger: LedgerClient,
    private readonly policyDecisionObserver?: PolicyDecisionObserver,
    private readonly executionTxBuilder?: ExecutionTxBuildClient,
    private readonly settlementSubmissionObserver?: SettlementSubmissionObserver,
    private readonly unifiedAssetService?: UnifiedAssetService,
    private readonly assetNormalizationObserver?: AssetNormalizationObserver,
    private readonly aa4337UserOpService?: Aa4337UserOpService,
    private readonly executionObserver?: MarketsExecutionObserver,
    private readonly metrics?: MarketsExecutionMetricsRecorder
  ) {}

  async submitIntent(intent: MarketIntent): Promise<SubmitIntentResult> {
    try {
      const result = await this.submitIntentV2(intent);
      if (!result.accepted && result.review_required) {
        return {
          accepted: false,
          reason_codes: result.reason_codes
        };
      }

      return result;
    } catch (error) {
      if (error instanceof PolicyDeniedError) {
        return {
          accepted: false,
          reason_codes: error.reason_codes
        };
      }

      throw error;
    }
  }

  async submitIntentV2(intent: MarketIntent): Promise<SubmitIntentV2Result> {
    const idempotencyCacheKey = `${intent.account_id ?? ""}:${intent.idempotency_key}`;
    const replayError = this.idempotentErrors.get(idempotencyCacheKey);
    if (replayError) {
      throw replayError;
    }

    const replayResult = this.idempotentResults.get(idempotencyCacheKey);
    if (replayResult) {
      return replayResult;
    }

    const executionChainId = this.resolveExecutionChainId(intent);

    let unifiedAssetContext: Awaited<ReturnType<UnifiedAssetService["normalize_pre_trade_assets"]>> | undefined;
    try {
      unifiedAssetContext = await this.resolveUnifiedAssetContext(intent, executionChainId);
    } catch (error) {
      const reason =
        error instanceof UnifiedAssetNormalizationError
          ? error.reason_code
          : isTimeoutError(error)
            ? "unified_asset_dependency_timeout"
            : "unified_asset_dependency_ambiguous";
      return this.blockExecution(intent, idempotencyCacheKey, [reason]);
    }

    const policyInput = this.toPreTradePolicyInput(
      intent,
      unifiedAssetContext?.assets,
      unifiedAssetContext?.exposure,
      executionChainId
    );

    let policyDecision: ReturnType<typeof normalizePolicyDecision>;
    try {
      const rawPolicyDecision = this.policy.pre_trade_check_with_context
        ? await this.policy.pre_trade_check_with_context(policyInput)
        : await this.policy.pre_trade_check(intent);
      policyDecision = normalizePolicyDecision(rawPolicyDecision);
    } catch (error) {
      const reasonCode = isTimeoutError(error) ? "policy_dependency_timeout" : "policy_dependency_ambiguous";
      return this.blockExecution(intent, idempotencyCacheKey, [reasonCode]);
    }

    await this.observePolicyDecision(intent, policyInput, policyDecision);

    if (policyDecision.decision === "DENY") {
      const deniedError = new PolicyDeniedError(
        policyDecision.policy_version,
        ensurePolicyReasonCodes(policyDecision.reason_codes),
        policyDecision.explanation
      );
      await this.observeExecutionBlocked(intent, deniedError.reason_codes);
      this.idempotentErrors.set(idempotencyCacheKey, deniedError);
      throw deniedError;
    }
    if (policyDecision.decision === "REVIEW") {
      const reviewResult = {
        accepted: false as const,
        review_required: true as const,
        policy_version: policyDecision.policy_version,
        reason_codes: ensurePolicyReasonCodes(policyDecision.reason_codes, "policy_review_required"),
        explanation: policyDecision.explanation
      };
      await this.observeExecutionBlocked(intent, reviewResult.reason_codes);
      this.idempotentResults.set(idempotencyCacheKey, reviewResult);
      return reviewResult;
    }

    await this.observeExecutionAllowed(intent);

    try {
      if (executionChainId <= 0 && (this.executionTxBuilder || this.aa4337UserOpService || this.unifiedAssetService)) {
        return this.blockExecution(intent, idempotencyCacheKey, ["execution_chain_invalid"]);
      }
      const quote = await this.router.fetch_quote(intent);
      if (!this.quoteValidator.isValid(intent, quote)) {
        return this.blockExecution(intent, idempotencyCacheKey, ["quote_invalid"]);
      }

      await this.observeAssetNormalization(intent, executionChainId, unifiedAssetContext?.assets);
      const requiresExecutionMetadata = Boolean(this.executionTxBuilder || this.aa4337UserOpService);
      const normalizedExecution = requiresExecutionMetadata
        ? this.toNormalizedExecutionMetadata(intent, executionChainId, unifiedAssetContext?.assets)
        : undefined;

      if (this.executionTxBuilder) {
        await this.executionTxBuilder.build(
          this.toExecutionBuildInput(intent, quote, policyDecision, normalizedExecution!, unifiedAssetContext?.assets)
        );
      }
      if (this.aa4337UserOpService && !unifiedAssetContext?.assets) {
        throw new QuoteConstraintViolationError("aa4337 execution requires normalized unified assets");
      }
      if (this.aa4337UserOpService && unifiedAssetContext?.assets) {
        await this.aa4337UserOpService.execute(
          this.toAa4337ExecutionInput(intent, unifiedAssetContext.assets, normalizedExecution!)
        );
      }

      const route = await this.router.route(intent, quote);
      if (route.status !== "accepted") {
        return this.blockExecution(intent, idempotencyCacheKey, ensureRouteReasonCodes(route.reason_codes));
      }
      if (route.correlation_id !== intent.correlation_id) {
        throw new QuoteConstraintViolationError("route correlation_id must match intent correlation_id");
      }
      if (route.reference_id !== intent.reference_id) {
        throw new QuoteConstraintViolationError("route reference_id must match intent reference_id");
      }

      const settlement = await this.ledger.settle({
        order_id: intent.reference_id,
        route_id: route.route_id,
        reference_id: route.reference_id,
        correlation_id: route.correlation_id
      });
      await this.observeSettlementSubmission(intent, route.route_id, route.correlation_id, settlement);

      const acceptedResult = {
        accepted: true as const,
        route_id: route.route_id,
        reference_id: route.reference_id,
        correlation_id: route.correlation_id
      };
      this.idempotentResults.set(idempotencyCacheKey, acceptedResult);
      return acceptedResult;
    } catch (error) {
      await this.observeExecutionFailure(intent, this.toExecutionFailureReasonCode(error));
      throw error;
    }
  }

  private async blockExecution(
    intent: MarketIntent,
    idempotencyCacheKey: string,
    reason_codes: [string, ...string[]]
  ): Promise<SubmitIntentV2Result> {
    const blocked = {
      accepted: false as const,
      reason_codes
    };
    this.idempotentResults.set(idempotencyCacheKey, blocked);
    await this.observeExecutionBlocked(intent, reason_codes);
    return blocked;
  }

  private toExecutionFailureReasonCode(error: unknown): string {
    if (error instanceof QuoteConstraintViolationError) {
      return "execution_guardrail_violation";
    }
    if (error instanceof Error && isTimeoutError(error)) {
      return "execution_dependency_timeout";
    }
    return "execution_dependency_failed";
  }

  private async observeExecutionAllowed(intent: MarketIntent): Promise<void> {
    await this.executionObserver?.({
      event_type: "markets.execution.allowed",
      timestamp: new Date().toISOString(),
      correlation_id: intent.correlation_id,
      reference_id: intent.reference_id,
      idempotency_key: intent.idempotency_key
    });
    this.metrics?.incrementCounter("markets_allow_path_total", { chain_id: intent.meta?.execution_chain_id?.trim() || "unknown" });
  }

  private async observeExecutionBlocked(intent: MarketIntent, reason_codes: readonly string[]): Promise<void> {
    await this.executionObserver?.({
      event_type: "markets.execution.blocked",
      timestamp: new Date().toISOString(),
      correlation_id: intent.correlation_id,
      reference_id: intent.reference_id,
      idempotency_key: intent.idempotency_key,
      reason_codes
    });
    this.metrics?.incrementCounter("markets_execution_blocked_total", {
      reason_code: reason_codes[0] ?? "unknown"
    });
  }

  private async observeExecutionFailure(intent: MarketIntent, reason_code: string): Promise<void> {
    await this.executionObserver?.({
      event_type: "markets.execution.failed",
      timestamp: new Date().toISOString(),
      correlation_id: intent.correlation_id,
      reference_id: intent.reference_id,
      idempotency_key: intent.idempotency_key,
      reason_code
    });
    this.metrics?.incrementCounter("markets_execution_failure_total", { reason_code });
  }

  private async observeSettlementSubmission(
    intent: MarketIntent,
    executionId: string,
    correlationId: string,
    settlement: { settlement_id: string; chainId?: number; txHash?: string; blockNumber?: number }
  ): Promise<void> {
    if (!this.settlementSubmissionObserver) {
      return;
    }

    await this.settlementSubmissionObserver({
      event_type: "settlement.submitted",
      timestamp: new Date().toISOString(),
      settlement_id: settlement.settlement_id,
      intent_id: intent.reference_id,
      execution_id: executionId,
      correlation_id: correlationId,
      chainId: settlement.chainId,
      txHash: settlement.txHash,
      blockNumber: settlement.blockNumber,
      status: "submitted"
    });
  }

  private toPreTradePolicyInput(
    intent: MarketIntent,
    assets?: UnifiedAssetPair,
    exposure?: PreTradePolicyInput["domain_context"]["exposure_snapshot"],
    chainId?: number
  ): PreTradePolicyInput {
    return {
      intent,
      domain_context: {
        trade_intent: this.toTradeIntent(intent, assets, chainId),
        unified_assets: assets,
        exposure_snapshot: exposure
      }
    };
  }

  private toTradeIntent(intent: MarketIntent, assets?: UnifiedAssetPair, chainId?: number): TradeIntent {
    const createdAt = intent.created_at ? new Date(intent.created_at) : new Date();
    const createdAtMs = Number.isNaN(createdAt.getTime()) ? Date.now() : createdAt.getTime();
    const deadline = new Date(createdAtMs + intent.ttl_ms).toISOString();

    const isBuy = intent.side === "buy";
    const baseAsset = assets?.base_asset.canonical_id ?? intent.base_asset;
    const quoteAsset = assets?.quote_asset.canonical_id ?? intent.quote_asset;
    return {
      intent_id: intent.reference_id,
      correlation_id: intent.correlation_id,
      idempotency_key: intent.idempotency_key,
      side: intent.side,
      pair: `${baseAsset}/${quoteAsset}`,
      assetIn: isBuy ? quoteAsset : baseAsset,
      assetOut: isBuy ? baseAsset : quoteAsset,
      amount: {
        type: "exactIn",
        value: String(intent.size)
      },
      accountId: intent.account_id,
      chainId: chainId ?? 0,
      slippageBps: intent.max_slippage_bps,
      deadline,
      metadata: intent.meta
    };
  }

  private toExecutionBuildInput(
    intent: MarketIntent,
    quote: Quote,
    policyDecision: {
      decision: "ALLOW";
      policy_version: string;
      reason_codes?: readonly `policy_${string}`[];
      explanation: string;
    },
    normalizedExecution: NormalizedExecutionMetadata,
    assets?: UnifiedAssetPair
  ): ExecutionBuildInput {
    return {
      correlationId: intent.correlation_id,
      idempotencyKey: intent.idempotency_key,
      policyDecision,
      chainId: normalizedExecution.chain_id,
      target: normalizedExecution.target,
      calldata: normalizedExecution.calldata,
      value: normalizedExecution.value,
      recipient: normalizedExecution.recipient,
      slippageBps: intent.max_slippage_bps,
      deadline: normalizedExecution.deadline,
      amountType: normalizedExecution.amount_type,
      amountIn: normalizedExecution.amount_in,
      amountOut: normalizedExecution.amount_out,
      minOut: normalizedExecution.min_out,
      maxIn: normalizedExecution.max_in,
      nonce: normalizedExecution.nonce,
      inputToken: {
        symbol: intent.side === "buy" ? (assets?.quote_asset.symbol ?? quote.quote_asset) : (assets?.base_asset.symbol ?? quote.base_asset),
        address: normalizedExecution.input_token_address,
        decimals: normalizedExecution.input_token_decimals
      },
      outputToken: {
        symbol: intent.side === "buy" ? (assets?.base_asset.symbol ?? quote.base_asset) : (assets?.quote_asset.symbol ?? quote.quote_asset),
        address: normalizedExecution.output_token_address,
        decimals: normalizedExecution.output_token_decimals
      },
      quote: {
        amountIn: normalizedExecution.quote_amount_in,
        amountOut: normalizedExecution.quote_amount_out,
        inputTokenDecimals: normalizedExecution.quote_input_token_decimals,
        outputTokenDecimals: normalizedExecution.quote_output_token_decimals
      }
    };
  }

  private async observePolicyDecision(
    intent: MarketIntent,
    input: PreTradePolicyInput,
    policyDecision: {
      decision: "ALLOW" | "DENY" | "REVIEW";
      policy_version: string;
      reason_codes?: readonly string[];
      explanation: string;
    }
  ): Promise<void> {
    if (!this.policyDecisionObserver) {
      return;
    }

    await this.policyDecisionObserver({
      event_type: "markets.policy.decision",
      timestamp: new Date().toISOString(),
      correlation_id: intent.correlation_id,
      reference_id: intent.reference_id,
      policy: {
        decision: policyDecision.decision,
        policy_version: policyDecision.policy_version,
        reason_codes: policyDecision.reason_codes ?? [],
        explanation: policyDecision.explanation
      },
      sanitized_context: {
        has_trade_intent: Boolean(input.domain_context.trade_intent),
        has_quote: Boolean(input.domain_context.quote),
        has_fee_breakdown: Boolean(input.domain_context.fee_breakdown),
        has_execution_plan: Boolean(input.domain_context.execution_plan)
      }
    });
  }

  private toAa4337ExecutionInput(
    intent: MarketIntent,
    assets: UnifiedAssetPair,
    normalizedExecution: NormalizedExecutionMetadata
  ): Parameters<Aa4337UserOpService["execute"]>[0] {
    return {
      correlation_id: intent.correlation_id,
      reference_id: intent.reference_id,
      idempotency_key: intent.idempotency_key,
      side: intent.side,
      size: intent.size,
      chain_id: normalizedExecution.chain_id,
      account_id: intent.account_id,
      paymaster: normalizedExecution.paymaster,
      paymaster_chain_id: normalizedExecution.paymaster_chain_id,
      paymaster_account_id: normalizedExecution.paymaster_account_id,
      amount_in: normalizedExecution.amount_in,
      amount_out: normalizedExecution.amount_out,
      execution_target: normalizedExecution.target,
      execution_calldata: normalizedExecution.calldata,
      execution_value: normalizedExecution.value,
      execution_recipient: normalizedExecution.recipient,
      deadline: normalizedExecution.deadline,
      nonce: normalizedExecution.nonce,
      input_token_decimals: normalizedExecution.input_token_decimals,
      output_token_decimals: normalizedExecution.output_token_decimals,
      quote_input_token_decimals: normalizedExecution.quote_input_token_decimals,
      quote_output_token_decimals: normalizedExecution.quote_output_token_decimals,
      assets
    };
  }

  private resolveExecutionChainId(intent: MarketIntent): number {
    const value = intent.meta?.execution_chain_id?.trim();
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return 0;
    }
    return parsed;
  }

  private async resolveUnifiedAssetContext(
    intent: MarketIntent,
    chainId: number
  ): Promise<Awaited<ReturnType<UnifiedAssetService["normalize_pre_trade_assets"]>> | undefined> {
    if (!this.unifiedAssetService || chainId <= 0) {
      return undefined;
    }

    return this.unifiedAssetService.normalize_pre_trade_assets({
      base_asset: intent.base_asset,
      quote_asset: intent.quote_asset,
      chain_id: chainId,
      account_id: intent.account_id,
      correlation_id: intent.correlation_id
    });
  }

  private toNormalizedExecutionMetadata(
    intent: MarketIntent,
    executionChainId: number,
    assets?: UnifiedAssetPair
  ): NormalizedExecutionMetadata {
    const metadata = intent.meta ?? {};
    const required = (key: string): string => {
      const value = metadata[key]?.trim();
      if (!value) {
        throw new QuoteConstraintViolationError(`missing required execution metadata: ${key}`);
      }
      return value;
    };
    const requiredInteger = (key: string): number => {
      const value = Number(required(key));
      if (!Number.isInteger(value)) {
        throw new QuoteConstraintViolationError(`invalid integer execution metadata: ${key}`);
      }
      return value;
    };

    const createdAt = intent.created_at ? new Date(intent.created_at) : new Date();
    const createdAtMs = Number.isNaN(createdAt.getTime()) ? Date.now() : createdAt.getTime();

    const normalized: NormalizedExecutionMetadata = {
      chain_id: requiredInteger("execution_chain_id"),
      target: normalizeAddress(required("execution_target")),
      calldata: required("execution_calldata").toLowerCase(),
      value: (metadata.execution_value ?? "0").trim(),
      recipient: normalizeAddress(required("execution_recipient")),
      amount_type: metadata.execution_amount_type === "exactOut" ? "exactOut" : "exactIn",
      amount_in: required("execution_amount_in"),
      amount_out: required("execution_amount_out"),
      min_out: metadata.execution_min_out?.trim(),
      max_in: metadata.execution_max_in?.trim(),
      nonce: metadata.execution_nonce?.trim(),
      input_token_address: normalizeAddress(required("execution_input_token_address")),
      output_token_address: normalizeAddress(required("execution_output_token_address")),
      input_token_decimals: requiredInteger("execution_input_token_decimals"),
      output_token_decimals: requiredInteger("execution_output_token_decimals"),
      quote_amount_in: required("execution_quote_amount_in"),
      quote_amount_out: required("execution_quote_amount_out"),
      quote_input_token_decimals: requiredInteger("execution_quote_input_token_decimals"),
      quote_output_token_decimals: requiredInteger("execution_quote_output_token_decimals"),
      paymaster: metadata.aa4337_paymaster?.trim(),
      paymaster_chain_id: metadata.aa4337_paymaster_chain_id ? requiredInteger("aa4337_paymaster_chain_id") : undefined,
      paymaster_account_id: metadata.aa4337_paymaster_account_id?.trim(),
      deadline: new Date(createdAtMs + intent.ttl_ms).toISOString()
    };

    if (normalized.chain_id !== executionChainId) {
      throw new QuoteConstraintViolationError("execution chain metadata is inconsistent");
    }

    if (assets) {
      if (assets.base_asset.chain_id !== executionChainId || assets.quote_asset.chain_id !== executionChainId) {
        throw new QuoteConstraintViolationError("normalized asset chain_id is inconsistent with execution chain");
      }
      const expectedInputAsset = intent.side === "buy" ? assets.quote_asset : assets.base_asset;
      const expectedOutputAsset = intent.side === "buy" ? assets.base_asset : assets.quote_asset;
      if (
        normalized.input_token_decimals !== expectedInputAsset.decimals ||
        normalized.quote_input_token_decimals !== expectedInputAsset.decimals
      ) {
        throw new QuoteConstraintViolationError("input token decimals are inconsistent with normalized assets");
      }
      if (
        normalized.output_token_decimals !== expectedOutputAsset.decimals ||
        normalized.quote_output_token_decimals !== expectedOutputAsset.decimals
      ) {
        throw new QuoteConstraintViolationError("output token decimals are inconsistent with normalized assets");
      }
      const normalizedInputAssetAddress = expectedInputAsset.address?.toLowerCase();
      if (normalizedInputAssetAddress && normalizedInputAssetAddress !== normalized.input_token_address) {
        throw new QuoteConstraintViolationError("input token address is inconsistent with normalized assets");
      }
      const normalizedOutputAssetAddress = expectedOutputAsset.address?.toLowerCase();
      if (normalizedOutputAssetAddress && normalizedOutputAssetAddress !== normalized.output_token_address) {
        throw new QuoteConstraintViolationError("output token address is inconsistent with normalized assets");
      }
    }

    return normalized;
  }

  private async observeAssetNormalization(
    intent: MarketIntent,
    chainId: number,
    assets?: UnifiedAssetPair
  ): Promise<void> {
    if (!this.assetNormalizationObserver || !assets) {
      return;
    }

    await this.assetNormalizationObserver({
      event_type: "markets.asset.normalization",
      timestamp: new Date().toISOString(),
      correlation_id: intent.correlation_id,
      reference_id: intent.reference_id,
      chain_id: chainId,
      assets: {
        base_asset_canonical_id: assets.base_asset.canonical_id,
        quote_asset_canonical_id: assets.quote_asset.canonical_id
      }
    });
  }
}
