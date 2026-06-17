# Sales Order reconciliation field update

Goal: after a payout Journal Entry is created, update the associated Sales Order records with the created Journal Entry number and reconciliation date.

Target Sales Order field:

- `custbody_shopify_pymt_recon`

Lookup rule:

- Use the order names from the payout `orderGroups`.
- Find Sales Orders whose Shopify Order ID field `custbody_shopify_ord_id` equals the Shopify order name.
- Non-order adjustment groups are ignored because they do not represent a Sales Order.

Value format:

- `{JE tranId} - {MM/DD/YY}`
- Example: `JE24938 - 06/15/26`

## Step placement

Inside the payout loop, in the branch where no existing JE was found:

1. Existing/new order-level steps through `Map - Build NetSuite JE Payload`
2. Replace existing `NetSuite: Create Journal Entry` code with `01_step_15_create_journal_entry_return_tranid.js`
3. Add new map step: `02_new_step_build_cash_sale_recon_payload.js`
4. Add new NetSuite Execute Custom Code step: `03_new_step_update_cash_sales_recon_field.js`
5. Replace existing `Map - Log Payout Result` code with `04_step_16_log_payout_result_with_cash_sales.js`

After the loop:

- Replace `Map - Build Batch Summary` with `05_step_18_build_batch_summary_with_cash_sales.js`

## Step order

```text
Map - Build NetSuite JE Payload
NetSuite - Create Journal Entry
Map - Build Sales Order Reconciliation Payload
NetSuite - Update Sales Orders Reconciliation Field
Map - Log Payout Result
```

Do not add the Sales Order update to the existing-JE branch. Per the latest requirement, existing JEs should still skip without updating Sales Orders.

## Placeholder replacements

After creating the two new steps in Gravity, replace these placeholders:

- `REPLACE_WITH_BUILD_CASH_SALE_RECON_PAYLOAD_STEP_KEY`
- `REPLACE_WITH_UPDATE_CASH_SALES_RECON_STEP_KEY`

Existing step keys used by these snippets:

- `mapVTMX`: Calculate Accounting Values
- `mapNOVA`: Build NetSuite JE Payload
- `netsuiteExecuteCustomCodeET8Q`: Create Journal Entry
- `netsuiteExecuteCustomCodeSU2D`: Search Existing JE
- `mapEZVM`: Skipped log

## Reconciliation date

The map step defaults to the workflow run date. If you need to force a date during testing, pass `workflowArguments.reconciliationDate` as `YYYY-MM-DD`.
