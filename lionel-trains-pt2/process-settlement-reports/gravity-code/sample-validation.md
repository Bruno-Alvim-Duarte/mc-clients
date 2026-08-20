# Sample Validation

Sample file:
`lionel-trains-pt2/process-settlement-reports/f3046412-eb05-4311-a3ad-c560828360fc.amzn1.tortuga.4.na.txt`

Validation date: 2026-07-21

## Parser Result

- Settlement ID: `26590577301`
- Header total: `16311.96`
- Detail row total: `16311.96`
- Difference: `0`
- Tax positive amount: `2269.67`
- Tax negative amount: `-2269.67`
- Tax net amount: `0`
- Catch-all rows: `88`

## Aggregated Categories

| Category | Account ID | Rows | Net | Positive | Negative |
| --- | ---: | ---: | ---: | ---: | ---: |
| Accounts Receivable | 123 | 877 | 30662.02 | 30662.02 | 0 |
| Amazon Fulfillment Fees | 434 | 793 | -6474.93 | 0 | -6474.93 |
| Amazon Selling Fees | 336 | 900 | -4849.39 | 128.58 | -4977.97 |
| Amazon Storage Fee | 523 | 3 | -2077.49 | 0 | -2077.49 |
| Refunds | 260 | 106 | -948.25 | 175.98 | -1124.23 |

## Journal Entry Payload Result

The parser and payload builder were tested through `maps/00_build_runtime_config.js` using the confirmed rule that tax rows are validated only and are not posted to the Journal Entry.

- Tax recorded in Journal Entry: `false`
- Cash Journal Entry line: debit `16311.96`, from settlement header `total-amount`
- Journal Entry line count: `8`
- Total debits: `30966.58`
- Total credits: `30966.58`
- Difference: `0`

## Notes

- Tax rows are skipped only after validating tax and withheld tax. If tax net is not zero, only the net variance is posted to fee account `8606` / NetSuite internal ID `336`, Department `300` / NetSuite internal ID `34`.
- Catch-all rows exist in the sample and are included in Amazon Selling Fees as offsets when positive. Lionel approval for catch-all behavior is required before go-live.
- The sample balances without a clearing account. Cash account `1113` acts as the clearing line through the settlement header `total-amount`.
