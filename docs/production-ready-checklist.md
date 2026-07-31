# Production Ready Checklist

## Contracts integrity
- [x] **DONE** Canonical market intent and ID contract baselines declared (`src/types/market-intent.ts`, `docs/compatibility-matrix.md`).
- [x] **DONE** Canonical order lifecycle vocabulary enforced (`src/types/order.ts`, `test/order-state-machine.spec.ts`).

## Adapter reliability
- [~] **PARTIAL** Staging HTTP-mode scenarios documented with executable harness (`docs/staging-http-mode-verification.md`, `scripts/staging-http-mode-harness.mjs`) — pending environment execution evidence.
- [x] **DONE** Idempotent replay and policy reason-code safeguards covered by tests (`test/markets-service-contract.spec.ts`).

## CI enforcement
- [x] **DONE** Required check candidates split and explicit (`.github/workflows/ci.yml`: `typecheck`, `tests`, `lint-docs`, `dependency-security`).
- [x] **DONE** Toolchain versions pinned for determinism (`package.json`, `.github/workflows/ci.yml`).

## Security posture
- [x] **DONE** Security reporting + triage SLA defined (`SECURITY.md`).
- [x] **DONE** Dependency update/security policy documented (`docs/dependency-policy.md`).
- [~] **PARTIAL** Branch protection enforcement requires manual GitHub UI configuration (`docs/branch-protection-required-settings.md`).

## Release / rollback readiness
- [x] **DONE** Release candidate package and scope declared (`CHANGELOG.md`, `docs/release-candidate.md`).
- [x] **DONE** Production cutover + rollback runbooks present (`docs/production-cutover-runbook.md`, `docs/rollback-runbook.md`).

## Observability / runbooks
- [x] **DONE** Incident response template available (`docs/incident-response-template.md`).
- [ ] **TODO** Attach staged verification evidence artifacts to final production go/no-go review.
