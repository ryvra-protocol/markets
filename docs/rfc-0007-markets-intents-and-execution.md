# RFC-0007: Markets Intents and Execution (v1)

## Scope

This RFC defines the v1 interface-first baseline for market intent ingestion, quote usage, order lifecycle, routing abstraction, policy checkpoints, and settlement hooks.

Non-final controls are **TBD by governance/policy**.

## 1. Market Intent Schema (v1)

A market intent expresses user-side execution instructions.

Required fields:
- `side`: `buy` | `sell`
- `base_asset`: canonical base asset id
- `quote_asset`: canonical quote asset id
- `size`: positive decimal quantity in base units
- `max_slippage_bps`: max tolerated slippage in basis points
- `ttl_ms`: intent validity from creation time
- `client_ref`: client-provided idempotency reference

Recommended metadata:
- `account_id`
- `created_at`
- `meta` (opaque key-value map)

## 2. Quote Model and Validity Windows

Quote fields:
- `quote_id`
- `base_asset`
- `quote_asset`
- `side`
- `price`
- `max_size`
- `valid_from`
- `valid_until`
- `source`

Validity requirements:
- A quote is usable only within `[valid_from, valid_until]`.
- Intent checks MUST ensure asset pair/side compatibility and quote freshness.
- Expired quotes MUST be rejected and require re-quote.

## 3. Order Lifecycle States

Canonical states:
- `created`
- `validated`
- `routed`
- `partially_filled`
- `filled`
- `canceled`
- `expired`
- `failed`
- `settled`

State semantics:
- transitions are append-only in event history
- terminal states: `canceled`, `expired`, `failed`, `settled`
- `settled` requires successful settlement confirmation

## 4. Execution Adapter Interface (DEX/CEX/RFQ)

Execution backends are abstracted behind a common adapter:
- quote fetch/refresh capability
- order submission and cancellation
- execution update stream polling/push hooks

Adapter implementations may target:
- DEX router contracts
- CEX APIs
- RFQ counterparties

## 5. Policy Checkpoints

### Pre-trade checkpoint
Validate:
- account eligibility
- user and asset restrictions
- position and size limit constraints
- suspicious activity policy flags

### Pre-settlement checkpoint
Validate:
- fill reconciliation integrity
- settlement eligibility and holds
- policy-risk reason code outcomes

All policy constraints and thresholds are **TBD by governance/policy**.

## 6. Idempotency and Retry Semantics

- `client_ref` + account scope defines idempotency key.
- Duplicate submission with same idempotency key must return existing order context.
- Retries must be safe under network and adapter timeouts.
- Non-destructive retries must emit compensating events rather than mutate historical records.

## 7. Eventing / Webhook Requirements

Markets emits durable order and execution events:
- `order.created`
- `order.validated`
- `order.routed`
- `order.partially_filled`
- `order.filled`
- `order.canceled`
- `order.expired`
- `order.failed`
- `order.settled`

Delivery requirements:
- at-least-once delivery
- monotonic sequence per order
- idempotent consumer guidance
- signature/authn requirements are **TBD by governance/policy**

## 8. Failure Handling via Compensating Events

Failure handling is event-driven and non-destructive:
- do not rewrite or delete prior lifecycle events
- emit compensating events for rollback/mitigation intent
- include reason codes and correlation ids for observability and audits

This preserves forensic traceability and policy/risk explainability.
