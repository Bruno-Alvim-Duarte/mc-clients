# MC-21951 Turnover Review

Workflow name: Shopify to NetSuite - Sync Order Updates (Big Country)

Linear issue: MC-21951

Linear title: Shopify to NetSuite - Sync Order Updates (Big Country)

Project/client context: Lionel Trains / Big Country Toys

Status: Ready for edit workflow development and sandbox testing; cancellation testing deferred

## Source Material

The Linear issue says this workflow syncs Shopify order edits and cancellations for orders that have already been exported to NetSuite, but have not yet been fulfilled.

The workflow has been set up with two Shopify webhooks:

- Order edits
- Cancellations

Expected high-level steps from the issue:

1. Determine which webhook triggered the workflow.
2. Check that the Shopify order has an `exported` tag.
3. Check in NetSuite whether the order has been fulfilled or partially fulfilled.
4. If fulfillment has begun, send an alert to the designated email with full cancellation/update details and end the workflow.
5. If the order was cancelled, close the order in NetSuite.
6. If the order was updated, mirror the Shopify updates in the NetSuite Sales Order.

## Confirmed Understanding

- Source system: Shopify, Big Country Toys store
- Destination system: NetSuite
- Source record: Shopify Order
- Destination record: NetSuite Sales Order
- Direction: Shopify to NetSuite
- Trigger/cadence: Webhook-based incremental processing
- Shopify webhook topics: order edited and order cancelled
- Backfill scope: Not mentioned; assumed out of scope unless confirmed otherwise
- Existing matching context: the create-order workflow appears to write Shopify order name, for example `#12345`, to NetSuite field `custbody_shopify_ord_id`
- Existing memo context: the create-order workflow writes memo as `Shopify Order {shopifyOrderName || shopifyOrderId}`

## Local Context Found

Relevant existing files:

- `lionel-trains/create-orders/workflow.yaml`
- `lionel-trains/create-orders/step-18-create-order.js`
- `lionel-trains/update-shipments/workflow.yaml`
- `lionel-trains/shopify-reconciliation/cash-sale-recon-steps/README.md`

Important observations:

- The create-order workflow currently searches Shopify orders with query criteria similar to paid, open, not fulfilled, and without the `exported` tag.
- The create-order map derives a numeric `shopifyOrderId` from the Shopify GID, but the Sales Order creation SuiteScript appears to set `custbody_shopify_ord_id` from `order.orderNumber`, which is the Shopify order name.
- NetSuite Sales Orders created by the existing workflow therefore appear to store `custbody_shopify_ord_id = Shopify order name`.
- NetSuite Sales Orders also store `otherrefnum = shopifyOrderName` when present.
- NetSuite Sales Orders store `memo = Shopify Order {shopifyOrderName || shopifyOrderId}`.
- Other local documentation also references finding Sales Orders by `custbody_shopify_ord_id` using Shopify order names, which aligns with the answered lookup rule.
- The create-order workflow already has logic for partially fulfilled Shopify orders by splitting item lines into closed already-fulfilled quantity and open pending quantity.

## Proposed Gravity Workflow Shape

1. Receive Shopify webhook.
2. Normalize the webhook topic and Shopify order ID.
3. For cancellation webhooks, use the webhook payload directly when it contains the required fields. For edit webhooks, fetch the full Shopify order using Shopify GraphQL Beta so the workflow has complete order, address, totals, and line-item data.
4. Check whether the Shopify order has the `exported` tag.
5. If the order is not exported, log and skip.
6. Find the matching NetSuite Sales Order using the confirmed Shopify-to-NetSuite matching key.
7. Load the NetSuite Sales Order and inspect header status plus item-line fulfillment fields.
8. If fulfillment has begun, send an alert with Shopify change details and NetSuite Sales Order details, then end without updating NetSuite.
9. If the webhook is a cancellation event, set the NetSuite Sales Order status to Cancelled.
10. If the webhook is an order edit event, apply only the approved Shopify-to-NetSuite field and line changes.
11. Log created, updated, skipped, alerted, and failed outcomes.
12. Send failure emails for app-step failures that require human action.

## Blocking Questions

### Matching And Idempotency

1. Which Shopify value should be the authoritative NetSuite lookup key: Shopify numeric order ID, Shopify order name such as `#12345`, or both?
   Why it matters: the existing create workflow stores the numeric ID in `custbody_shopify_ord_id`, but some local documentation says Sales Orders are found by Shopify order name in that same field.
   Implementation impact: this determines the NetSuite search filter and duplicate-prevention behavior.

   A: Shopify Order Name

2. Can the workflow rely on the Shopify `exported` tag to mean the NetSuite Sales Order already exists and is safe to update?
   Why it matters: an edit/cancellation webhook may arrive before the create-order workflow has finished exporting the Sales Order.
   Implementation impact: if the Sales Order is not found, the workflow needs a clear retry, skip, or alert rule.

   A: We can't fully rely, but its a really strong indicator. If it doesn't have that tag, it means it hasn't been exported yet. 

3. Should duplicate webhook deliveries be deduplicated using Shopify webhook headers/event ID if Gravity exposes them?
   Why it matters: webhook platforms can retry events.
   Implementation impact: this may require a memory key or external idempotency log keyed by webhook ID plus topic.

   A: No, if we receive a duplicate after processing, it shouldn't hurt anything to run the workflow again because it will see that hasn't new changes

### Update Scope

4. Which Shopify order edits should be mirrored to NetSuite?
   Why it matters: "mirror the updates" could include item quantity changes, added items, removed items, shipping address, billing address, customer info, shipping cost, shipping method, discounts, tax, notes, tags, or custom attributes.
   Implementation impact: each category requires explicit field mapping and tests.

   A: All of them you said, but tax notes tags and custom attributes are not required. Also we should mirror locations changes in the line items. OBS: billing address and customer info we would update the customer on netsuite not the order

5. Which NetSuite fields should never be overwritten once the Sales Order exists?
   Why it matters: NetSuite users may manually update fields after export.
   Implementation impact: this defines create-only fields versus updateable fields.

   A: What I can think so far, is things like subsidiary, division, customer etc.

6. If the Shopify edit changes only non-financial metadata, should the workflow still update NetSuite, log only, or skip?
   Why it matters: not all edits require a transaction mutation.
   Implementation impact: this determines whether the workflow needs a diff step before writing to NetSuite.

   A: Log only and skip.

### Line Items And Item Matching

7. For cancelled Shopify line items, should NetSuite remove the line, reduce the quantity, or close the line?
   Why it matters: keeping a cancelled line visible with quantity `0` preserves the item record while keeping the subtotal aligned with Shopify.
   Implementation impact: this determines the NetSuite item-sublist mutation.

   A: Keep the NetSuite Sales Order line and set quantity to `0` when Shopify sends the line with quantity `0`.

   Follow-up answer:
   The customer confirmed cancelled Shopify line items should remain visible as NetSuite item lines with quantity `0`.

8. For reduced Shopify quantities, should NetSuite reduce the existing line quantity or close/recreate lines to preserve the original ordered quantity?
   Why it matters: the existing create workflow already uses closed lines to represent already-fulfilled Shopify quantity.
   Implementation impact: this affects how we reconcile NetSuite line quantity, closed state, and fulfillment fields.

   A: reduce the existing line quantity.

9. For added Shopify line items, should the workflow add a new NetSuite Sales Order line if SKU matches one NetSuite item, or should it alert for manual review?
   Why it matters: item matching failures can create financially incorrect orders.
   Implementation impact: this determines whether the update workflow needs the same SKU-to-NetSuite-item search used by create orders.

   A: Add a new line item. If SKU matches one NetSuite item. If not, alert for manual review.

10. What should happen if one or more Shopify SKUs cannot be matched to NetSuite items?
    Why it matters: partial updates can leave Shopify and NetSuite inconsistent.
    Implementation impact: decide between fail entire order update, skip only missing lines, or alert and stop.

    A: Should skip and alert for manual review.

11. Should shipping lines, discounts, taxes, gift cards, refunds, or adjustments be represented the same way as the create-order workflow?
    Why it matters: these values affect the Sales Order total.
    Implementation impact: we need explicit parity with existing Sales Order creation logic before updating financial fields.

    A: Discounts yes, rest no. We don't have shipping lines, taxes is calculated by itself on netsuite so no need to do anything. Refunds are handled by other workflow

### Fulfillment Guard

12. What exactly counts as "fulfilled/partially fulfilled" in NetSuite?
    Possible indicators:
    - Sales Order status
    - Existing Item Fulfillment records
    - Any item line with `quantityfulfilled > 0`
    - Any item line with billed quantity
    - Closed item lines
    Why it matters: the issue says the workflow must alert and stop once fulfillment has begun.
    Implementation impact: this defines the NetSuite eligibility check before any update or cancellation.

    A: Sales Order Status, partially fulfilled or fulfilled anything beyond partially fulfilled should stop the workflow. 

    Follow-up answer:
    Only process NetSuite Sales Orders in status `SalesOrd:A` / Pending Approval or `SalesOrd:B` / Pending Fulfillment.
    Do not process `SalesOrd:C` / Cancelled.
    Do not process `SalesOrd:D` / Partially Fulfilled, `SalesOrd:E` / Pending Billing / Partially Fulfilled, `SalesOrd:F` / Billed / Fully Fulfilled, or `SalesOrd:H` / Closed.

13. If some lines have been fulfilled and other lines are still open, should the workflow stop entirely or update only the unfulfilled lines?
    Why it matters: the issue says alert and end workflow when fulfillment has begun, but partial-line handling may be requested by the client.
    Implementation impact: this determines whether updates are all-or-nothing.

    A: Stop the workflow. 

14. Should billed but not fulfilled Sales Orders be treated as ineligible for automated update/cancellation?
    Why it matters: NetSuite billing status can make closing or line updates unsafe.
    Implementation impact: billing fields may need to be included in the eligibility search.

    A: The rule is Sales Order Status, partially fulfilled or fulfilled anything beyond partially fulfilled should stop the workflow. I think billed is before fulfillment so we should be able to update it.

### Cancellation Behavior

15. When Shopify cancels an order, should the workflow close item lines or move the NetSuite Sales Order status to Cancelled?
    Why it matters: closing all lines can produce a Closed-style state, while the desired business outcome is that the Sales Order itself is Cancelled.
    Implementation impact: the NetSuite SuiteScript should set Sales Order `orderstatus = C` after eligibility validation.

    A: The validation of fulfilled should happen before processing the cancelation. But we should close the sales order on netsuite after the fulfilled validation and that's it.

    Follow-up answer:
    Cancellation means move the Sales Order status to `Cancelled` (`orderstatus = C`), not merely close item lines.

16. Should the workflow write Shopify cancellation reason/date/staff note into a NetSuite field or memo?
    Why it matters: cancellation details are useful for audit and operations.
    Implementation impact: requires field mapping.

    A: I think memo is the best way to do it.

17. Should Shopify cancellation remove or change the `exported` tag?
    Why it matters: tag behavior may affect other workflows.
    Implementation impact: this determines whether the workflow writes back to Shopify.

    A: No need.

### Alerts, Logs, And Failure Handling

18. Who should receive fulfillment-started alerts?
    Existing candidates from local workflows:
    - `bruno@mindcloud.co`
    - `AMiller@lionel.com`
    - `jjones@lionel.com`
    Why it matters: the issue says "designated email" but does not name recipients.
    Implementation impact: alert recipient configuration is required before build.

    A: These candidates are correct

19. What details should be included in the alert?
    Suggested details:
    - Shopify order ID and order name
    - Shopify webhook topic
    - cancellation reason or edit summary
    - NetSuite Sales Order internal ID and tran ID
    - NetSuite status
    - fulfilled/billed line summary
    - reason the workflow did not update NetSuite
    Why it matters: the alert should be actionable without opening every system manually.
    Implementation impact: the workflow needs to collect these identifiers before the alert branch.

    A: Go with your suggestions

20. On NetSuite update failure for one webhook event, should the workflow stop as failure, send email, and rely on Shopify retry/manual replay?
    Why it matters: webhook workflows do not naturally have batch-level pagination recovery.
    Implementation impact: this defines app-step failure behavior and retry expectations.

    A: If was a failure we should also add to the memory. We should send an email with the details and stop. 

### Testing And Access

21. Do we have one sample Shopify edited order and one sample Shopify cancelled order that already have matching NetSuite Sales Orders?
    Why it matters: field mapping and line behavior cannot be validated safely without representative records.
    Implementation impact: samples are needed before final implementation and test signoff.

    A: Edit test order identified:
    - Shopify order name: `#68073`
    - Shopify numeric order ID: `7202376679490`
    - NetSuite Sales Order internal ID: `47142255`
    - NetSuite status: Pending Fulfillment
    - Shopify `Exported` tag: checked/present

    Cancellation test order is deferred. Test edit first, then test cancellation later.

22. Can we create test orders and test cancellations in the Big Country Shopify store and NetSuite sandbox?
    Why it matters: this workflow mutates financial transaction records.
    Implementation impact: testing in production should be avoided unless explicitly approved.

    A: Yes. Use NetSuite sandbox plus the Shopify Big Country Toys test order. Gravity-side connections should use the NetSuite sandbox connection and Shopify Big Country Toys connection; no local credential work is needed in this turnover package.

## Suggested Assumptions To Confirm

- Use Shopify GraphQL Beta for fetching full order details after webhook receipt.
- Use NetSuite Execute Custom Code / SuiteScript for Sales Order search, fulfillment guard, and line updates.
- Treat the workflow as incremental-only, webhook-triggered; no historical backfill.
- Skip with info log when a webhook order does not have the `exported` tag.
- Stop and alert when NetSuite fulfillment has begun.
- Set Sales Order status to Cancelled for cancellation instead of deleting the Sales Order.
- Do not update NetSuite financial fields until the explicit edit field mapping is approved.
- Do not write back to Shopify unless explicitly requested.

## Build-Readiness Checklist

- [x] Shopify webhook topics confirmed.
- [x] Cancellation webhook sample payload collected.
- [x] Order edit webhook sample payload collected.
- [ ] Shopify order GraphQL query shape confirmed for edit processing.
- [x] NetSuite Sales Order lookup key confirmed: Shopify order name in `custbody_shopify_ord_id`.
- [x] `exported` tag behavior confirmed.
- [x] Fulfillment-started eligibility rule confirmed.
- [x] Fulfillment-started NetSuite status codes confirmed.
- [x] Cancellation status behavior confirmed: set Sales Order to Cancelled.
- [x] Cancelled edit lines should remain visible with quantity `0` when Shopify sends them that way.
- [x] Update field mapping approved at field level: use the current proposed mapping.
- [x] Line item matching behavior approved at business level.
- [x] Missing SKU behavior approved: skip update and alert.
- [x] Manual NetSuite override/conflict rule approved: alert and skip.
- [x] Alert recipients confirmed.
- [x] Failure email content confirmed at business level.
- [x] Edit test Shopify and NetSuite records identified.
- [x] Sandbox/production credential plan confirmed for active edit testing.
- [x] Valid raw cancellation sample file confirmed.

## Readiness Review After Answers

The answers are directionally consistent and good enough to start implementation scaffolding and SuiteScript design. They are not yet enough for final build/test signoff because a few choices need to become exact field-level and NetSuite-status-level rules.

Confirmed enough to build:

- Use Shopify order name as the NetSuite lookup value in `custbody_shopify_ord_id`.
- Use the `exported` tag as a gate; no tag means skip because the order has not been exported.
- Do not add webhook dedupe unless duplicate processing proves harmful.
- Process only NetSuite Sales Orders in `SalesOrd:A` / Pending Approval or `SalesOrd:B` / Pending Fulfillment.
- Skip already-cancelled NetSuite Sales Orders in `SalesOrd:C`.
- Stop and alert for statuses after cancellation/fulfillment begins: `SalesOrd:D`, `SalesOrd:E`, `SalesOrd:F`, and `SalesOrd:H`.
- If any fulfillment has begun, stop the whole workflow rather than updating unfulfilled lines.
- Added Shopify lines should be added to NetSuite when SKU maps to exactly one NetSuite item.
- Missing SKU should skip the update and alert for manual review.
- Cancellation should set the NetSuite Sales Order status to Cancelled after the status validation.
- Cancelled edit lines should remain visible with quantity `0` when Shopify sends them that way.
- Cancellation details should be appended to memo.
- Do not modify Shopify tags.
- If an updateable field appears to have been manually changed in NetSuite, alert and skip instead of overwriting.
- Send alerts to `bruno@mindcloud.co`, `AMiller@lionel.com`, and `jjones@lionel.com`.
- On NetSuite update failure, write a memory entry, send email, and stop.

Final clarifications still needed before completing full implementation:

1. Confirm Shopify GraphQL query shape for fetching full order details during edit processing.
2. Replace or confirm the cancellation raw sample file. The current local file named `samples/order-cancelled-webhook-raw.json` appears to contain an `orders/edited` payload, not an `orders/cancelled` payload.
3. Identify one cancellable test order after edit testing is complete.

## Proposed Field Mapping For Edit Events

Use this as the approved field scope unless a later decision narrows it.

### NetSuite Sales Order Header

- Shopify order name -> NetSuite `custbody_shopify_ord_id` lookup only, do not update.
- Shopify order name -> NetSuite `otherrefnum`, update only if blank or different from Shopify.
- Shopify order name -> NetSuite `memo`, preserve existing memo and append operational notes only for cancellation or skipped/manual-review events.
- Shopify shipping address -> NetSuite Sales Order `shippingaddress`.
- Shopify billing address -> do not update Sales Order billing address if the decision remains "customer info updates the customer, not the order."
- Shopify discount total -> NetSuite discount handling using the same discount item / discount percent behavior as the create-order workflow.
- Shopify edit notes from `body.order_edit.staff_note` and line-item discount `description` -> append to affected NetSuite item line `description` values using ` - ` as the separator.
- `staff_note` applies only to item lines referenced by the Shopify edit delta, not to older zero-quantity lines that merely appear in the full Shopify order state.
- Existing NetSuite item line descriptions/notes must be preserved. New Shopify edit notes are appended only if not already present.
- Shopify shipping lines -> out of scope; do not create or update NetSuite shipping lines.
- Shopify shipping cost / shipping method -> out of scope; do not update NetSuite `shippingcost` or `shipmethod` from Shopify edits.
- Shopify tags, tax, custom attributes -> out of scope.

Do not update these Sales Order fields:

- `entity`
- `subsidiary`
- `csegdivision`
- `customform`
- `currency`
- `department`
- `custbody_shopify_ord_id`
- fields manually changed in NetSuite where the workflow detects a conflict

### NetSuite Sales Order Item Lines

- Shopify line item SKU -> NetSuite item match by SKU.
- Shopify line quantity increase/decrease -> update existing NetSuite line quantity when the line is still eligible.
- Shopify cancelled line sent with quantity `0` -> keep/update the NetSuite Sales Order line with quantity `0`.
- Duplicate Shopify line items with the same SKU -> merge into one NetSuite item-line target when safe. Multiple cancelled duplicates with quantity `0` become one NetSuite line with quantity `0`; duplicate positive lines alert only if their positive rates or locations differ.
- Shopify added line with exactly one SKU match -> add new NetSuite item line.
- Shopify added/revised line with no SKU match or multiple SKU matches -> alert and skip.
- Shopify line item assigned location / fulfillment location -> update NetSuite line `location` using the same location mapping as the create-order workflow.
- Shopify line unit price -> update NetSuite line `rate` only when price changes are expected to be mirrored.
- Shopify line discounts -> reflect through the approved Sales Order discount handling, not by inventing new tax or adjustment lines.

### NetSuite Customer

When Shopify customer information changes, update the NetSuite customer linked to the Sales Order rather than changing the Sales Order `entity`.

Suggested updateable customer fields:

- Shopify customer first name -> NetSuite customer first name
- Shopify customer last name -> NetSuite customer last name
- Shopify customer email -> NetSuite customer email
- Shopify customer phone -> NetSuite customer phone
- Shopify billing address -> NetSuite customer billing addressbook entry
- Shopify shipping address -> NetSuite customer shipping addressbook entry

Customer fields that should not change automatically:

- customer internal ID / `entity`
- subsidiary
- division
- customer class
- terms/credit/financial settings

## Implementation Notes

- Gravity webhook workflows can run concurrently, so create-or-update and cancellation/update ordering must be designed carefully.
- If both edit and cancellation webhooks arrive close together, cancellation should probably win, but this must be confirmed.
- NetSuite cancellation should be implemented by setting the Sales Order status to Cancelled, not by deleting the Sales Order.
- NetSuite app work should likely use Execute Custom Code for searches and Sales Order mutation.
- App steps should have Step Completion Option logging and failure emails. Native map/if/loop steps should not receive app-step logging configuration by default.
- Initial active testing scope is edit only using Shopify order `#68073` / `7202376679490` and NetSuite Sales Order internal ID `47142255`.
- Cancellation implementation details remain documented, but live cancellation testing is deferred until after edit validation.

## External Documentation Checked

- Shopify Admin GraphQL webhook topics: `orders/edited` and `orders/cancelled` are valid webhook topics.
- Shopify order edit documentation notes that significant order edits can involve line items, quantities, discounts, and shipping lines, and order edits apply only to unfulfilled line items.
- NetSuite Sales Order item lines should remain visible with quantity `0` when Shopify sends cancelled edit lines that way, and Shopify order cancellation should set the Sales Order status to Cancelled.

## Cancellation Webhook Sample

A real `orders/cancelled` payload was provided for Shopify order `#68025`. The raw payload was not copied into this note because it contains customer PII and is very large, but the implementation-relevant fields are:

Raw sample file status:

- Expected file path: `samples/order-cancelled-webhook-raw.json`
- Current local file at that path is valid JSON, but it contains `headers.x-shopify-topic = orders/edited` and `body.order_edit`; replace it with the actual `orders/cancelled` raw payload before using it as a cancellation fixture.

- Webhook topic: `headers.x-shopify-topic = orders/cancelled`
- Webhook event ID: `headers.x-shopify-event-id`
- Webhook ID: `headers.x-shopify-webhook-id`
- Shopify shop domain: `headers.x-shopify-shop-domain = farmandranchtoys.myshopify.com`
- Shopify order numeric ID: `body.id`
- Shopify order GID: `body.admin_graphql_api_id`
- Shopify order name: `body.name = #68025`
- NetSuite lookup value: use `body.name`
- Shopify cancel reason: `body.cancel_reason = staff`
- Shopify cancelled timestamp: `body.cancelled_at`
- Shopify closed timestamp: `body.closed_at`
- Shopify updated timestamp: `body.updated_at`
- Shopify tags: `body.tags = Exported`
- Shipping lines: `body.shipping_lines = []`
- Fulfillments: `body.fulfillments = []`
- Refunds: present in `body.refunds`, but refunds remain out of scope for this workflow

Implementation notes from the sample:

- Treat Shopify tags as either a comma-delimited string or an array. The cancellation sample uses the string `Exported`, so the exported-tag check must be case-insensitive.
- Use `headers.x-shopify-topic` to distinguish cancellation from edit when available.
- Use `body.name`, not `body.id`, to find the NetSuite Sales Order in `custbody_shopify_ord_id`.
- For cancellation, the webhook body appears sufficient to proceed to NetSuite lookup/status validation/status cancellation; a Shopify GraphQL fetch is optional unless the live Gravity payload omits required fields.
- Do not use `body.line_items.current_quantity` as the source of original ordered quantity on cancellation. Cancelled line items show `current_quantity = 0`, while original ordered quantity remains in `quantity`.
- Do not process `body.refunds`; the refund workflow owns refund/RMA handling.

## Order Edit Webhook Sample

Raw sample file:

- `samples/order-edited-webhook-raw.json`

A real `orders/edited` payload was provided for Shopify order numeric ID `7202376679490`.

Implementation-relevant fields:

- Webhook topic: `headers.x-shopify-topic = orders/edited`
- Webhook event ID: `headers.x-shopify-event-id`
- Webhook ID: `headers.x-shopify-webhook-id`
- Shopify shop domain: `headers.x-shopify-shop-domain = farmandranchtoys.myshopify.com`
- Shopify order numeric ID: `headers.x-shopify-order-id`
- Shopify order edit ID: `body.order_edit.id`
- Shopify order numeric ID inside body: `body.order_edit.order_id`
- Edit created timestamp: `body.order_edit.created_at`
- Edit committed timestamp: `body.order_edit.committed_at`
- Staff note: `body.order_edit.staff_note`
- Line item additions/removals: `body.order_edit.line_items.additions` and `body.order_edit.line_items.removals`
- Line item discount additions/removals: `body.order_edit.discounts.line_item.additions` and `body.order_edit.discounts.line_item.removals`
- Line item discount edit note/description: `body.order_edit.discounts.line_item.additions[].description` and removals equivalent.
- Shipping line additions/removals: present but out of scope

Implementation notes from the edit sample:

- The edit webhook is a delta payload, not a full Shopify order payload.
- The sample does not include Shopify order name, tags, addresses, customer details, or full line-item state.
- For edit processing, the workflow must fetch the full Shopify order by numeric order ID or GID before checking the `Exported` tag or looking up the NetSuite Sales Order by Shopify order name.
- Staff notes and line-item discount descriptions are available in the edit webhook delta and should be appended to affected NetSuite item line descriptions.
- The sample edit was a line-item fixed discount addition: `0.01 USD` on Shopify line item ID `17626810548290`.
- To apply line-level edits safely, the workflow needs either a stored Shopify line item ID on NetSuite lines or a deterministic fallback match by SKU plus line context from the full order.
- Shipping line edits are ignored because shipping is out of scope.

Relevant docs:

- https://shopify.dev/docs/api/admin-graphql/2026-04/enums/WebhookSubscriptionTopic
- https://shopify.dev/docs/api/admin-graphql/latest/mutations/orderEditCommit
- https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4698204292.html
- https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_4698168976.html
