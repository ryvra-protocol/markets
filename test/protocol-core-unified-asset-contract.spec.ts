import { describe, expect, it } from "vitest";

import type { AssetPosition, ExposureSnapshot, UnifiedAsset, UnifiedBalance } from "../src/domain/unified-asset.js";

describe("protocol-core unified asset contract compatibility", () => {
  it("matches canonical unified asset envelope", () => {
    const asset: UnifiedAsset = {
      canonical_id: "asset:btc",
      symbol: "BTC",
      decimals: 8,
      chain_id: 1,
      address: "0x1111111111111111111111111111111111111111",
      aliases: ["BTC", "XBT"]
    };

    const balance: UnifiedBalance = {
      asset,
      available: "1.25",
      locked: "0.25",
      total: "1.50",
      as_of: "2026-01-01T00:00:00.000Z"
    };

    const position: AssetPosition = {
      account_id: "acct-1",
      asset,
      quantity: "1.50",
      side: "long",
      notional_quote_asset: "asset:usd",
      notional_value: "150000.00",
      updated_at: "2026-01-01T00:00:00.000Z"
    };

    const snapshot: ExposureSnapshot = {
      account_id: "acct-1",
      balances: [balance],
      positions: [position],
      generated_at: "2026-01-01T00:00:00.000Z"
    };

    expect(snapshot).toEqual({
      account_id: "acct-1",
      balances: [
        {
          asset: {
            canonical_id: "asset:btc",
            symbol: "BTC",
            decimals: 8,
            chain_id: 1,
            address: "0x1111111111111111111111111111111111111111",
            aliases: ["BTC", "XBT"]
          },
          available: "1.25",
          locked: "0.25",
          total: "1.50",
          as_of: "2026-01-01T00:00:00.000Z"
        }
      ],
      positions: [
        {
          account_id: "acct-1",
          asset: {
            canonical_id: "asset:btc",
            symbol: "BTC",
            decimals: 8,
            chain_id: 1,
            address: "0x1111111111111111111111111111111111111111",
            aliases: ["BTC", "XBT"]
          },
          quantity: "1.50",
          side: "long",
          notional_quote_asset: "asset:usd",
          notional_value: "150000.00",
          updated_at: "2026-01-01T00:00:00.000Z"
        }
      ],
      generated_at: "2026-01-01T00:00:00.000Z"
    });
  });
});
