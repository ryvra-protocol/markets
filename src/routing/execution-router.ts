import type { ExecutionAdapter, ExecutionRouteResult } from "../adapters/execution-adapter.js";
import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";

export class ExecutionRouter {
  constructor(private readonly adapter: ExecutionAdapter) {}

  async fetch_quote(intent: MarketIntent): Promise<Quote> {
    return this.adapter.fetch_quote(intent);
  }

  async route(intent: MarketIntent, quote: Quote): Promise<ExecutionRouteResult> {
    return this.adapter.submit(intent, quote);
  }
}
