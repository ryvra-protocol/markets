import type { MarketIntent } from "../types/market-intent.js";
import type { Quote } from "../types/quote.js";

export const ROUTE_REASON_CODE_PREFIX = "route_" as const;
export type RouteReasonCode = `${typeof ROUTE_REASON_CODE_PREFIX}${string}`;
type NonEmptyArray<T> = [T, ...T[]];

export function isRouteReasonCode(value: string): value is RouteReasonCode {
  return value.startsWith(ROUTE_REASON_CODE_PREFIX) && value.length > ROUTE_REASON_CODE_PREFIX.length;
}

export function ensureRouteReasonCodes(
  reason_codes: readonly string[] | undefined,
  fallback: RouteReasonCode = "route_rejected"
): NonEmptyArray<RouteReasonCode> {
  const normalized = (reason_codes ?? []).filter(isRouteReasonCode);
  if (normalized.length === 0) {
    return [fallback];
  }

  return normalized as NonEmptyArray<RouteReasonCode>;
}

export interface ExecutionRouteResult {
  route_id: string;
  status: "accepted" | "rejected";
  reason_codes?: NonEmptyArray<RouteReasonCode>;
  reference_id: string;
  correlation_id: string;
}

export interface ExecutionAdapter {
  name: string;
  fetch_quote(intent: MarketIntent): Promise<Quote>;
  submit(intent: MarketIntent, quote: Quote): Promise<ExecutionRouteResult>;
  cancel(route_id: string): Promise<void>;
}
