# API Contract Changelog

## 2026-08-08 — Initial canonical publication (`MARKETS_API_VERSION=2026-08-08`)

- Published canonical OpenAPI contract at `/home/runner/work/markets/markets/openapi/markets.openapi.yaml`.
- Canonicalized read-model endpoints for instruments, orders, positions, overview, and health.
- Published canonical auth/header behavior (`Authorization`, `x-request-id`, `x-correlation-id`, `idempotency-key` semantics).
- Published reusable canonical error model (`code`, `message`, `retryable`, `source`, optional `details`) with representative 4xx/5xx examples.
- Published enums for order, position, instrument, exposure, and reason-code literals used by clients.
- Defined breaking change and deprecation policy, including migration windows and deprecated transition fields/params.

## 2026-09-10 — RFC-0015 programmable-authority additive update

- Added programmable-authority audit query params for `intent_id`, `agent_id`, and `mandate_id` on markets order reads.
- Added additive order schema fields for actor/agent/mandate, policy provenance, privacy/execution modes, user operation hash, tx hash, and settlement references.
- Added canonical reason codes for deterministic authority validation failures and unsupported confidential execution mode.

## Update rule

Any PR changing endpoints, schema shape, enum values, auth/header behavior, or error semantics must append a dated entry in this file.
