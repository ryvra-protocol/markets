# Uniswap quote adapter

This adapter implements domain `QuoteProvider` behind `UniswapQuoteProvider` and keeps all Uniswap-specific quote payload shapes inside `src/adapters/uniswap/`.

## Scope

- Read-only quote path only.
- Produces canonical domain `RawQuote`.
- Enforces chain + pair support config.
- Includes freshness metadata: `quotedAt`, `validUntil`, `quote_id`.

## Files

- `src/adapters/uniswap/uniswap-quote-provider.ts`
- `src/adapters/uniswap/mappers.ts`
- `src/adapters/uniswap/config.ts`

## Deterministic normalization

`mappers.ts` applies deterministic amount normalization:

- decimal -> atomic-unit conversion with explicit rounding modes
- exact-in path: output rounded down (conservative)
- exact-out path: required input rounded up (conservative)
- gas estimate rounded up to integer units

`quote_id` is derived as a deterministic hash of canonical `RawQuote` fields.

## Supported assumptions (default config)

Current default configuration includes Ethereum mainnet (`chainId=1`) and pairs:

- `USDC/WETH`
- `WETH/USDC`
- `USDC/WBTC`
- `WBTC/USDC`

Extension points:

- add chain entries in `DEFAULT_UNISWAP_ADAPTER_CONFIG`
- widen `supportedPairs`
- swap the quote client implementation (`UniswapQuoteClient`) to a real SDK-backed client

## Failure modes

Provider emits typed failures via `UniswapQuoteProviderError`:

- `UNSUPPORTED_CHAIN`
- `UNSUPPORTED_PAIR`
- `NO_ROUTE`
- `STALE_QUOTE`
- `PROVIDER_ERROR`

The adapter remains isolated behind `QuoteProvider`; external layers consume only canonical domain quote models.
