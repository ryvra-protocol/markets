# Changelog

All notable changes to this project are documented in this file.

## [0.1.0-rc.1] - 2026-07-31

### Added
- Production rollout documentation set:
  - `docs/release-candidate.md`
  - `docs/compatibility-matrix.md`
  - `docs/staging-http-mode-verification.md`
  - `docs/production-cutover-runbook.md`
  - `docs/rollback-runbook.md`
  - `docs/incident-response-template.md`
  - `docs/dependency-policy.md`
  - `docs/branch-protection-required-settings.md`
  - `docs/production-ready-checklist.md`
- Rollout validation scripts:
  - `scripts/validate-version-consistency.mjs`
  - `scripts/check-rollout-docs.mjs`
  - `scripts/staging-http-mode-harness.mjs`
- CI gate split into required-check candidates: `typecheck`, `tests`, `lint-docs`, `dependency-security`.

### Changed
- Updated `SECURITY.md` with reporting channels, triage SLAs, and severity handling.
- Release candidate packaging baseline declared at `0.1.0-rc.1`.
