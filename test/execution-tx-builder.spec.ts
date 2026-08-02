import { describe, expect, it } from "vitest";

import {
  DeadlineExpiredError,
  DeadlineTooFarError,
  DEFAULT_EXECUTION_TX_BUILDER_CONFIG,
  ExecutionTxBuilder,
  InvalidAmountError,
  InvalidChainError,
  InvalidRecipientError,
  InvalidTokenError,
  QuoteConstraintViolationError,
  ReplayProtectionError,
  SlippageOutOfBoundsError,
  TokenDecimalsMismatchError,
  type ExecutionBuildInput
} from "../src/service/execution-tx-builder.js";

function createValidInput(): ExecutionBuildInput {
  return {
    correlationId: "corr-1",
    idempotencyKey: "idem-1",
    policyDecision: {
      decision: "ALLOW",
      policy_version: "policy-risk@2.0.0",
      explanation: "Allowed",
      reason_codes: []
    },
    chainId: 1,
    target: "0x1111111111111111111111111111111111111111",
    calldata: "0xabcdef",
    value: "0",
    recipient: "0x2222222222222222222222222222222222222222",
    slippageBps: 50,
    deadline: "2026-01-01T00:05:00.000Z",
    amountType: "exactIn",
    amountIn: "1000000",
    amountOut: "2000000",
    minOut: "1900000",
    inputToken: {
      symbol: "USDC",
      address: "0x3333333333333333333333333333333333333333",
      decimals: 6
    },
    outputToken: {
      symbol: "WETH",
      address: "0x4444444444444444444444444444444444444444",
      decimals: 18
    },
    quote: {
      amountIn: "1000000",
      amountOut: "2000000",
      inputTokenDecimals: 6,
      outputTokenDecimals: 18
    }
  };
}

describe("ExecutionTxBuilder", () => {
  it("builds deterministic tx payload and metadata", async () => {
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const builder = new ExecutionTxBuilder(
      { ...DEFAULT_EXECUTION_TX_BUILDER_CONFIG, allowedChains: [1], maxDeadlineHorizonMs: 10 * 60 * 1000 },
      undefined,
      undefined,
      now
    );

    const first = await builder.build(createValidInput());
    const second = await builder.build(createValidInput());

    expect(first).toEqual(second);
    expect(first.metadata.fingerprintHash).toBe("693932ec6f8e3f25337bec409e6a59bb81ab895446a7bc6fc8442a0ac719cd0e");
  });

  it("emits sanitized build observability events", async () => {
    const events: unknown[] = [];
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const builder = new ExecutionTxBuilder(
      { ...DEFAULT_EXECUTION_TX_BUILDER_CONFIG, allowedChains: [1], maxDeadlineHorizonMs: 10 * 60 * 1000 },
      undefined,
      (event) => {
        events.push(event);
      },
      now
    );

    await builder.build(createValidInput());
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event_type: "markets.execution.build.started",
      correlation_id: "corr-1",
      chainId: 1
    });
    expect(events[1]).toMatchObject({
      event_type: "markets.execution.build.succeeded",
      correlation_id: "corr-1",
      chainId: 1,
      deterministic_fingerprint_hash: "693932ec6f8e3f25337bec409e6a59bb81ab895446a7bc6fc8442a0ac719cd0e"
    });
  });

  it("raises SlippageOutOfBoundsError", async () => {
    const builder = new ExecutionTxBuilder(
      { ...DEFAULT_EXECUTION_TX_BUILDER_CONFIG, minSlippageBps: 10, maxSlippageBps: 20 },
      undefined,
      undefined,
      () => new Date("2026-01-01T00:00:00.000Z")
    );
    await expect(builder.build({ ...createValidInput(), slippageBps: 21 })).rejects.toBeInstanceOf(
      SlippageOutOfBoundsError
    );
  });

  it("raises DeadlineExpiredError", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(builder.build({ ...createValidInput(), deadline: "2025-12-31T23:59:59.000Z" })).rejects.toBeInstanceOf(
      DeadlineExpiredError
    );
  });

  it("raises DeadlineTooFarError", async () => {
    const builder = new ExecutionTxBuilder(
      { ...DEFAULT_EXECUTION_TX_BUILDER_CONFIG, maxDeadlineHorizonMs: 1000, allowedChains: [1] },
      undefined,
      undefined,
      () => new Date("2026-01-01T00:00:00.000Z")
    );
    await expect(builder.build(createValidInput())).rejects.toBeInstanceOf(DeadlineTooFarError);
  });

  it("raises InvalidChainError", async () => {
    const builder = new ExecutionTxBuilder(
      { ...DEFAULT_EXECUTION_TX_BUILDER_CONFIG, allowedChains: [10] },
      undefined,
      undefined,
      () => new Date("2026-01-01T00:00:00.000Z")
    );
    await expect(builder.build(createValidInput())).rejects.toBeInstanceOf(InvalidChainError);
  });

  it("raises InvalidRecipientError", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(builder.build({ ...createValidInput(), recipient: "0x0" })).rejects.toBeInstanceOf(
      InvalidRecipientError
    );
  });

  it("raises InvalidTokenError", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(
      builder.build({
        ...createValidInput(),
        outputToken: {
          symbol: "WETH",
          address: "0x3333333333333333333333333333333333333333",
          decimals: 18
        }
      })
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it("raises TokenDecimalsMismatchError", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(
      builder.build({
        ...createValidInput(),
        quote: { ...createValidInput().quote, inputTokenDecimals: 18 }
      })
    ).rejects.toBeInstanceOf(TokenDecimalsMismatchError);
  });

  it("raises InvalidAmountError", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(builder.build({ ...createValidInput(), amountIn: "0" })).rejects.toBeInstanceOf(InvalidAmountError);
  });

  it("raises QuoteConstraintViolationError", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(builder.build({ ...createValidInput(), minOut: "2100000" })).rejects.toBeInstanceOf(
      QuoteConstraintViolationError
    );
  });

  it("raises ReplayProtectionError", async () => {
    const builder = new ExecutionTxBuilder(
      undefined,
      {
        has: () => true,
        mark: () => {}
      },
      undefined,
      () => new Date("2026-01-01T00:00:00.000Z")
    );
    await expect(builder.build(createValidInput())).rejects.toBeInstanceOf(ReplayProtectionError);
  });

  it("accepts boundary values for slippage and deadline horizon", async () => {
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const builder = new ExecutionTxBuilder(
      {
        ...DEFAULT_EXECUTION_TX_BUILDER_CONFIG,
        minSlippageBps: 50,
        maxSlippageBps: 50,
        maxDeadlineHorizonMs: 5 * 60 * 1000,
        allowedChains: [1]
      },
      undefined,
      undefined,
      now
    );
    const result = await builder.build(createValidInput());
    expect(result.metadata.chainId).toBe(1);
  });

  it("enforces exactOut maxIn requirement", async () => {
    const builder = new ExecutionTxBuilder(undefined, undefined, undefined, () => new Date("2026-01-01T00:00:00.000Z"));
    await expect(
      builder.build({
        ...createValidInput(),
        amountType: "exactOut",
        maxIn: undefined
      })
    ).rejects.toBeInstanceOf(QuoteConstraintViolationError);
  });
});
