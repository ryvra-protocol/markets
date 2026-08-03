import { describe, expect, it } from "vitest";

import type { AssetRegistryClient, AssetRegistryResolvedAsset } from "../src/adapters/asset-registry-client.js";
import { UnifiedAssetService } from "../src/service/unified-asset-service.js";

class MockAssetRegistryClient implements AssetRegistryClient {
  constructor(private readonly byAsset: Record<string, AssetRegistryResolvedAsset>) {}

  async resolve_asset(input: { asset: string; chain_id: number }): Promise<AssetRegistryResolvedAsset> {
    const asset = this.byAsset[input.asset];
    if (!asset) {
      throw new Error(`missing mock asset: ${input.asset}`);
    }
    return asset;
  }
}

describe("UnifiedAssetService (golden normalization)", () => {
  it("normalizes registry assets deterministically", async () => {
    const registry = new MockAssetRegistryClient({
      BTC: {
        canonical_id: " ASSET:BTC ",
        symbol: " btc ",
        decimals: 8,
        chain_id: 1,
        address: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
        name: "  Bitcoin ",
        aliases: [" xbt ", " btc ", " bitcoin "],
        metadata: {
          " risk_tier ": " high ",
          category: "  store-of-value  "
        }
      },
      USD: {
        canonical_id: "asset:usd",
        symbol: "usd",
        decimals: 2,
        chain_id: 1,
        aliases: ["usd", " dollar "],
        metadata: {
          region: " global "
        }
      }
    });

    const service = new UnifiedAssetService(registry);
    const first = await service.normalize_pre_trade_assets({
      base_asset: "BTC",
      quote_asset: "USD",
      chain_id: 1,
      correlation_id: "corr-1"
    });
    const second = await service.normalize_pre_trade_assets({
      base_asset: "BTC",
      quote_asset: "USD",
      chain_id: 1,
      correlation_id: "corr-1"
    });

    expect(first).toEqual(second);
    expect(first.assets).toEqual({
      base_asset: {
        canonical_id: "asset:btc",
        symbol: "BTC",
        decimals: 8,
        chain_id: 1,
        address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        name: "Bitcoin",
        aliases: ["BITCOIN", "BTC", "XBT"],
        metadata: {
          category: "store-of-value",
          risk_tier: "high"
        }
      },
      quote_asset: {
        canonical_id: "asset:usd",
        symbol: "USD",
        decimals: 2,
        chain_id: 1,
        aliases: ["DOLLAR", "USD"],
        metadata: {
          region: "global"
        }
      }
    });
  });
});
