# Branch Protection Required Settings (`main`)

These settings must be configured manually in GitHub UI:

1. Go to **Settings → Branches → Branch protection rules → Add rule**.
2. Branch name pattern: `main`.
3. Enable:
   - Require a pull request before merging
   - Require approvals (recommended: at least 1)
   - Dismiss stale pull request approvals when new commits are pushed
   - Require status checks to pass before merging
   - Require conversation resolution before merging
   - Require linear history (optional per governance)
   - Include administrators
4. Required status checks (exact names):
   - `typecheck`
   - `tests`
   - `lint-docs`
   - `dependency-security`

## Verification commands / evidence expectations

- Verify workflow names in repo:
  ```bash
  ls /home/runner/work/markets/markets/.github/workflows
  ```
- Verify job names in CI workflow:
  ```bash
  rg "^  (typecheck|tests|lint-docs|dependency-security):" /home/runner/work/markets/markets/.github/workflows/ci.yml
  ```
- Evidence expected in GitHub UI:
  - branch protection rule screenshot/config export
  - PR checks page showing required checks passing
