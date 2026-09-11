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

## API Contract

- Canonical OpenAPI contract: [`openapi/markets.openapi.yaml`](openapi/markets.openapi.yaml)
- Versioning and compatibility policy: [`docs/api-contract.md`](docs/api-contract.md)
- Contract changelog: [`docs/api-contract-changelog.md`](docs/api-contract-changelog.md)

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


## RFC-0015 programmable-authority upgrades

- `TradeIntent` and `MarketIntent` now support structured programmable-authority metadata:
  - `actorType`, `actorId`, `agentId`
  - `mandateId`, `riskAssessmentId`, `authorizationId`
  - `policyVersion`, `policyHash`, `intentId`
  - `privacyMode`, `executionMode`
  - deterministic `authority` references for mandate scope, policy compatibility, risk compatibility, funding readiness, and intent expiry
- Execution semantics are explicit and deterministic:
  - `PUBLIC`: existing execution path with full provenance exposure
  - `PRIVATE`: existing execution path with reduced provenance exposure in observer/log payloads
  - `CONFIDENTIAL`: explicit deterministic reject via `execution_mode_confidential_unsupported` until a confidential handoff engine exists
- Privacy semantics are explicit and deterministic:
  - `TRANSPARENT`: full provenance exposure to observer payloads
  - `SHIELDED`: redacted observer provenance
  - `CONFIDENTIAL`: redacted observer provenance and reserved for confidential handling contracts
- Agentic/app flows are gated before routing on deterministic authority checks for:
  - mandate scope/activity
  - compatible policy decision
  - compatible risk decision and limits
  - funding/reservation readiness when required
  - non-expired intent window
  - replay-safe idempotency
- Provenance is propagated through policy evaluation, execution build inputs, AA4337 user operation handling, routing, and settlement handoff. Audit-linked fields include:
  - `agentId`, `mandateId`, `intentId`, `authorizationId`, `riskAssessmentId`, `policyVersion`, `policyHash`
  - `userOperationHash` when AA4337 is used
  - `txHash` and settlement references at handoff time
- Audit query surfaces now include `intent_id`, `agent_id`, and `mandate_id` filters on markets order reads.

### Audit examples

- Find all orders for a delegated strategy run: `GET /markets/orders?account_id=acct_123&agent_id=agent_12`
- Trace an intent across execution: `GET /markets/orders?account_id=acct_123&intent_id=intent_3a81`
- Review all fills under a mandate: `GET /markets/orders?account_id=acct_123&mandate_id=mandate_8`

### RFC mapping

- RFC-0015: programmable-authority metadata, deterministic authority checks, privacy/execution mode handling, provenance propagation
- Dependency alignment already present in this repository:
  - PR4 policy gate normalization
  - PR5 deterministic execution payload guardrails
  - PR6 settlement lifecycle + reconciliation hooks
  - PR7 unified asset normalization
  - PR8 AA4337 user operation integration
