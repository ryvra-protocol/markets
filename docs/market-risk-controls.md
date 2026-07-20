# Market Risk Controls

## Position and Size Limits (Interface-Level)

- enforce per-order size guardrails
- enforce aggregate position thresholds
- support account-tier specific limits

Limit values are **TBD by governance/policy**.

## Per-Asset and Per-User Restrictions

- user eligibility by asset class and jurisdiction profile
- deny/allow lists at account or policy scope
- asset-level restrictions from asset-registry and policy-risk

## Volatility Controls and Circuit-Breakers

- dynamic volatility checks against configured thresholds
- temporary route halts on abnormal spread or execution variance
- market-wide and asset-specific circuit-breakers

Thresholds and activation policies are **TBD by governance/policy**.

## Suspicious Activity Flags and Trade Eligibility

- suspicious activity flags may reduce eligibility or block routing
- flagged intents must return deterministic denial reason codes
- manual review hooks are **TBD by governance/policy**

## Integration with Policy-Risk Reason Codes

Markets must consume and propagate policy-risk reason codes for:
- pre-trade denials
- pre-settlement denials
- risk escalations and compensating events
