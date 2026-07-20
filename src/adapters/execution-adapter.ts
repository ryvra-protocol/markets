import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";

export interface ExecutionRouteResult {
  routeId: string;
  status: "accepted" | "rejected";
  reasonCode?: string;
}

export interface ExecutionAdapter {
  name: string;
  fetchQuote(intent: MarketIntent): Promise<Quote>;
  submit(intent: MarketIntent, quote: Quote): Promise<ExecutionRouteResult>;
  cancel(routeId: string): Promise<void>;
}
