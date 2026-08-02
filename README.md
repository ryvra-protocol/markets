# Ryvra Markets

Ryvra Markets is the execution module for crypto, RWA, and metals trading on Ryvra.

It defines the baseline for:
- market intents and order workflows
- quote validation and execution routing
- deterministic Uniswap quote adapter behind canonical `QuoteProvider`
- deterministic custom fee engine (`RawQuote` -> `FeeBreakdown` + `NetQuote`)
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

## Policy gate compatibility

- `MarketsService.submitIntentV2` is the PR4-native pre-trade entrypoint.
  - `DENY` fails fast with typed `PolicyDeniedError`.
  - `REVIEW` returns a `review_required` result and halts routing.
- `MarketsService.submitIntent` remains as a compatibility shim and maps policy outcomes to legacy `{ accepted: false, reason_codes }`.
