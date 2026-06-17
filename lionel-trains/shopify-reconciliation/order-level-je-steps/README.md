# Order-level Journal Entry implementation

Goal: keep one NetSuite Journal Entry per Shopify payout, but create order-level Journal Entry lines.

Target shape:

- One JE header per payout.
- External ID remains `shopify_payout_{payoutId}`.
- Each Shopify order contributes three accounting line categories:
  - account `1113`: net amount
  - account `471`: processing fee, department `11`
  - account `1114`: clearing/gross offset
- Zero-amount lines are still omitted, matching the current workflow behavior and avoiding invalid NetSuite journal lines.
- Transactions without `associatedOrder` are grouped as `Non-order adjustment` so payout totals are not lost.

## Step placement

Use this flow inside the existing payout loop:

1. Existing Step 8: `Map - Build Idempotency Key`
2. Existing Step 9: `Netsuite - NetSuite: Search Existing JE by ExternalId`
3. Existing Step 10: skip branch if JE exists
4. Existing Step 12: replace with `05_step_12_normalize_shopify_payout.js`
5. New map step: `03_new_step_build_balance_transactions_query.js`
6. New Shopify GraphQL action: `04_new_step_fetch_balance_transactions_graphql.graphql`
7. New map step: `06_new_step_normalize_balance_transactions.js`
8. Existing Step 13: replace with `07_step_13_calculate_order_level_accounting_values.js`
9. Existing Step 14: replace with `08_step_14_build_netsuite_je_payload.js`
10. Existing Step 15: `Netsuite - NetSuite: Create Journal Entry`
11. Existing Step 16: replace with `09_step_16_log_payout_result.js`

Also update:

- Existing Step 2 query with `01_step_2_fetch_payouts_graphql.graphql`
- Existing Step 3 code with `02_step_3_extract_payouts_from_shopify_response.js`
- Existing Step 18 code with `10_step_18_build_batch_summary.js`

## Required placeholder replacements

After creating the two new steps in Gravity, replace these placeholders in later files:

- `REPLACE_WITH_FETCH_BALANCE_TRANSACTIONS_STEP_KEY`
- `REPLACE_WITH_NORMALIZE_BALANCE_TRANSACTIONS_STEP_KEY`

Keep existing step keys unchanged where the current export already shows them:

- `mapRPVQ`: Resolve Store Config
- `shopifyGraphqlBetaYYYC`: Fetch Payouts
- `mapBEND`: Extract Payouts
- `iterateJVCA`: current payout loop item
- `mapPV2R`: Normalize Shopify Payout
- `mapVTMX`: Calculate Accounting Values
- `mapNOVA`: Build NetSuite JE Payload
- `netsuiteExecuteCustomCodeET8Q`: Create Journal Entry
- `netsuiteExecuteCustomCodeSU2D`: Search Existing JE
- `mapEZVM`: Skipped log

## Important validation behavior

The order-level calculation validates that:

- The generated JE is balanced.
- The sum of transaction net amounts matches `payout.netAmount`.
- The Shopify balance transaction response is not paginated. If `hasNextPage = true`, the workflow throws a clear error so the payout is not partially posted.

If real payouts can exceed 250 balance transactions, add pagination before enabling in production.
