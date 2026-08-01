# Markets pipeline overview

Canonical execution pipeline:

1. Intent normalization (`TradeIntent`)
2. Policy decision gate (`PolicyDecision`: `ALLOW | DENY | REVIEW`)
3. Raw quote acquisition (`RawQuote` via `QuoteProvider`)
4. Custom fee application (`FeeEngine` -> `FeeBreakdown` + `NetQuote`)
5. Execution planning (`ExecutionPlan` via `ExecutionPlanner`)
6. Settlement emission (`SettlementEvent` via `SettlementEmitter`)

Canonical identifiers:

- `intent_id`
- `quote_id`
- `execution_id`
- `correlation_id`
- `idempotency_key`

Design constraints in this phase:

- Domain layer is adapter-agnostic.
- Quote economics stay raw in `RawQuote`; fee adjustments are separate.
- Validation helpers enforce baseline invariants for policy, intent safety, and fee arithmetic.
