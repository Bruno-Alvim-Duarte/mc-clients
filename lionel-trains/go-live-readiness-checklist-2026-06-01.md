# Lionel Trains Go-Live Readiness Checklist

Go-live target: Monday, June 1, 2026  
Review date: Friday, May 29, 2026

Context:

- NetSuite is currently being tested in Sandbox.
- Shopify is already Production.
- Any active workflow that writes to Shopify can affect real customers before the NetSuite production cutover.

## Highest Priority Checks

- [x] Confirm every NetSuite Gravity connection/credential is switched from Sandbox to Production.
	- [x] Publish the connections change
- [x] Confirm Shopify credentials are intentionally pointed at Production.
- [x] Confirm all active workflows are the intended production versions, not test/draft versions.
- [x] Confirm no workflow has hardcoded test SKUs, debug filters, placeholder variables, or stale cutoff dates.
- [x] Confirm Monday morning first-run behavior is intentional for old/backlog records.
- [x] Confirm alert emails go to the right MindCloud and Lionel contacts.
- [x] Confirm each workflow has a clear retry/recovery path if it partially succeeds.
- [x] Remove Exported from all Orders at shopify

## NetSuite Production Configuration

Check these IDs directly in NetSuite Production. Do not assume Sandbox IDs match Production.

- [x] Subsidiary ID `3` exists and is correct.
- [x] Currency ID `1` exists and is correct.
- [x] Sales Order custom form ID `209` exists and is correct.
- [x] Customer custom form ID `63` exists and is correct.
- [x] Payment method ID `60` exists and is correct.
- [x] Shopify discount item ID from `workflowArguments.discountID` exists and is correct.
- [x] Customer status ID from `workflowArguments.statusID` exists and is correct.
- [x] Customer class ID from `workflowArguments.customerClassID` exists and is correct.
- [x] Order class ID from `workflowArguments.orderClassID` exists and is correct.
- [x] Location ID from `workflowArguments.locationID` exists and is correct.
- [x] Division IDs are correct: Auto World `30`, Big Country Toys `40`.
- [x] Inventory location ID `32` is correct for production inventory sync.
- [x] Account `1095` East West Receivables exists and is correct.
- [x] Account `1099` Shopify Clearing exists and is correct.
- [x] Account `8616` Credit Card Fees exists and is correct.
- [x] Department `810` exists and is correct.
- [x] Custom field `custbody_shopify_ord_id` exists on production transactions.
- [x] Custom field `custbody_synced_to_shopify` exists on production item fulfillments.
- [x] Custom segment/field `csegdivision` exists and works on production records.
- [x] Custom field `custbody_shopify_ord_class` exists and is correct.
- [ ] Deveria preencher o custentity_shopify_cust_class tbm

## Shopify Production Configuration

- [x] Confirm the Shopify store connection is the intended production store.
- [x] Confirm GraphQL permissions include order read/write.
- [x] Confirm GraphQL permissions include tag write.
- [x] Confirm GraphQL permissions include fulfillment write.
- [x] Confirm GraphQL permissions include inventory write.
- [x] Confirm GraphQL permissions include Shopify Payments payout read.
- [x] Confirm Shopify location GID `gid://shopify/Location/76447547458` is the correct production location.
- [x] Confirm duplicate SKUs do not exist for SKUs expected to sync inventory.
- [x] Confirm products/variants have SKUs that exactly match NetSuite item IDs/SKUs after normalization rules.

## Workflow Arguments And Environment Values

- [x] Confirm `divisionID` is set correctly per store/workflow.
- [x] Confirm `locationID` is set correctly per store/workflow.
- [x] Confirm `orderClassID` is set correctly.
- [x] Confirm `statusID` is set correctly for newly created customers.
- [x] Confirm `customerClassID` is set correctly.
- [x] Confirm `discountID` is set correctly.
- [x] Confirm store-specific config is not hardcoded unless intentionally deploying one workflow per store.
- [x] Confirm Big Country Toys vs Auto World workflow behavior is explicit.

## Create Orders Workflow

Workflow file: `lionel-trains/create-orders/workflow.yaml`

### Schedule And Scope

- [x] Confirm the workflow should be active on go-live.
- [x] Confirm schedule is correct: every 30 minutes, Monday-Friday.
- [x] Confirm no weekend processing is required.
- [x] Confirm Shopify query should include all matching open paid unfulfilled orders without `Exported` tag.
- [x] Confirm whether an explicit `created_at` cutoff is needed before first production run.
- [x] Confirm backlog orders should or should not be imported Monday morning.
- [x] Confirm expected Monday first-run volume is under the workflow's safe processing capacity.

### Idempotency And Duplicate Prevention

- [x] Verify the Shopify `Exported` tag is actually added to the real Shopify order after NetSuite Sales Order creation.
- [x] Fix/verify tag mutation variables are dynamic, not a literal placeholder like `step3.ShopifyGid`.
- [x] Add or verify a NetSuite duplicate check by Shopify order ID before creating a Sales Order.
- [x] Confirm `custbody_shopify_ord_id` stores the Shopify numeric order ID consistently.
- [x] Confirm rerunning the same Shopify order does not create a duplicate Sales Order.
- [x] Confirm failed NetSuite order creation does not add the `Exported` tag.

### Customer Handling

- [x] Verify customer lookup uses the correct division value.
- [x] Fix/verify the `divisonID` typo in the customer lookup filter.
- [x] Confirm customer lookup by email is acceptable for all Shopify channels.
- [x] Confirm guest orders with missing customer data are handled correctly.
- [x] Confirm duplicate customer creation behavior is acceptable.
- [x] Confirm customer address creation works in NetSuite Production.

### Item And Order Mapping

- [x] Confirm every Shopify SKU in expected orders exists in NetSuite Production.
- [x] Confirm missing SKU behavior skips only the affected order and sends an alert.
- [x] Confirm shipping amount maps correctly to NetSuite shipping cost.
- [x] Confirm discount item line behavior is correct.
- [x] Confirm tax behavior is correct, especially Amazon FBM non-taxable logic.
- [x] Confirm Shopify order source/class mapping is correct for Amazon, eBay, Walmart, and default Shopify.
- [x] Confirm NetSuite Sales Order header fields are correct: form, entity, subsidiary, division, date, currency, location, class, memo, payment method.

### Pagination And Volume

- [x] Confirm `first: 250` is enough for normal runs.
- [x] Confirm what happens when Shopify returns `hasNextPage = true`.
- [x] Confirm the workflow can process the expected first-run backlog without timing out.

## Update Shipments Workflow

Workflow file: `lionel-trains/update-shipments/workflow.yaml`

### Schedule And Scope

- [x] Confirm the workflow should be active on go-live.
- [x] Confirm schedule is correct: every 30 minutes, every day.
- [x] Confirm daily/weekend shipment updates are intended.
- [x] Confirm first-run scope is correct: all item fulfillments with `custbody_synced_to_shopify = F`.
- [x] Confirm old unsynced fulfillments should or should not be sent to Shopify Monday morning.
- [x] Confirm `MAX_LIMIT = 5000` is acceptable.

### Shopify Fulfillment Behavior

- [x] Confirm `notifyCustomer: true` is intentional for production.
- [x] Confirm tracking numbers are required before Shopify fulfillment is created.
- [x] Confirm carrier detection from package description is good enough for UPS/FedEx/USPS.
- [x] Confirm missing tracking number behavior leaves the fulfillment retryable.
- [x] Confirm closed fulfillment orders are skipped without marking NetSuite synced incorrectly.
- [x] Confirm Shopify GraphQL `userErrors` are checked before NetSuite is marked synced.

### NetSuite Synced Flag And Cash Sale

- [x] Confirm `custbody_synced_to_shopify` is set to true only after Shopify fulfillment succeeds.
- [x] Confirm the empty Step 12 "Netsuite - Update as Synced in NetSuite" is intentional or removed.
- [x] Confirm Sales Order to Cash Sale transform happens only after successful Shopify fulfillment.
- [x] Confirm if Cash Sale creation fails, the workflow can retry without losing the fulfillment.
- [x] Confirm order of operations does not mark fulfillment synced before Cash Sale is created if accounting requires both.
- [x] Confirm `custbody_shopify_ord_id` is populated on Sales Orders created by the Create Orders workflow.

### Shopify Order Matching

- [x] Confirm Shopify order search uses the correct order name extracted from NetSuite memo.
- [x] Confirm NetSuite memo format always contains the Shopify order number after `#`.
- [x] Confirm fallback behavior is defined when Shopify order is not found.
- [x] Confirm memory key `fulfillmentIdsFromOrdersNotFound` is cleared after alerting.
- [x] Confirm the "orders not found" email recipient is correct.

## Inventory Sync Workflow

Workflow doc: `lionel-trains/sync-invetory/description.md`

### Must Fix Before Production

- [x] Remove the debug filter for SKU `201test`.
- [x] Replace hardcoded Shopify GraphQL variable `sku:"201test"` with the current loop item's SKU.
- [x] Replace or confirm hardcoded NetSuite inventory location `32`.
- [x] Replace or confirm hardcoded Shopify location `gid://shopify/Location/76447547458`.
- [x] Replace hardcoded `lastModifiedDate = "05/01/2026 0:00 am"` with a production checkpoint or approved cutoff.
- [x] Confirm the workflow is not active against Shopify Production until these items are fixed.

### Inventory Logic

- [x] Confirm NetSuite `locationquantityavailable` is the correct source of truth.
- [x] Confirm Shopify `available` at the target location is the correct destination quantity.
- [x] Confirm delta calculation is correct: `NetSuite available - Shopify available`.
- [x] Confirm inventory mutation sets or adjusts the intended quantity.
- [x] Confirm Shopify `inventorySetQuantities` input includes required fields for the current API version.
- [x] Confirm user errors from Shopify inventory mutation are checked and alerted.
- [x] Confirm missing Shopify variant behavior is handled and alerted.
- [x] Confirm duplicate SKU behavior skips the item and alerts the right people.
- [x] Confirm missing Shopify location behavior skips the item and alerts.

### Schedule And Volume

- [x] Confirm every 5 minutes is the intended cadence.
- [x] Confirm timezone is explicitly set or known.
- [x] Confirm the search can handle expected changed item volume.
- [x] Confirm first production run will not update a huge unintended inventory backlog.

## Alerting And Monitoring

- [x] Confirm production alert recipients for Create Orders missing SKUs.
- [x] Confirm production alert recipients for Inventory duplicate SKUs.
- [x] Confirm production alert recipients for Update Shipments orders not found.
- [x] Confirm production alert recipients for Payout reconciliation batch summary/failures.
- [x] Confirm MindCloud has someone watching Gravity logs Monday morning.
- [x] Confirm Lionel has one business owner available Monday morning for operational decisions.
- [x] Confirm NetSuite finance/accounting contact is available for payout/JE validation.
- [x] Confirm Shopify admin access is available for checking tags, fulfillments, and inventory.

## First-Run Plan For Monday Morning

- [x] Disable or pause workflows that should not run automatically during cutover.
- [x] Switch NetSuite credentials to Production.
- [ ] Run a manual single-record smoke test for Create Orders.
- [ ] Verify NetSuite Sales Order was created correctly.
- [ ] Verify Shopify order received the `Exported` tag.
- [ ] Run a manual single-record smoke test for Update Shipments.
- [ ] Verify Shopify fulfillment was created correctly.
- [ ] Verify NetSuite item fulfillment was marked synced only after Shopify success.
- [ ] Run a manual inventory sync test for one SKU if inventory workflow is going live.
- [ ] Verify Shopify inventory quantity changed correctly.
- [ ] Run payout workflow manually only if checkpoint and first-run window are confirmed.
- [ ] Review Gravity logs after each manual test.
- [ ] Enable schedules only after manual smoke tests pass.
- [ ] Watch first scheduled run for each workflow.
- [ ] Record any skipped records and assign owner for cleanup.

## Rollback And Recovery

- [x] Confirm who can immediately disable each Gravity workflow. (me)
- [x] Confirm how to remove a wrong Shopify `Exported` tag. (me)
- [ ] Confirm how to void/delete incorrect NetSuite Sales Orders in Production.
- [ ] Confirm how to reverse incorrect Journal Entries.
- [ ] Confirm how to correct an incorrect Shopify fulfillment.
- [ ] Confirm how to correct an incorrect Shopify inventory update.
- [x] Confirm how to replay a skipped Shopify order.  (just run the workflow again)
- [x] Confirm how to replay an unsynced NetSuite fulfillment.  (just run the workflow again)
- [x] Confirm how to reset workflow memory/checkpoint values if needed. (just clean the memory)

## Final Go/No-Go

- [ ] Create Orders approved for production.
- [ ] Update Shipments approved for production.
- [ ] Inventory Sync approved for production.
- [ ] Payout Reconciliation approved for production.
- [ ] NetSuite Production credentials verified.
- [ ] Shopify Production credentials verified.
- [ ] Alerting verified.
- [ ] Rollback owner confirmed.
- [ ] Monday morning monitoring owner confirmed.
