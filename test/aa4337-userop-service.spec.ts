import { describe, expect, it } from "vitest";

import type { AccountsRuntimeClient } from "../src/adapters/accounts-runtime-client.js";
import {
  Aa4337UserOpService,
  normalizeAa4337BuildRequest,
  type Aa4337ExecutionObservedEvent
} from "../src/service/aa4337-userop-service.js";

function createExecutionInput() {
  return {
    correlation_id: "corr-1",
    reference_id: "ref-1",
    idempotency_key: "idem-1",
    side: "buy" as const,
    size: 1,
    chain_id: 1,
    account_id: "acct-1",
    paymaster: "0x9999999999999999999999999999999999999999",
    paymaster_chain_id: 1,
    paymaster_account_id: "acct-1",
    amount_in: "1000000",
    amount_out: "2000000",
    execution_target: "0x1111111111111111111111111111111111111111",
    execution_calldata: "0xABCDEF",
    execution_value: "0",
    execution_recipient: "0x2222222222222222222222222222222222222222",
    deadline: "2026-01-01T00:00:30.000Z",
    nonce: "7",
    input_token_decimals: 6,
    output_token_decimals: 8,
    quote_input_token_decimals: 6,
    quote_output_token_decimals: 8,
    assets: {
      base_asset: {
        canonical_id: "asset:btc",
        symbol: "BTC",
        decimals: 8,
        chain_id: 1,
        address: "0x3333333333333333333333333333333333333333"
      },
      quote_asset: {
        canonical_id: "asset:usd",
        symbol: "USD",
        decimals: 6,
        chain_id: 1,
        address: "0x4444444444444444444444444444444444444444"
      }
    }
  };
}

describe("AA4337 request normalization", () => {
  it("produces deterministic canonical adapter requests", () => {
    const first = normalizeAa4337BuildRequest(createExecutionInput());
    const second = normalizeAa4337BuildRequest(createExecutionInput());

    expect(first).toEqual(second);
    expect(first).toEqual({
      correlation_id: "corr-1",
      idempotency_key: "idem-1",
      reference_id: "ref-1",
      chain_id: 1,
      account_id: "acct-1",
      paymaster: "0x9999999999999999999999999999999999999999",
      trade: {
        side: "buy",
        size: "1",
        base_asset: {
          canonical_id: "asset:btc",
          symbol: "BTC",
          decimals: 8,
          address: "0x3333333333333333333333333333333333333333"
        },
        quote_asset: {
          canonical_id: "asset:usd",
          symbol: "USD",
          decimals: 6,
          address: "0x4444444444444444444444444444444444444444"
        },
        amount_in: "1000000",
        amount_out: "2000000"
      },
      execution: {
        target: "0x1111111111111111111111111111111111111111",
        calldata: "0xabcdef",
        value: "0",
        recipient: "0x2222222222222222222222222222222222222222",
        deadline: "2026-01-01T00:00:30.000Z",
        nonce: "7",
        input_token: {
          canonical_id: "asset:usd",
          symbol: "USD",
          decimals: 6,
          address: "0x4444444444444444444444444444444444444444"
        },
        output_token: {
          canonical_id: "asset:btc",
          symbol: "BTC",
          decimals: 8,
          address: "0x3333333333333333333333333333333333333333"
        }
      }
    });
  });
});

describe("Aa4337UserOpService", () => {
  it("executes build/simulate/send/getReceipt and emits submitted/included events", async () => {
    const events: Aa4337ExecutionObservedEvent[] = [];
    const runtime: AccountsRuntimeClient = {
      build: async (input) => ({ user_operation: { input } }),
      simulate: async () => ({ success: true }),
      send: async () => ({ user_operation_hash: "0xaaa" }),
      getReceipt: async () => ({ status: "included", transaction_hash: "0xbbb", block_number: 123 })
    };

    const service = new Aa4337UserOpService(runtime, (event) => {
      events.push(event);
    });
    await service.execute(createExecutionInput());

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      event_type: "markets.aa4337.userop.submitted",
      correlation_id: "corr-1",
      reference_id: "ref-1",
      chain_id: 1,
      user_operation_hash: "0xaaa"
    });
    expect(events[1]).toMatchObject({
      event_type: "markets.aa4337.userop.included",
      correlation_id: "corr-1",
      reference_id: "ref-1",
      chain_id: 1,
      user_operation_hash: "0xaaa",
      transaction_hash: "0xbbb",
      block_number: 123
    });
  });

  it("propagates failure taxonomy for simulation and emits failed event", async () => {
    const events: Aa4337ExecutionObservedEvent[] = [];
    const runtime: AccountsRuntimeClient = {
      build: async () => ({ user_operation: {} }),
      simulate: async () => ({ success: false, reason_code: "aa4337_simulation_failed" }),
      send: async () => ({ user_operation_hash: "0xaaa" }),
      getReceipt: async () => ({ status: "included" })
    };

    const service = new Aa4337UserOpService(runtime, (event) => {
      events.push(event);
    });
    await expect(service.execute(createExecutionInput())).rejects.toMatchObject({
      reason_code: "aa4337_simulation_failed"
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event_type: "markets.aa4337.userop.failed",
      reason_code: "aa4337_simulation_failed"
    });
  });
});
