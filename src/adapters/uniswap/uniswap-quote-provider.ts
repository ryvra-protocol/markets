import type { QuoteProvider } from "../../domain/contracts.js";
import type { RawQuote } from "../../domain/quote.js";
import type { TradeIntent } from "../../domain/trade-intent.js";

import {
  assertPairSupported,
  DEFAULT_UNISWAP_ADAPTER_CONFIG,
  resolveChainConfig,
  type UniswapAdapterConfig
} from "./config.js";
import {
  mapUniswapSnapshotToRawQuote,
  type UniswapQuoteSnapshot,
  type UniswapRouteHopSnapshot
} from "./mappers.js";

export type UniswapQuoteFailureCode =
  | "UNSUPPORTED_CHAIN"
  | "UNSUPPORTED_PAIR"
  | "NO_ROUTE"
  | "STALE_QUOTE"
  | "PROVIDER_ERROR";

export class UniswapQuoteProviderError extends Error {
  constructor(
    public readonly code: UniswapQuoteFailureCode,
    message: string,
    public readonly causeValue?: unknown
  ) {
    super(message);
    this.name = "UniswapQuoteProviderError";
  }
}

export interface UniswapQuoteRequest {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  amountType: "exactIn" | "exactOut";
  amount: string;
  slippageBps: number;
  deadline: string;
}

export interface UniswapQuoteResponse {
  amountIn: string | number;
  amountOut: string | number;
  route: readonly UniswapRouteHopSnapshot[];
  estimatedGasUnits?: string | number;
  estimatedPriceImpactBps?: number;
  quotedAt: string;
  validUntil?: string;
}

export interface UniswapQuoteClient {
  getQuote(request: UniswapQuoteRequest): Promise<UniswapQuoteResponse>;
}

function classifyError(error: unknown): UniswapQuoteFailureCode {
  if (!(error instanceof Error)) {
    return "PROVIDER_ERROR";
  }

  if (error.message.startsWith("UNSUPPORTED_CHAIN:")) {
    return "UNSUPPORTED_CHAIN";
  }
  if (error.message.startsWith("UNSUPPORTED_PAIR:")) {
    return "UNSUPPORTED_PAIR";
  }
  if (error.message === "NO_ROUTE") {
    return "NO_ROUTE";
  }
  if (error.message === "STALE_QUOTE") {
    return "STALE_QUOTE";
  }

  return "PROVIDER_ERROR";
}

export class UniswapQuoteProvider implements QuoteProvider {
  constructor(
    private readonly client: UniswapQuoteClient,
    private readonly config: UniswapAdapterConfig = DEFAULT_UNISWAP_ADAPTER_CONFIG,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getRawQuote(intent: TradeIntent): Promise<RawQuote> {
    try {
      const chain = resolveChainConfig(this.config, intent.chainId);
      assertPairSupported(chain, intent);

      const snapshot: UniswapQuoteSnapshot = await this.client.getQuote({
        chainId: intent.chainId,
        tokenIn: intent.assetIn,
        tokenOut: intent.assetOut,
        amountType: intent.amount.type,
        amount: intent.amount.value,
        slippageBps: intent.slippageBps,
        deadline: intent.deadline
      });

      return mapUniswapSnapshotToRawQuote({
        source: this.config.source,
        intent,
        snapshot,
        quoteTtlSeconds: chain.defaultQuoteTtlSeconds,
        now: this.now()
      });
    } catch (error: unknown) {
      const code = classifyError(error);
      throw new UniswapQuoteProviderError(code, `Uniswap quote failed (${code})`, error);
    }
  }
}
