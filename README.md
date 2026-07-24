# Ryvra Markets

Ryvra Markets is the execution module for crypto, RWA, and metals trading on Ryvra.

It defines the baseline for:
- market intents and order workflows
- quote validation and execution routing
- post-trade settlement hooks
- canonical IDs: `reference_id`, `idempotency_key`, `correlation_id`
- canonical policy decisions: `ALLOW`, `DENY`, `REVIEW` with non-empty DENY `reason_codes`

**Status:** early draft / not production-ready.

## Architecture Overview

```text
client/API -> markets service -> policy checks -> execution adapter -> ledger settlement
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
