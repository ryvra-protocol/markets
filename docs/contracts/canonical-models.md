# Canonical models and contracts

## Canonical models

- `TradeIntent` (`src/domain/trade-intent.ts`)
  - side, assets, exact-in/exact-out amount, wallet/account context, chain, slippage, deadline, metadata
  - canonical IDs: `intent_id`, `correlation_id`, `idempotency_key`
- `PolicyDecision` (`src/domain/policy-decision.ts`)
  - `decision`, `reason_codes`, `policy_version`, `explanation`
- `RawQuote` and `NetQuote` (`src/domain/quote.ts`)
  - route hops, price impact/gas estimates (optional), quote freshness metadata
- `FeeBreakdown` (`src/domain/fee-breakdown.ts`)
  - `platformFee`, `partnerFee`, `sponsorOffset`, `grossAmount`, `netAmount`, `asset`, `fee_policy_version`
- `ExecutionPlan` (`src/domain/execution-plan.ts`)
  - route summary, bounds (`minOut`/`maxIn`), expiry, calldata envelope placeholder, IDs
- `SettlementEvent` (`src/domain/settlement-event.ts`)
  - ledger-settlement friendly envelope with quote, fee, policy, and execution metadata
- `SettlementLifecycleEvent` (`src/domain/settlement-event.ts`)
  - typed settlement lifecycle transitions with stable schema:
    - `correlation_id`, `intent_id`, `execution_id`
    - `chainId`, `txHash`, `blockNumber`
    - `status`, `timestamp`, optional `reason_code`/`error_code`
  - deterministic normalization + metadata sanitization

## Domain contracts

Defined in `src/domain/contracts.ts`:

- `QuoteProvider`
- `FeeEngine`
- `PolicyClient`
- `ExecutionPlanner`
- `SettlementEmitter`

Settlement reconciliation/tracking contracts (PR6) in `src/service/settlement-reconciliation.ts`:

- `reconcileSettlement(...)` -> `SettlementReconciliationResult`
- discrepancy categories: `amount_mismatch`, `fee_mismatch`, `status_mismatch`, `missing_receipt`, `stale_pending`
- `SettlementTracker` with retry/escalation hooks and minimal metrics hooks

## Validation invariants

Defined in `src/domain/validation.ts`:

- Trade intent slippage range and future deadline checks
- DENY policy decisions require non-empty reason codes
- Fee arithmetic integrity: `gross - platform - partner + sponsorOffset = net`

## Out of scope in PR1

- No DEX SDK integration
- No policy-risk network integration
- No execution calldata construction beyond placeholder schema
