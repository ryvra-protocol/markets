# Markets API Contract Policy

## Canonical contract source

- OpenAPI: `/home/runner/work/markets/markets/openapi/markets.openapi.yaml`
- Changelog: `/home/runner/work/markets/markets/docs/api-contract-changelog.md`

## API version marker

- Current marker: `MARKETS_API_VERSION=2026-08-08`
- The marker is returned in `x-markets-api-version` response headers and in `/markets/overview` + `/health` payloads.

## Breaking change policy

- Any breaking API change requires a new `MARKETS_API_VERSION` value.
- Breaking changes must include migration guidance in this document and a changelog entry.
- Breaking changes are not released silently.

## Deprecation policy

- Minimum migration window for deprecated routes/fields/params: **180 days**.
- Default removal notice target: **90 days** before removal.
- Deprecated elements are marked in OpenAPI with `deprecated: true` and a removal-not-before date.

## Changelog update rule

- Any PR that modifies request/response shape, endpoint behavior, enum values, auth/header behavior, or error payloads must append an entry to `docs/api-contract-changelog.md`.

## Canonical endpoint set

- `GET /markets/instruments`
- `GET /markets/instruments/summary`
- `GET /markets/orders`
- `GET /markets/orders/summary`
- `GET /markets/positions`
- `GET /markets/positions/summary`
- `GET /markets/overview`
- `GET /health`

## Compatibility Notes

1. **No prior canonical HTTP contract existed.**
   - This publication is the source of truth for Apps integrations.
   - Migration: align clients to the OpenAPI request/response schemas and enum literals.

2. **Repository runtime currently exposes domain services, not HTTP handlers.**
   - This contract defines canonical HTTP behavior for Apps parity and service implementation.
   - Migration: service implementers should map existing domain types/errors to this HTTP contract without changing domain invariants.

3. **Legacy page-number pagination is deprecated.**
   - Deprecated parameter: `page` on list endpoints.
   - Replacement: `cursor` + `limit`.
   - Removal not before: `2027-02-08`.

4. **`net_exposure_bucket` is deprecated in favor of `net_exposure_band`.**
   - Deprecated field appears in position summary payloads for transition.
   - Replacement: `net_exposure_band`.
   - Removal not before: `2027-02-08`.

## Client migration guidance

- Use `/markets/*` canonical route set and bearer authentication.
- Send `x-request-id` and `x-correlation-id` for traceability.
- Use cursor pagination for list endpoints.
- Consume canonical error payload fields: `code`, `message`, `retryable`, `source`, and optional `details`.
- Migrate any `net_exposure_bucket` handling to `net_exposure_band` before the removal window closes.
