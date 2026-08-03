# Settlement and reconciliation runbook (PR6)

## Settlement lifecycle states

- `settlement.submitted` (`SUBMITTED`): execution tx accepted for submission with correlation, intent, and execution IDs.
- `settlement.pending` (`PENDING`): tx submitted but not yet confirmed/finalized.
- `settlement.confirmed` (`CONFIRMED`): tx confirmed on-chain.
- `settlement.reorg_detected` (`REORG_DETECTED`): reorg signal detected while tracking settlement.
- `settlement.finalized` (`FINALIZED`): confirmation depth reached configured finality threshold.
- `settlement.failed` (`FAILED`): terminal failure (`reverted_tx`, `dropped_tx`, `stale_pending`, `missing_receipt_timeout`).
- `settlement.escalated` (`ESCALATED`): incident/escalation required.

## Common failure modes

### Policy/build/AA integration triage (H2 hardening)

1. **Policy dependency timeout/ambiguous signal**
   - Symptom: `markets.execution.blocked` with `policy_dependency_timeout` or `policy_dependency_ambiguous`.
   - Action: treat as fail-closed; do not force execution. Validate policy dependency health and retry only after dependency recovery.
2. **Unified asset normalization failure**
   - Symptom: blocked reason code `unified_asset_*` or `execution_guardrail_violation` for chain/token/decimals mismatch.
   - Action: compare intent metadata against registry-normalized assets (chain, decimals, canonical IDs, token addresses) and correct upstream payload/registry data.
3. **AA4337 submission/receipt instability**
   - Symptom: `markets.aa4337.userop.failed` with `aa4337_submission_failed` or `aa4337_receipt_failed`.
   - Action: retry from same idempotency key boundary; verify submitted user operation hash inclusion before any re-send workflow.
4. **Execution adapter failure after ALLOW**
   - Symptom: `markets.execution.failed` with `execution_dependency_timeout` or `execution_dependency_failed`.
   - Action: inspect quote/build/route adapter health and upstream timeout budgets before replaying intent.

1. **Dropped tx** (`dropped_tx`)
   - Symptom: receipt status becomes dropped or tx disappears from mempool.
   - Action: request retry and escalate if repeated.
2. **Pending too long** (`stale_pending`)
   - Symptom: tx stays pending past configured timeout.
   - Action: request retry, inspect gas/nonce strategy, escalate.
3. **Missing receipt timeout** (`missing_receipt_timeout`)
   - Symptom: no receipt available before timeout.
   - Action: retry lookup/submission path and escalate.
4. **Reverted tx** (`reverted_tx`)
   - Symptom: on-chain revert/failed receipt.
   - Action: no blind retry; investigate route, slippage, and policy checks first.

## Reconciliation mismatch playbooks

Mismatch categories:
- `amount_mismatch`
- `fee_mismatch`
- `status_mismatch`
- `missing_receipt`
- `stale_pending`

Playbook:
1. Correlate by `correlation_id`, `intent_id`, `execution_id`.
2. Compare intended execution, submitted tx payload, and observed receipt.
3. Confirm whether mismatch is data lag vs true settlement inconsistency.
4. If true mismatch, emit escalation and open incident using checklist template.
5. Record final disposition in settlement audit log.

## Manual remediation steps

1. Verify tx hash, chain id, nonce, and route id for the affected execution.
2. Re-run reconciliation and persist machine-readable result.
3. For `dropped_tx` or `missing_receipt_timeout`, trigger retry hook.
4. For `reverted_tx` or repeated stale pending, halt automatic retries and escalate to incident response.
5. Update stakeholders with current lifecycle state and expected next action.

## Alerts and suggested dashboards

### Alert thresholds

- `settlement_failure_total` rate > 2% over 15m
- `reconciliation_mismatch_total` > 0 over 5m for production chains
- `settlement_time_to_confirm_ms` p95 above configured SLO for 15m
- `settlement.pending` age crossing `pendingTimeoutMs`

### Suggested dashboards

- Settlement lifecycle volume by event type/state and chain.
- Success/failure counts split by reason code.
- Reconciliation mismatch counts by category.
- Confirmation latency histogram (`settlement_time_to_confirm_ms`).
