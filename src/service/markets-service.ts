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
import type { QuoteValidator } from "./quote-validator.js";
import {
  QuoteConstraintViolationError,
  type ExecutionBuildInput,
  type ExecutionTxBuildClient
} from "./execution-tx-builder.js";
import type { UnifiedAssetPair } from "./unified-asset-service.js";
import type { UnifiedAssetService } from "./unified-asset-service.js";

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
    private readonly assetNormalizationObserver?: AssetNormalizationObserver
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
    const unifiedAssetContext = await this.resolveUnifiedAssetContext(intent, executionChainId);
    const policyInput = this.toPreTradePolicyInput(
      intent,
      unifiedAssetContext?.assets,
      unifiedAssetContext?.exposure,
      executionChainId
    );
    const rawPolicyDecision = this.policy.pre_trade_check_with_context
      ? await this.policy.pre_trade_check_with_context(policyInput)
      : await this.policy.pre_trade_check(intent);
    const policyDecision = normalizePolicyDecision(rawPolicyDecision);
    await this.observePolicyDecision(intent, policyInput, policyDecision);

    if (policyDecision.decision === "DENY") {
      const deniedError = new PolicyDeniedError(
        policyDecision.policy_version,
        ensurePolicyReasonCodes(policyDecision.reason_codes),
        policyDecision.explanation
      );
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
      this.idempotentResults.set(idempotencyCacheKey, reviewResult);
      return reviewResult;
    }

    const quote = await this.router.fetch_quote(intent);
    if (!this.quoteValidator.isValid(intent, quote)) {
      const invalidQuoteResult = { accepted: false as const, reason_codes: ["quote_invalid"] as [string] };
      this.idempotentResults.set(idempotencyCacheKey, invalidQuoteResult);
      return invalidQuoteResult;
    }
    await this.observeAssetNormalization(intent, executionChainId, unifiedAssetContext?.assets);
    if (this.executionTxBuilder) {
      await this.executionTxBuilder.build(
        this.toExecutionBuildInput(intent, quote, policyDecision, unifiedAssetContext?.assets)
      );
    }

    const route = await this.router.route(intent, quote);
    if (route.status !== "accepted") {
      const routeRejectedResult = {
        accepted: false as const,
        reason_codes: ensureRouteReasonCodes(route.reason_codes)
      };
      this.idempotentResults.set(idempotencyCacheKey, routeRejectedResult);
      return routeRejectedResult;
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
    assets?: UnifiedAssetPair
  ): ExecutionBuildInput {
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

    return {
      correlationId: intent.correlation_id,
      idempotencyKey: intent.idempotency_key,
      policyDecision,
      chainId: requiredInteger("execution_chain_id"),
      target: required("execution_target"),
      calldata: required("execution_calldata"),
      value: (metadata.execution_value ?? "0").trim(),
      recipient: required("execution_recipient"),
      slippageBps: intent.max_slippage_bps,
      deadline: new Date(createdAtMs + intent.ttl_ms).toISOString(),
      amountType: (metadata.execution_amount_type === "exactOut" ? "exactOut" : "exactIn") as "exactIn" | "exactOut",
      amountIn: required("execution_amount_in"),
      amountOut: required("execution_amount_out"),
      minOut: metadata.execution_min_out?.trim(),
      maxIn: metadata.execution_max_in?.trim(),
      nonce: metadata.execution_nonce?.trim(),
      inputToken: {
        symbol: intent.side === "buy" ? (assets?.quote_asset.symbol ?? quote.quote_asset) : (assets?.base_asset.symbol ?? quote.base_asset),
        address: required("execution_input_token_address"),
        decimals: requiredInteger("execution_input_token_decimals")
      },
      outputToken: {
        symbol: intent.side === "buy" ? (assets?.base_asset.symbol ?? quote.base_asset) : (assets?.quote_asset.symbol ?? quote.quote_asset),
        address: required("execution_output_token_address"),
        decimals: requiredInteger("execution_output_token_decimals")
      },
      quote: {
        amountIn: required("execution_quote_amount_in"),
        amountOut: required("execution_quote_amount_out"),
        inputTokenDecimals: requiredInteger("execution_quote_input_token_decimals"),
        outputTokenDecimals: requiredInteger("execution_quote_output_token_decimals")
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

  private resolveExecutionChainId(intent: MarketIntent): number {
    const value = intent.meta?.execution_chain_id?.trim();
    if (!value) {
      return 0;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return 0;
    }
    return parsed;
  }

  private async resolveUnifiedAssetContext(
    intent: MarketIntent,
    chainId: number
  ): Promise<Awaited<ReturnType<UnifiedAssetService["normalize_pre_trade_assets"]>> | undefined> {
    if (!this.unifiedAssetService) {
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
