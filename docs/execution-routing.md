# Execution Routing

## Routing Objectives

- best execution constraints under policy and venue capabilities
- liquidity source prioritization by configured route policy
- fallback paths when primary route fails or invalidates

Route policy details are **TBD by governance/policy**.

## Slippage Controls and Partial Fill Policy

- enforce per-intent `max_slippage_bps`
- reject routes that exceed tolerance versus quote
- allow partial fills when configured and policy-approved
- remaining quantity can be rerouted or canceled based on route policy (**TBD by governance/policy**)

## Timeout Behavior and Route Invalidation

- route attempt has bounded timeout
- route invalidates on venue timeout, stale quote, or policy denial
- invalid route may trigger fallback attempt sequence
- final failure emits terminal event with reason code

## Observability Metrics

Track at minimum:
- fill rate
- route success rate
- execution latency
- slippage vs quote
