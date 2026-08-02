# Execution tx builder (PR5)

## Contract

`ExecutionTxBuilder.build(input)` produces a deterministic execution payload bundle only for pre-trade `ALLOW` decisions.

Output:
- `payloads`: executable tx payload(s) with `chainId`, `target`, `calldata`, `value`, `recipient`, `deadline`, optional `minOut`/`maxIn`, `nonce`, `idempotencyKey`
- `metadata`: normalized build metadata plus deterministic `fingerprintHash`

## Guardrails (hard enforcement)

- Slippage bounds: `minSlippageBps <= slippageBps <= maxSlippageBps`
- Deadline:
  - not expired
  - within `maxDeadlineHorizonMs`
- Quote/amount sanity:
  - positive uint256 amounts
  - quote/build amount consistency
  - `exactIn` requires `minOut`
  - `exactOut` requires `maxIn`
  - `minOut <= amountOut`, `maxIn >= amountIn`
- Chain policy:
  - `chainId` must be in `allowedChains`
- Recipient policy:
  - valid address format
  - optional allowlist in `allowedRecipients`
- Token policy:
  - token addresses required/valid
  - token decimals range checked
  - quote/build decimals must match
  - input/output token mismatch enforced when configured
- Replay/idempotency:
  - deterministic idempotency key derivation when absent
  - optional duplicate prevention hook via replay store

## Typed errors and remediation hints

- `ExecutionBuildError` (base)
- `SlippageOutOfBoundsError` → adjust intent slippage or config bounds
- `DeadlineExpiredError` → refresh deadline
- `DeadlineTooFarError` → reduce expiry horizon or adjust config
- `InvalidChainError` → use allowed chain
- `InvalidRecipientError` → provide valid/policy-allowed recipient
- `InvalidTokenError` → fix token addresses/decimals/distinctness
- `TokenDecimalsMismatchError` → align quote/build token decimals
- `InvalidAmountError` → provide positive uint256-normalized amounts
- `QuoteConstraintViolationError` → fix minOut/maxIn and quote coherence
- `ReplayProtectionError` → use new idempotency key or clear duplicate state

## Config knobs

- `minSlippageBps`
- `maxSlippageBps`
- `maxDeadlineHorizonMs`
- `allowedChains`
- `allowedRecipients` (optional)
- `requireDistinctInputOutputTokens`

## Observability (sanitized)

Events emitted by builder:
- `markets.execution.build.started`
- `markets.execution.build.succeeded`
- `markets.execution.build.failed`

Included safe metadata:
- `correlation_id`
- `chainId`
- `guardrail_code` (failure)
- `timing_ms`
- `deterministic_fingerprint_hash` (success)

Never emits secrets, private keys, or raw sensitive payload material.
