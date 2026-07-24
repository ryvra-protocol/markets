import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";

export const ROUTE_REASON_CODE_PREFIX = "route_" as const;
export type RouteReasonCode = `${typeof ROUTE_REASON_CODE_PREFIX}${string}`;

export interface ExecutionRouteResult {
  route_id: string;
  status: "accepted" | "rejected";
  reason_codes?: RouteReasonCode[];
  reference_id: string;
  correlation_id: string;
}

export interface ExecutionAdapter {
  name: string;
  fetch_quote(intent: MarketIntent): Promise<Quote>;
  submit(intent: MarketIntent, quote: Quote): Promise<ExecutionRouteResult>;
  cancel(route_id: string): Promise<void>;
}
