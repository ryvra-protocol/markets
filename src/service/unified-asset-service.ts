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

export class UnifiedAssetNormalizationError extends Error {
  constructor(
    message: string,
    readonly reason_code:
      | "unified_asset_invalid_chain"
      | "unified_asset_invalid_decimals"
      | "unified_asset_duplicate_pair"
      | "unified_asset_invalid_address"
  ) {
    super(message);
    this.name = "UnifiedAssetNormalizationError";
  }
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeAddress(value: string | undefined): string | undefined {
  const normalized = normalizeText(value)?.toLowerCase();
  return normalized ? normalized : undefined;
}

function isHexAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

function normalizeAsset(input: AssetRegistryResolvedAsset): UnifiedAsset {
  const symbol = input.symbol.trim().toUpperCase();
  const canonicalId = input.canonical_id.trim().toLowerCase();
  const address = normalizeAddress(input.address);
  const name = normalizeText(input.name);
  const aliases =
    input.aliases
      ?.map((alias) => alias.trim().toUpperCase())
      .filter((alias) => alias.length > 0)
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

function assertNormalizedAssetInvariants(asset: UnifiedAsset, expectedChainId: number): void {
  if (!Number.isInteger(asset.chain_id) || asset.chain_id <= 0 || asset.chain_id !== expectedChainId) {
    throw new UnifiedAssetNormalizationError("resolved asset chain_id is incompatible with execution chain", "unified_asset_invalid_chain");
  }
  if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 36) {
    throw new UnifiedAssetNormalizationError("resolved asset decimals are invalid", "unified_asset_invalid_decimals");
  }
  if (asset.address && !isHexAddress(asset.address)) {
    throw new UnifiedAssetNormalizationError("resolved asset address is invalid", "unified_asset_invalid_address");
  }
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
    assertNormalizedAssetInvariants(assets.base_asset, input.chain_id);
    assertNormalizedAssetInvariants(assets.quote_asset, input.chain_id);
    if (assets.base_asset.canonical_id === assets.quote_asset.canonical_id) {
      throw new UnifiedAssetNormalizationError("base and quote assets must resolve to distinct canonical assets", "unified_asset_duplicate_pair");
    }

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
