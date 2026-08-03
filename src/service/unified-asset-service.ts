import type { AssetRegistryClient, AssetRegistryResolvedAsset } from "../adapters/asset-registry-client.js";
import type { ExposureSnapshot, UnifiedAsset } from "../domain/unified-asset.js";

export interface UnifiedAssetPair {
  base_asset: UnifiedAsset;
  quote_asset: UnifiedAsset;
}

export interface UnifiedAssetPreTradeContext {
  assets: UnifiedAssetPair;
  exposure?: ExposureSnapshot;
}

export interface ExposureSnapshotProvider {
  get_exposure_snapshot(input: {
    account_id: string;
    assets: UnifiedAssetPair;
    correlation_id: string;
  }): Promise<ExposureSnapshot>;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeAsset(input: AssetRegistryResolvedAsset): UnifiedAsset {
  const symbol = input.symbol.trim().toUpperCase();
  const canonicalId = input.canonical_id.trim().toLowerCase();
  const address = normalizeText(input.address)?.toLowerCase();
  const name = normalizeText(input.name);
  const aliases =
    [...new Set(input.aliases?.map((alias) => alias.trim().toUpperCase()).filter((alias) => alias.length > 0) ?? [])]
      .sort() ?? [];
  const metadata = input.metadata
    ? Object.fromEntries(
        Object.entries(input.metadata)
          .map(([key, value]) => [key.trim(), value.trim()] as const)
          .filter(([key, value]) => key.length > 0 && value.length > 0)
          .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      )
    : undefined;

  return {
    canonical_id: canonicalId,
    symbol,
    decimals: input.decimals,
    chain_id: input.chain_id,
    address,
    name,
    asset_class: input.asset_class,
    aliases,
    metadata
  };
}

export class UnifiedAssetService {
  constructor(
    private readonly assetRegistry: AssetRegistryClient,
    private readonly exposureSnapshotProvider?: ExposureSnapshotProvider
  ) {}

  async normalize_pre_trade_assets(input: {
    base_asset: string;
    quote_asset: string;
    chain_id: number;
    account_id?: string;
    correlation_id: string;
  }): Promise<UnifiedAssetPreTradeContext> {
    const [base, quote] = await Promise.all([
      this.assetRegistry.resolve_asset({
        asset: input.base_asset,
        chain_id: input.chain_id,
        correlation_id: input.correlation_id
      }),
      this.assetRegistry.resolve_asset({
        asset: input.quote_asset,
        chain_id: input.chain_id,
        correlation_id: input.correlation_id
      })
    ]);

    const assets: UnifiedAssetPair = {
      base_asset: normalizeAsset(base),
      quote_asset: normalizeAsset(quote)
    };

    if (!this.exposureSnapshotProvider || !input.account_id) {
      return { assets };
    }

    const exposure = await this.exposureSnapshotProvider.get_exposure_snapshot({
      account_id: input.account_id,
      assets,
      correlation_id: input.correlation_id
    });
    return { assets, exposure };
  }
}
