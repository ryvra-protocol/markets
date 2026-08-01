import type { TradeIntent } from "../../domain/trade-intent.js";

export interface UniswapChainConfig {
  chainId: number;
  routerAddress: string;
  quoterAddress: string;
  defaultQuoteTtlSeconds: number;
  supportedPairs: readonly string[];
}

export interface UniswapAdapterConfig {
  source: string;
  chains: Record<number, UniswapChainConfig>;
}

export const DEFAULT_UNISWAP_ADAPTER_CONFIG: UniswapAdapterConfig = {
  source: "uniswap",
  chains: {
    1: {
      chainId: 1,
      routerAddress: "0xE592427A0AEce92De3Edee1F18E0157C05861564",
      quoterAddress: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
      defaultQuoteTtlSeconds: 30,
      supportedPairs: ["USDC/WETH", "WETH/USDC", "USDC/WBTC", "WBTC/USDC"]
    }
  }
};

function normalizeAsset(asset: string): string {
  return asset.trim().toUpperCase();
}

export function toPairKey(assetIn: string, assetOut: string): string {
  return `${normalizeAsset(assetIn)}/${normalizeAsset(assetOut)}`;
}

export function resolveChainConfig(config: UniswapAdapterConfig, chainId: number): UniswapChainConfig {
  const resolved = config.chains[chainId];
  if (!resolved) {
    throw new Error(`UNSUPPORTED_CHAIN:${chainId}`);
  }

  return resolved;
}

export function assertPairSupported(chainConfig: UniswapChainConfig, intent: TradeIntent): void {
  const pair = toPairKey(intent.assetIn, intent.assetOut);
  if (!chainConfig.supportedPairs.includes(pair)) {
    throw new Error(`UNSUPPORTED_PAIR:${pair}`);
  }
}
