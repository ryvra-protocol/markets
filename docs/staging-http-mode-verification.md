# Staging HTTP-Mode Verification

## Purpose

Verify production-like HTTP-mode behavior before cutover, with evidence for reliability and safety controls.

## Environment contract

Set these environment variables before running the harness:

- `STAGING_BASE_URL` (required)
- `STAGING_SUBMIT_PATH` (default `/v1/markets/intents`)
- `STAGING_CALLBACK_PATH` (default `/v1/markets/callbacks`)
- `STAGING_STATUS_PATH` (default `/v1/markets/orders`)
- `STAGING_RECON_PATH` (default `/v1/markets/reconciliation`)
- `STAGING_AUTH_TOKEN` (optional bearer token)
- `STAGING_TIMEOUT_MS` (default `2000`)
- `STAGING_RETRY_COUNT` (default `2`)

Run:

```bash
pnpm run staging:http:verify
```

## Scenarios and expected evidence

### 1) Timeout + retry behavior
- Scenario: force delayed callback/submit response beyond timeout threshold.
- Expected evidence:
  - client timeout logged
  - bounded retries occur (`STAGING_RETRY_COUNT`)
  - final status is either accepted once or cleanly failed without duplicate side effects

### 2) Duplicate callback replay safety
- Scenario: send same callback payload twice with identical `idempotency_key` and `reference_id`.
- Expected evidence:
  - second callback accepted as replay/no-op (no duplicate terminal transition)
  - order state remains unchanged after first terminal application

### 3) Late callback ordering (no terminal-state regression)
- Scenario: apply terminal callback, then send earlier-state callback.
- Expected evidence:
  - late callback ignored/rejected
  - no transition from terminal state back to non-terminal state

### 4) Reconciliation correctness
- Scenario: invoke reconciliation endpoint after scenario runs.
- Expected evidence:
  - mismatches identified and resolved/flagged
  - reconciled status aligns with authoritative ledger/execution source-of-truth

## Executable checklist

- [ ] Harness executed with non-empty `STAGING_BASE_URL`
- [ ] Timeout/retry evidence captured in logs/artifacts
- [ ] Duplicate replay evidence captured (no duplicate side effects)
- [ ] Late callback ordering evidence captured (no regression)
- [ ] Reconciliation report captured and reviewed
- [ ] Verification sign-off recorded by Eng + Ops
