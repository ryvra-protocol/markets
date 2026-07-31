# Compatibility Matrix Baseline

Release baseline: `0.1.0-rc.1`

| Organization repository | Expected protocol/core contract baseline | Status | Notes |
|---|---|---|---|
| pay | `market-intent@0.1`, `policy-decision@0.1`, `order-lifecycle@0.1` | PARTIAL | Requires downstream adoption verification in pay CI/integration tests. |
| markets | `market-intent@0.1`, `policy-decision@0.1`, `order-lifecycle@0.1` | DONE | Canonical contract and service tests present in this repository. |
| policy-risk | `policy-decision@0.1` | PARTIAL | Must validate reason-code and REVIEW/DENY semantics in policy-risk integration suite. |
| ledger-settlement | `settlement-request@0.1` | PARTIAL | Must validate settlement callback/reconciliation behavior against staging. |
| accounts | `account-id@0.1` | PARTIAL | Ensure account identity propagation and auth constraints in integration tests. |
| asset-registry | `asset-symbol@0.1` | PARTIAL | Validate asset canonicalization and precision expectations. |
| website/docs | `public-api-docs@0.1` | TODO | Publish RC documentation and compatibility references publicly. |

## Baseline contract references

- `MarketIntent`: `/home/runner/work/markets/markets/src/types/market-intent.ts`
- `PolicyDecision`: `/home/runner/work/markets/markets/src/adapters/policy-client.ts`
- `Order lifecycle vocabulary`: `/home/runner/work/markets/markets/src/types/order.ts`
