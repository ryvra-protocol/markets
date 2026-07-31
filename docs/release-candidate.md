# Release Candidate Declaration

- Repository: `ryvra-protocol/markets`
- Release candidate: `0.1.0-rc.1`
- Baseline commit: `4b390c6` (plus this rollout-controls PR)
- Date: `2026-07-31`

## Scope

This RC covers core markets primitives and adapter boundaries for:
- market intent ingestion
- policy decision gating (`ALLOW`/`DENY`/`REVIEW`)
- quote validation and execution routing boundaries
- idempotent replay behavior at service boundary
- order lifecycle canonical vocabulary

## Included capabilities

- Canonical IDs enforced in domain contracts (`reference_id`, `idempotency_key`, `correlation_id`)
- Canonical policy reason code handling with safe fallback (`policy_*`)
- Canonical order lifecycle states and transition guard behavior
- Adapter interfaces for policy, execution, and settlement boundaries
- CI required-gate candidates for production cutover readiness

## Known limitations

- No in-repo live-provider integration tests (requires staging environment connectivity)
- No in-repo branch protection enforcement API (must be configured in GitHub UI; see `docs/branch-protection-required-settings.md`)
- Staging HTTP-mode checks require environment-specific endpoint wiring (see `docs/staging-http-mode-verification.md`)

## Evidence

- Contract + service behavior tests: `/home/runner/work/markets/markets/test`
- CI gate definitions: `/home/runner/work/markets/markets/.github/workflows/ci.yml`
- Version/package consistency script: `/home/runner/work/markets/markets/scripts/validate-version-consistency.mjs`
