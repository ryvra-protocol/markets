# Contributing

## RFC-First Requirement

Breaking lifecycle or schema changes (including market intent, quote, and order state model updates) must be proposed via RFC before merge.

## Pull Request Checklist

- [ ] Tests added/updated as applicable
- [ ] Documentation updated
- [ ] policy-risk reason-code impacts reviewed and documented
- [ ] Backward compatibility assessed for interface changes
- [ ] PNPM-only package manager usage preserved (pnpm 10.16.0)

## Commit Conventions

Use Conventional Commits where practical:
- `feat:` new capabilities
- `fix:` bug fixes
- `docs:` documentation-only updates
- `chore:` maintenance/build updates
- `test:` test updates
