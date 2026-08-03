export interface AssetRegistryResolvedAsset {
  canonical_id: string;
  symbol: string;
  decimals: number;
  chain_id: number;
  address?: string;
  name?: string;
  asset_class?: "crypto" | "fiat" | "rwa" | "metal" | string;
  aliases?: readonly string[];
  metadata?: Record<string, string>;
}

export interface ResolveAssetInput {
  asset: string;
  chain_id: number;
  correlation_id?: string;
}

export interface AssetRegistryClient {
  resolve_asset(input: ResolveAssetInput): Promise<AssetRegistryResolvedAsset>;
}
