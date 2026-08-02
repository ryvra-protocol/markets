# Settlement configuration reference (PR6)

## Timeouts

- `pendingTimeoutMs`
  - Max allowed age for pending tx before classified as `stale_pending`.
- `missingReceiptTimeoutMs`
  - Max elapsed time without receipt before `missing_receipt_timeout` failure.

## Finality

- `finalityConfirmations`
  - Confirmation depth required before emitting `settlement.finalized`.

## Reconciliation thresholds

- `stalePendingThresholdMs` (reconciliation input)
  - Threshold used to classify `stale_pending` when receipt is absent.

## Polling behavior

- `maxPollAttempts`
  - Number of receipt polling attempts per tracking invocation.

## Metrics emitted

- `settlement_success_total`
- `settlement_failure_total`
- `reconciliation_mismatch_total`
- `settlement_time_to_confirm_ms`

## Retry/escalation hooks

- `onRetryRequested`
  - Called for `dropped_tx`, `stale_pending`, and `missing_receipt_timeout`.
- `onEscalationRequested`
  - Called for terminal failures and explicit escalations.
