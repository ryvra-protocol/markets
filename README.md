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

## Execution tx builder + guardrails (PR5)

- Deterministic execution tx payload construction is implemented in `ExecutionTxBuilder`.
- Hard guardrails cover slippage, deadlines, quote/amount sanity, chain/recipient, token integrity, and replay protection.
- Builder emits sanitized structured events:
  - `markets.execution.build.started`
  - `markets.execution.build.succeeded`
  - `markets.execution.build.failed`

See `/home/runner/work/markets/markets/docs/execution-tx-builder.md` for contract, guardrail matrix, and error taxonomy.

## Settlement events + reconciliation hooks + ops readiness (PR6)

- Typed settlement lifecycle events are implemented with deterministic payload normalization:
  - `settlement.submitted`
  - `settlement.pending`
  - `settlement.confirmed`
  - `settlement.failed`
  - `settlement.reorg_detected`
  - `settlement.finalized`
- Reconciliation hooks provide machine-readable status and discrepancy categories:
  - `amount_mismatch`
  - `fee_mismatch`
  - `status_mismatch`
  - `missing_receipt`
  - `stale_pending`
- Settlement tracking includes explicit failure handling for dropped/pending-too-long tx, reverted tx, and missing receipt timeout, with retry and escalation hook points.
- Structured settlement observability includes correlation continuity and minimal metrics:
  - `settlement_success_total`
  - `settlement_failure_total`
  - `reconciliation_mismatch_total`
  - `settlement_time_to_confirm_ms`

Ops readiness docs:
- `/home/runner/work/markets/markets/docs/ops/settlement-runbook.md`
- `/home/runner/work/markets/markets/docs/ops/settlement-incident-checklist.md`
- `/home/runner/work/markets/markets/docs/ops/settlement-config-reference.md`

## Unified asset model integration (PR7)

- Canonical unified asset contracts are available in `src/domain/unified-asset.ts`:
  - `UnifiedAsset`
  - `UnifiedBalance`
  - `AssetPosition`
  - `ExposureSnapshot`
- Pre-trade flow can resolve canonical assets through `AssetRegistryClient` and `UnifiedAssetService`.
- Asset normalization occurs before execution payload build and emits:
  - `markets.asset.normalization`

## ERC-4337 execution integration (PR8)

- ALLOW-path account abstraction execution is integrated via accounts runtime surfaces:
  - `build`
  - `simulate`
  - `send`
  - `getReceipt`
- UserOperation request build is derived from PR7 normalized unified assets.
- DENY/REVIEW outcomes remain non-executable and never invoke AA4337 userop submission.
- Sanitized lifecycle observability is emitted:
  - `markets.aa4337.userop.submitted`
  - `markets.aa4337.userop.included`
  - `markets.aa4337.userop.failed`
- H2 execution-path hardening metrics:
  - `markets_allow_path_total`
  - `markets_execution_blocked_total`
  - `markets_execution_failure_total`
