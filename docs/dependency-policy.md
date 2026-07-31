# Dependency Update and Security Policy

## Policy

1. Pin package manager and runtime versions in-repo.
2. Update dependencies in small batches with changelog review.
3. Run `pnpm audit --audit-level high` for every PR touching dependencies.
4. Block production rollout on unresolved high/critical dependency vulnerabilities.
5. Record dependency update rationale in PR description.

## Cadence

- Weekly: review outdated dependencies and advisories.
- Monthly: proactive update cycle for non-breaking upgrades.
- Emergency: immediate patching for exploited/high-risk CVEs.

## Approval

- Engineering + Security approval required for high-impact dependency changes.
