# Ryvra Markets

Ryvra Markets is the execution module for crypto, RWA, and metals trading on Ryvra.

It defines the baseline for:
- market intents and order workflows
- quote validation and execution routing
- deterministic Uniswap quote adapter behind canonical `QuoteProvider`
- post-trade settlement hooks
- canonical IDs: `reference_id`, `idempotency_key`, `correlation_id`
- canonical policy decisions: `ALLOW`, `DENY`, `REVIEW` with non-empty DENY `reason_codes`
- canonical domain contracts for staged pipeline execution (`TradeIntent`, `PolicyDecision`, `RawQuote`/`NetQuote`, `FeeBreakdown`, `ExecutionPlan`, `SettlementEvent`)

**Status:** early draft / not production-ready.

## Architecture Overview

```text
client/API -> intent normalization -> policy gate -> raw quote -> fee layer -> execution planning -> settlement event
```

## Dependencies

Ryvra Markets integrates with:
- accounts
- asset-registry
- ledger-settlement
- policy-risk

## Quickstart

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
