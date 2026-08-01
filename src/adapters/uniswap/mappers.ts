import { createHash } from "node:crypto";

import type { RawQuote } from "../../domain/quote.js";
import type { TradeIntent } from "../../domain/trade-intent.js";

export interface UniswapRouteHopSnapshot {
  poolId: string;
  feeTierBps: number;
  tokenIn: string;
  tokenOut: string;
}

export interface UniswapQuoteSnapshot {
  amountIn: string | number;
  amountOut: string | number;
  route: readonly UniswapRouteHopSnapshot[];
  estimatedGasUnits?: string | number;
  estimatedPriceImpactBps?: number;
  quotedAt: string;
  validUntil?: string;
}

export type RoundingMode = "floor" | "ceil";

function parseDecimalToScaledInteger(value: string, scale: number, mode: RoundingMode): bigint {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`INVALID_DECIMAL:${value}`);
  }

  const [integerPart, fractionPart = ""] = trimmed.split(".");
  const paddedFraction = fractionPart.padEnd(scale, "0");
  const keptFraction = paddedFraction.slice(0, scale);
  const remainder = paddedFraction.slice(scale);

  let amount = BigInt(integerPart) * 10n ** BigInt(scale);
  amount += BigInt(keptFraction || "0");

  const shouldRoundUp = mode === "ceil" && remainder.split("").some((digit) => digit !== "0");
  if (shouldRoundUp) {
    amount += 1n;
  }

  return amount;
}

export function normalizeAtomicAmount(
  value: string | number,
  decimals: number,
  mode: RoundingMode
): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error(`INVALID_DECIMALS:${decimals}`);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("INVALID_NUMERIC_AMOUNT");
    }
    return parseDecimalToScaledInteger(value.toString(), decimals, mode).toString();
  }

  if (!value.trim()) {
    throw new Error("EMPTY_AMOUNT");
  }
  return parseDecimalToScaledInteger(value, decimals, mode).toString();
}

function canonicalizeRoute(route: readonly UniswapRouteHopSnapshot[]): RawQuote["route"] {
  return route.map((hop) => ({
    poolId: hop.poolId,
    feeTierBps: hop.feeTierBps,
    tokenIn: hop.tokenIn,
    tokenOut: hop.tokenOut
  }));
}

export function mapUniswapSnapshotToRawQuote(input: {
  source: string;
  intent: TradeIntent;
  snapshot: UniswapQuoteSnapshot;
  quoteTtlSeconds: number;
  now?: Date;
  assetInDecimals?: number;
  assetOutDecimals?: number;
}): RawQuote {
  const {
    source,
    intent,
    snapshot,
    quoteTtlSeconds,
    now = new Date(),
    assetInDecimals = 18,
    assetOutDecimals = 18
  } = input;

  if (snapshot.route.length === 0) {
    throw new Error("NO_ROUTE");
  }

  const quotedAtDate = new Date(snapshot.quotedAt);
  if (Number.isNaN(quotedAtDate.getTime())) {
    throw new Error("INVALID_QUOTED_AT");
  }

  const validUntilDate = snapshot.validUntil ? new Date(snapshot.validUntil) : new Date(quotedAtDate.getTime() + quoteTtlSeconds * 1000);
  if (Number.isNaN(validUntilDate.getTime())) {
    throw new Error("INVALID_VALID_UNTIL");
  }
  if (validUntilDate.getTime() <= now.getTime()) {
    throw new Error("STALE_QUOTE");
  }

  const route = canonicalizeRoute(snapshot.route);
  const amountInMode: RoundingMode = intent.amount.type === "exactOut" ? "ceil" : "floor";
  const amountOutMode: RoundingMode = intent.amount.type === "exactIn" ? "floor" : "ceil";

  const rawQuote: Omit<RawQuote, "quote_id"> = {
    intent_id: intent.intent_id,
    correlation_id: intent.correlation_id,
    source,
    chainId: intent.chainId,
    assetIn: intent.assetIn,
    assetOut: intent.assetOut,
    amountIn: normalizeAtomicAmount(snapshot.amountIn, assetInDecimals, amountInMode),
    amountOut: normalizeAtomicAmount(snapshot.amountOut, assetOutDecimals, amountOutMode),
    estimatedGasUnits: snapshot.estimatedGasUnits
      ? normalizeAtomicAmount(snapshot.estimatedGasUnits, 0, "ceil")
      : undefined,
    estimatedPriceImpactBps: snapshot.estimatedPriceImpactBps,
    route,
    quotedAt: quotedAtDate.toISOString(),
    validUntil: validUntilDate.toISOString()
  };

  const deterministicPayload = JSON.stringify(rawQuote);
  const quoteId = createHash("sha256").update(deterministicPayload).digest("hex").slice(0, 32);

  return {
    quote_id: `quote_${quoteId}`,
    ...rawQuote
  };
}
