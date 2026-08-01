# Custom fee model

The fee layer is applied **after raw quote acquisition** and is isolated from DEX adapter internals.

## Inputs/outputs

Input:

- `TradeIntent`
- `RawQuote`
- optional fee context (`partner_share_bps`, `sponsor_offset_atomic`)

Output:

- `FeeBreakdown`
- `NetQuote`

Gross quote values are preserved in `RawQuote`; net values are emitted separately in `NetQuote`.

## Policy fields

`FeePolicy`:

- `fee_policy_version`
- `platformFeeBps`
- `partnerShareBps`
- optional `minFeeAtomic`
- optional `maxFeeAtomic`

## Formulas

Given `gross`, denominator `D = 10000`:

1. `totalFeeBeforeCaps = floor(gross * platformFeeBps / D)`
2. `totalFee = clamp(totalFeeBeforeCaps, minFeeAtomic?, maxFeeAtomic?)`
3. `partnerFee = floor(totalFee * partnerShareBps / D)`
4. `platformFee = totalFee - partnerFee`
5. `sponsorOffset = min(requestedSponsorOffset, totalFee)`
6. `netAmount = gross - platformFee - partnerFee + sponsorOffset`

## Rounding behavior

- All arithmetic is integer atomic-unit math (`bigint`).
- All bps operations use deterministic floor rounding.
- Sponsor offset is capped at total fee to avoid over-crediting.

## Asset-side treatment

- `exactIn`: fee base is `RawQuote.amountOut`; net is applied to `netAmountOut`.
- `exactOut`: fee base is `RawQuote.amountIn`; net is applied to `netAmountIn`.

## Auditability

- `FeeBreakdown` includes `grossAmount`, component fees, offset, and `fee_policy_version`.
- `NetQuote` carries `fee_policy_version` while retaining raw quote fields for reconciliation.
