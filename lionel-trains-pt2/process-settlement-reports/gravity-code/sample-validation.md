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
| Amazon Selling Fees | 336 | 892 | -4977.97 | 0 | -4977.97 |
| Amazon Storage Fee | 523 | 3 | -2077.49 | 0 | -2077.49 |
| Cash | 1113 | 8 | 128.58 | 128.58 | 0 |
| Refunds | 260 | 106 | -948.25 | 175.98 | -1124.23 |
| Tax | TODO | 1595 | 0 | 2269.67 | -2269.67 |

## Journal Entry Payload Result

The parser and payload builder were tested through `maps/00_build_runtime_config.js` with workflow argument `amazonSettlementTaxAccountId = 999` only to validate balancing logic.

- Journal Entry line count: `10`
- Total debits: `33236.25`
- Total credits: `33236.25`
- Difference: `0`

## Notes

- Production cannot proceed until the real NetSuite tax account internal ID is supplied.
- Catch-all rows exist in the sample, so Lionel approval for catch-all behavior is required before go-live.
- The sample balances without a clearing account when all settlement rows, including tax, are represented by sign.
