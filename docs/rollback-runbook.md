# Rollback Runbook

## Trigger conditions

Trigger rollback if any of the following is true:
- cutover abort threshold breached
- incorrect order terminal transitions detected
- duplicate replay creates financial or ledger inconsistency
- severe security issue detected during rollout

## Roles

- Engineering: execute application rollback and validate service health
- Operations: coordinate rollout freeze/unfreeze and monitor systems
- Security: triage security implications and sign off containment

## Rollback steps

1. Declare rollback in incident channel and freeze new traffic shifts.
2. Revert deployment to last known-good release.
3. Disable or gate callback ingress if replay/storm is active.
4. Run reconciliation to identify impacted references.
5. Validate order lifecycle integrity for impacted set.
6. Confirm stabilization metrics for 15-minute window.
7. Publish rollback completion update with impact summary.
8. Open post-incident review using `docs/incident-response-template.md`.

## Rollback verification

- Required checks are green on fallback commit.
- Error rates return below pre-cutover baseline.
- No new terminal-state regressions after rollback.
- Reconciliation mismatch backlog is controlled and tracked.
