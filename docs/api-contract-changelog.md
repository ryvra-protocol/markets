# API Contract Changelog

## 2026-08-08 — Initial canonical publication (`MARKETS_API_VERSION=2026-08-08`)

- Published canonical OpenAPI contract at `/home/runner/work/markets/markets/openapi/markets.openapi.yaml`.
- Canonicalized read-model endpoints for instruments, orders, positions, overview, and health.
- Published canonical auth/header behavior (`Authorization`, `x-request-id`, `x-correlation-id`, `idempotency-key` semantics).
- Published reusable canonical error model (`code`, `message`, `retryable`, `source`, optional `details`) with representative 4xx/5xx examples.
- Published enums for order, position, instrument, exposure, and reason-code literals used by clients.
- Defined breaking change and deprecation policy, including migration windows and deprecated transition fields/params.

## Update rule

Any PR changing endpoints, schema shape, enum values, auth/header behavior, or error semantics must append a dated entry in this file.
