# Production Cutover Runbook

## Owners

- Engineering owner: Markets Eng lead
- Operations owner: Platform/Ops on-call
- Security owner: Security incident commander

## Go / No-Go criteria

Go when all are true:
1. Required checks pass on target commit (`typecheck`, `tests`, `lint-docs`, `dependency-security`).
2. `docs/staging-http-mode-verification.md` checklist completed with evidence.
3. No unresolved high/critical security findings.
4. Branch protection required settings enabled on `main`.
5. Communication plan acknowledged by Eng/Ops/Sec.

No-Go if any criterion fails.

## Abort thresholds

Abort cutover immediately if any occurs during rollout window:
- sustained submit/callback error rate > 2% for 5 minutes
- terminal-state regression observed once
- duplicate replay causes double settlement/order side effects
- unresolved Sev-1/Sev-2 security event

## Communication plan

- T-30m: announce cutover start in engineering + ops + security channels
- T-0: announce cutover in progress
- T+15m/+30m: post health metrics and incident status
- Completion: announce success or rollback with rationale

## Cutover steps

1. Freeze deploys unrelated to markets service.
2. Confirm target SHA and required check pass status.
3. Confirm branch protection settings on `main`.
4. Confirm staging verification evidence bundle is complete.
5. Deploy release candidate commit.
6. Monitor health metrics and callback processing.
7. Run reconciliation endpoint and compare expected deltas.
8. If thresholds exceeded, execute rollback runbook.
9. If stable through monitoring window, declare cutover complete.
