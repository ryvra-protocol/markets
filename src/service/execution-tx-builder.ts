import { createHash } from "node:crypto";

import type { PolicyDecision } from "../adapters/policy-client.js";

const MAX_BPS = 10_000;
const MAX_UINT256 = (1n << 256n) - 1n;

export class ExecutionBuildError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "ExecutionBuildError";
  }
}

export class SlippageOutOfBoundsError extends ExecutionBuildError {
  constructor(message = "slippage is out of configured bounds") {
    super(message, "SLIPPAGE_OUT_OF_BOUNDS");
    this.name = "SlippageOutOfBoundsError";
  }
}

export class DeadlineExpiredError extends ExecutionBuildError {
  constructor(message = "deadline is stale or expired") {
    super(message, "DEADLINE_EXPIRED");
    this.name = "DeadlineExpiredError";
  }
}

export class DeadlineTooFarError extends ExecutionBuildError {
  constructor(message = "deadline exceeds configured max horizon") {
    super(message, "DEADLINE_TOO_FAR");
    this.name = "DeadlineTooFarError";
  }
}

export class InvalidChainError extends ExecutionBuildError {
  constructor(message = "chainId is not allowed") {
    super(message, "INVALID_CHAIN");
    this.name = "InvalidChainError";
  }
}

export class InvalidRecipientError extends ExecutionBuildError {
  constructor(message = "recipient is invalid or disallowed") {
    super(message, "INVALID_RECIPIENT");
    this.name = "InvalidRecipientError";
  }
}

export class InvalidTokenError extends ExecutionBuildError {
  constructor(message = "token configuration is invalid") {
    super(message, "INVALID_TOKEN");
    this.name = "InvalidTokenError";
  }
}

export class TokenDecimalsMismatchError extends ExecutionBuildError {
  constructor(message = "token decimals mismatch between quote and build inputs") {
    super(message, "TOKEN_DECIMALS_MISMATCH");
    this.name = "TokenDecimalsMismatchError";
  }
}

export class InvalidAmountError extends ExecutionBuildError {
  constructor(message = "amount is invalid") {
    super(message, "INVALID_AMOUNT");
    this.name = "InvalidAmountError";
  }
}

export class QuoteConstraintViolationError extends ExecutionBuildError {
  constructor(message = "quote constraints violated by build inputs") {
    super(message, "QUOTE_CONSTRAINT_VIOLATION");
    this.name = "QuoteConstraintViolationError";
  }
}

export class ReplayProtectionError extends ExecutionBuildError {
  constructor(message = "replay/idempotency protection failed") {
    super(message, "REPLAY_PROTECTION");
    this.name = "ReplayProtectionError";
  }
}

export interface ExecutionBuildToken {
  symbol: string;
  address: string;
  decimals: number;
}

export interface ExecutionBuildQuoteConstraints {
  amountIn: string;
  amountOut: string;
  inputTokenDecimals: number;
  outputTokenDecimals: number;
}

export interface ExecutionBuildInput {
  correlationId: string;
  idempotencyKey?: string;
  policyDecision: Extract<PolicyDecision, { decision: "ALLOW" }>;
  chainId: number;
  target: string;
  calldata: string;
  value: string;
  recipient: string;
  slippageBps: number;
  deadline: string;
  amountType: "exactIn" | "exactOut";
  amountIn: string;
  amountOut: string;
  minOut?: string;
  maxIn?: string;
  nonce?: string;
  inputToken: ExecutionBuildToken;
  outputToken: ExecutionBuildToken;
  quote: ExecutionBuildQuoteConstraints;
}

export interface ExecutionTxBuilderConfig {
  minSlippageBps: number;
  maxSlippageBps: number;
  maxDeadlineHorizonMs: number;
  allowedChains: readonly number[];
  allowedRecipients?: readonly string[];
  requireDistinctInputOutputTokens: boolean;
}

export const DEFAULT_EXECUTION_TX_BUILDER_CONFIG: ExecutionTxBuilderConfig = {
  minSlippageBps: 0,
  maxSlippageBps: 1_000,
  maxDeadlineHorizonMs: 15 * 60 * 1000,
  allowedChains: [1],
  requireDistinctInputOutputTokens: true
};

export interface ExecutionTxPayload {
  chainId: number;
  target: string;
  calldata: string;
  value: string;
  recipient: string;
  minOut?: string;
  maxIn?: string;
  deadline: string;
  nonce?: string;
  idempotencyKey: string;
}

export interface ExecutionBuildResult {
  payloads: [ExecutionTxPayload];
  metadata: {
    chainId: number;
    target: string;
    calldata: string;
    value: string;
    minOut?: string;
    maxIn?: string;
    deadline: string;
    recipient: string;
    nonce?: string;
    idempotencyKey: string;
    fingerprintHash: string;
  };
}

export interface ExecutionTxBuildClient {
  build(input: ExecutionBuildInput): Promise<ExecutionBuildResult>;
}

export interface ExecutionReplayStore {
  has(key: string): Promise<boolean> | boolean;
  mark(key: string): Promise<void> | void;
}

export interface ExecutionBuildStartedEvent {
  event_type: "markets.execution.build.started";
  timestamp: string;
  correlation_id: string;
  chainId: number;
}

export interface ExecutionBuildSucceededEvent {
  event_type: "markets.execution.build.succeeded";
  timestamp: string;
  correlation_id: string;
  chainId: number;
  timing_ms: number;
  deterministic_fingerprint_hash: string;
}

export interface ExecutionBuildFailedEvent {
  event_type: "markets.execution.build.failed";
  timestamp: string;
  correlation_id: string;
  chainId?: number;
  guardrail_code?: string;
  timing_ms: number;
  deterministic_fingerprint_hash?: string;
}

export type ExecutionBuildObserverEvent =
  | ExecutionBuildStartedEvent
  | ExecutionBuildSucceededEvent
  | ExecutionBuildFailedEvent;

export type ExecutionBuildObserver = (event: ExecutionBuildObserverEvent) => void | Promise<void>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const sortedKeys = Object.keys(objectValue).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = canonicalize(objectValue[key]);
    }
    return result;
  }
  return value;
}

function deterministicHash(value: unknown): string {
  const canonical = JSON.stringify(canonicalize(value));
  return createHash("sha256").update(canonical).digest("hex");
}

function parsePositiveUint256(value: string, field: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new InvalidAmountError(`${field} must be an unsigned integer string`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new InvalidAmountError(`${field} must be positive`);
  }
  if (parsed > MAX_UINT256) {
    throw new InvalidAmountError(`${field} exceeds uint256 max`);
  }
  return parsed;
}

function parseOptionalPositiveUint256(value: string | undefined, field: string): bigint | undefined {
  if (value === undefined) {
    return undefined;
  }
  return parsePositiveUint256(value, field);
}

function parseFutureDeadline(deadline: string): number {
  const parsed = new Date(deadline).getTime();
  if (Number.isNaN(parsed)) {
    throw new DeadlineExpiredError("deadline must be a valid timestamp");
  }
  return parsed;
}

function isValidAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

function ensureToken(token: ExecutionBuildToken, fieldPrefix: string): { address: string } {
  if (!token.symbol.trim()) {
    throw new InvalidTokenError(`${fieldPrefix} symbol is required`);
  }
  if (!isValidAddress(token.address)) {
    throw new InvalidTokenError(`${fieldPrefix} address is invalid`);
  }
  if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 36) {
    throw new InvalidTokenError(`${fieldPrefix} decimals must be an integer between 0 and 36`);
  }
  return { address: normalizeAddress(token.address) };
}

export class ExecutionTxBuilder implements ExecutionTxBuildClient {
  constructor(
    private readonly config: ExecutionTxBuilderConfig = DEFAULT_EXECUTION_TX_BUILDER_CONFIG,
    private readonly replayStore?: ExecutionReplayStore,
    private readonly observer?: ExecutionBuildObserver,
    private readonly now: () => Date = () => new Date()
  ) {}

  async build(input: ExecutionBuildInput): Promise<ExecutionBuildResult> {
    const start = this.now().getTime();
    await this.observer?.({
      event_type: "markets.execution.build.started",
      timestamp: new Date(start).toISOString(),
      correlation_id: input.correlationId,
      chainId: input.chainId
    });

    try {
      this.validate(input);

      const idempotencyKey =
        input.idempotencyKey ??
        deterministicHash({
          correlationId: input.correlationId,
          chainId: input.chainId,
          target: normalizeAddress(input.target),
          recipient: normalizeAddress(input.recipient),
          calldata: input.calldata,
          value: input.value,
          deadline: input.deadline,
          amountIn: input.amountIn,
          amountOut: input.amountOut
        });

      if (this.replayStore) {
        const alreadySeen = await this.replayStore.has(idempotencyKey);
        if (alreadySeen) {
          throw new ReplayProtectionError("duplicate idempotency key detected");
        }
      }

      const payload: ExecutionTxPayload = {
        chainId: input.chainId,
        target: normalizeAddress(input.target),
        calldata: input.calldata.toLowerCase(),
        value: input.value,
        recipient: normalizeAddress(input.recipient),
        minOut: input.minOut,
        maxIn: input.maxIn,
        deadline: new Date(input.deadline).toISOString(),
        nonce: input.nonce,
        idempotencyKey
      };

      const fingerprintHash = deterministicHash(payload);
      if (this.replayStore) {
        await this.replayStore.mark(idempotencyKey);
      }

      const elapsed = this.now().getTime() - start;
      await this.observer?.({
        event_type: "markets.execution.build.succeeded",
        timestamp: this.now().toISOString(),
        correlation_id: input.correlationId,
        chainId: input.chainId,
        timing_ms: elapsed,
        deterministic_fingerprint_hash: fingerprintHash
      });

      return {
        payloads: [payload],
        metadata: {
          chainId: payload.chainId,
          target: payload.target,
          calldata: payload.calldata,
          value: payload.value,
          minOut: payload.minOut,
          maxIn: payload.maxIn,
          deadline: payload.deadline,
          recipient: payload.recipient,
          nonce: payload.nonce,
          idempotencyKey,
          fingerprintHash
        }
      };
    } catch (error) {
      const elapsed = this.now().getTime() - start;
      const guardrailCode = error instanceof ExecutionBuildError ? error.code : undefined;
      await this.observer?.({
        event_type: "markets.execution.build.failed",
        timestamp: this.now().toISOString(),
        correlation_id: input.correlationId,
        chainId: input.chainId,
        guardrail_code: guardrailCode,
        timing_ms: elapsed
      });
      throw error;
    }
  }

  private validate(input: ExecutionBuildInput): void {
    if (input.policyDecision.decision !== "ALLOW") {
      throw new QuoteConstraintViolationError("execution build requires ALLOW policy decision");
    }

    if (!Number.isInteger(this.config.minSlippageBps) || !Number.isInteger(this.config.maxSlippageBps)) {
      throw new SlippageOutOfBoundsError("slippage config must be integer bps");
    }
    if (
      this.config.minSlippageBps < 0 ||
      this.config.maxSlippageBps > MAX_BPS ||
      this.config.minSlippageBps > this.config.maxSlippageBps
    ) {
      throw new SlippageOutOfBoundsError("slippage config is invalid");
    }
    if (input.slippageBps < this.config.minSlippageBps || input.slippageBps > this.config.maxSlippageBps) {
      throw new SlippageOutOfBoundsError();
    }

    if (!this.config.allowedChains.includes(input.chainId)) {
      throw new InvalidChainError();
    }

    if (!isValidAddress(input.target)) {
      throw new InvalidRecipientError("target address is invalid");
    }
    if (!isValidAddress(input.recipient)) {
      throw new InvalidRecipientError();
    }
    const normalizedRecipient = normalizeAddress(input.recipient);
    if (this.config.allowedRecipients && this.config.allowedRecipients.length > 0) {
      const recipientAllowed = this.config.allowedRecipients
        .map((recipient) => normalizeAddress(recipient))
        .includes(normalizedRecipient);
      if (!recipientAllowed) {
        throw new InvalidRecipientError("recipient not permitted by policy");
      }
    }

    if (!/^0x[a-fA-F0-9]*$/.test(input.calldata) || input.calldata.length < 2) {
      throw new QuoteConstraintViolationError("calldata must be hex encoded");
    }
    if (!/^\d+$/.test(input.value)) {
      throw new InvalidAmountError("value must be an unsigned integer string");
    }

    const normalizedInputToken = ensureToken(input.inputToken, "inputToken");
    const normalizedOutputToken = ensureToken(input.outputToken, "outputToken");
    if (
      this.config.requireDistinctInputOutputTokens &&
      normalizedInputToken.address === normalizedOutputToken.address
    ) {
      throw new InvalidTokenError("input and output token must differ");
    }

    if (input.inputToken.decimals !== input.quote.inputTokenDecimals) {
      throw new TokenDecimalsMismatchError("input token decimals mismatch");
    }
    if (input.outputToken.decimals !== input.quote.outputTokenDecimals) {
      throw new TokenDecimalsMismatchError("output token decimals mismatch");
    }

    const amountIn = parsePositiveUint256(input.amountIn, "amountIn");
    const amountOut = parsePositiveUint256(input.amountOut, "amountOut");
    const quoteAmountIn = parsePositiveUint256(input.quote.amountIn, "quote.amountIn");
    const quoteAmountOut = parsePositiveUint256(input.quote.amountOut, "quote.amountOut");

    const minOut = parseOptionalPositiveUint256(input.minOut, "minOut");
    const maxIn = parseOptionalPositiveUint256(input.maxIn, "maxIn");

    if (minOut !== undefined && minOut > amountOut) {
      throw new QuoteConstraintViolationError("minOut cannot exceed amountOut");
    }
    if (maxIn !== undefined && maxIn < amountIn) {
      throw new QuoteConstraintViolationError("maxIn cannot be below amountIn");
    }
    if (amountIn !== quoteAmountIn) {
      throw new QuoteConstraintViolationError("amountIn is inconsistent with quote");
    }
    if (amountOut !== quoteAmountOut) {
      throw new QuoteConstraintViolationError("amountOut is inconsistent with quote");
    }
    if (input.amountType === "exactIn" && minOut === undefined) {
      throw new QuoteConstraintViolationError("exactIn orders require minOut");
    }
    if (input.amountType === "exactOut" && maxIn === undefined) {
      throw new QuoteConstraintViolationError("exactOut orders require maxIn");
    }

    const nowMs = this.now().getTime();
    const deadlineMs = parseFutureDeadline(input.deadline);
    if (deadlineMs <= nowMs) {
      throw new DeadlineExpiredError();
    }
    if (deadlineMs - nowMs > this.config.maxDeadlineHorizonMs) {
      throw new DeadlineTooFarError();
    }
  }
}
