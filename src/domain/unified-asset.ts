export interface UnifiedAsset {
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

export interface UnifiedBalance {
  asset: UnifiedAsset;
  available: string;
  locked: string;
  total: string;
  as_of: string;
}

export interface AssetPosition {
  account_id: string;
  asset: UnifiedAsset;
  quantity: string;
  side: "long" | "short" | "flat";
  notional_quote_asset?: string;
  notional_value?: string;
  updated_at: string;
}

export interface ExposureSnapshot {
  account_id: string;
  balances: readonly UnifiedBalance[];
  positions: readonly AssetPosition[];
  generated_at: string;
}
