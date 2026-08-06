# Gravity Steps

Workflow: Shopify to NetSuite - Sync Order Updates (Big Country)

Current scope:

- `orders/edited` is built and has been tested for item quantity increase/decrease, item value decrease, and item addition.
- Removed-line edit behavior changed after client confirmation: Shopify removed lines should now remove the NetSuite line and should be retested.
- `orders/cancelled` is the next branch to enable.
- Existing edit test record: Shopify order `#68073` / `7202376679490` and NetSuite Sales Order internal ID `47142255`.

## Code Placement

All reusable code snippets live in `gravity-code/`.

When a Gravity step is created, Gravity will generate real step keys. Replace each `REPLACE_WITH_..._STEP_KEY` reference in the snippet with the actual key generated in the workflow.

## Workflow Arguments

Expected Gravity workflow arguments:

- `locationID`: default NetSuite location, same meaning as create-order workflow.
- `discountID`: NetSuite discount item ID, same meaning as create-order workflow.
- Optional existing arguments from create-order workflow can remain available, but this workflow should not overwrite `entity`, `subsidiary`, `csegdivision`, `customform`, `currency`, or `department`.

## Step Order

1. Shopify Webhook Trigger
   - Type: webhook
   - Topics: `orders/edited` and `orders/cancelled`
   - Output consumed by Step 2.

2. Map - Normalize Webhook
   - Type: map
   - Code: `gravity-code/01-map-normalize-webhook.js`
   - Purpose: detect topic, normalize Shopify order ID/GID, preserve webhook metadata, capture edit notes, set alert recipients.
   - Edit notes carried from `body.order_edit.staff_note` and `body.order_edit.discounts.line_item.additions/removals[].description`.
   - Note destination field remains `TO_BE_DEFINED` until the NetSuite target field is confirmed.

3. If - Event Is Edit?
   - Type: if
   - Condition: Step 2 `isEdit === true`
   - Yes path: Step 4.
   - No path: Step 3A.

3A. If - Event Is Cancellation?
   - Type: if
   - Condition: Step 2 `isCancellation === true`
   - Yes path: Step 6.
   - No path: Step 19, with an info log for unsupported webhook topic.
   - This replaces the current `Future - Cancellation Path (Not Yet Enabled)` flow-control skip.

4. Map - Build Shopify Full Order Query
   - Type: map
   - Code: `gravity-code/02-map-build-shopify-order-query.js`
   - Purpose: build GraphQL query and variables for the Shopify order.

5. Shopify - GraphQL Beta - Get Full Order
   - Type: app action
   - App: Shopify Big Country Toys connection
   - Action: GraphQL Beta
   - Query: Step 4 `query`
   - Variables: Step 4 `variables`
   - Step Completion Option:
     - Failure: Stop Workflow
     - Log level: Error
     - Send failure email: enabled
     - Recipients: Step 2 `alertRecipients`
   - Success log: `[Shopify] Fetched full order for Shopify order {{ Step 2 order.name/order.numericId }}.`

6. Map - Normalize Shopify Order
   - Type: map
   - Code: `gravity-code/03-map-normalize-shopify-order.js`
   - Purpose: produce one normalized order shape.
   - Edit path source: Step 5 Shopify GraphQL response.
   - Cancellation path source: Step 2 webhook `rawBody`; do not call Shopify GraphQL for cancellation unless the live payload is missing required fields.
   - Carries edit notes forward as `editNotes`.

7. NetSuite - Execute Custom Code - Find Sales Order And Items
   - Type: app action
   - App: NetSuite sandbox connection
   - Action: Execute Custom Code
   - Code: `gravity-code/04-netsuite-find-sales-order-and-items.js`
   - Purpose: find Sales Order by Shopify order name in `custbody_shopify_ord_id`, load status/lines, resolve Shopify SKUs to NetSuite items.
   - Step Completion Option:
     - Failure: Stop Workflow
     - Log level: Error
     - Send failure email: enabled
     - Recipients: Step 2 `alertRecipients`
   - Success log: `[NetSuite] Searched Sales Order for Shopify order {{ Step 6 name }}.`

8. Map - Build Update Plan
   - Type: map
   - Code: `gravity-code/05-map-build-update-plan.js`
   - Purpose: apply business rules and decide whether to update, skip, or alert.
   - Rules:
     - Skip info if no `Exported` tag.
     - Stop/alert if SO not found or duplicate.
     - Only allow NetSuite compact Sales Order status `A` and `B`.
     - `A` means Pending Approval.
     - `B` means Pending Fulfillment.
     - Stop/alert for `C`, `D`, `E`, `F`, `H`, or unknown status.
     - Stop/alert for missing or duplicate SKU matches.
     - For `orders/cancelled`, build `action: apply_cancellation`.
     - For `orders/edited`, build `action: apply_edit`.
     - Carry edit notes in `edit.notesToCarry[]` with `destinationFieldId = TO_BE_DEFINED`.

9. If - Plan Can Apply?
   - Type: if
   - Condition: Step 8 `canApply === true`
   - Yes path: Step 10.
   - No path: Step 12.

10. NetSuite - Execute Custom Code - Apply Sales Order Update
    - Type: app action
    - App: NetSuite sandbox connection
    - Action: Execute Custom Code
    - Code: `gravity-code/06-netsuite-apply-sales-order-update.js`
    - Purpose:
      - Edit: update shipping address, item quantities/rates/locations, added lines, removed lines by removing the NetSuite line, and discount line/percent.
      - Edit notes: return `mutationResult.notesToCarry[]` without writing those notes to NetSuite while the destination field is undefined.
      - Cancellation: set Sales Order header `orderstatus = C` / Cancelled and append cancellation memo note.
    - Step Completion Option:
      - Failure: Stop Workflow
      - Log level: Error
      - Send failure email: enabled
      - Recipients: Step 2 `alertRecipients`
    - Success log: `[NetSuite] Applied {{ Step 8 action }} for Shopify order {{ Step 8 shopifyOrder.name }} to Sales Order {{ Step 8 netsuite.salesOrder.internalId }}.`

11. If - NetSuite Apply Failed?
    - Type: if
    - Condition: Step 10 `success === false`
    - Yes path: Step 12.
    - No path: Step 15.

12. Map - Build Alert Email
    - Type: map
    - Code: `gravity-code/07-map-build-alert-email.js`
    - Purpose: build manual review/failure email from plan and NetSuite result.

13. If - Should Send Alert?
    - Type: if
    - Condition: Step 12 `shouldSend === true`
    - Yes path: Step 14.
    - No path: Step 16.

14. Flow Control - Send Manual Review Or Failure Email
    - Type: flow control
    - Action: Send email
    - To: Step 12 `to`
    - Subject: Step 12 `subject`
    - Body: Step 12 `body`

15. Flow Control - Log Success
    - Type: flow control
    - Action: Info log
    - Message: `[NetSuite] Synced Shopify order update for {{ Step 8 shopifyOrder.name }} to Sales Order {{ Step 10 salesOrderId }}.`
    - Then end workflow as success.

16. Map - Build Memory Entry
    - Type: map
    - Code: `gravity-code/08-map-build-memory-entry.js`
    - Purpose: prepare memory value for failures/manual-review outcomes.

17. If - Should Write Memory?
    - Type: if
    - Condition: Step 16 `shouldWrite === true`
    - Yes path: Step 18.
    - No path: Step 19.

18. Memory - Set Failure/Manual Review Entry
    - Type: set memory
    - Key: Step 16 `key`
    - Value: Step 16 `value`
    - Saves on: always

19. Flow Control - End Skipped Or Alerted Run
    - Type: flow control
    - If alert/manual-review was sent: end workflow as success after logging warning.
    - If unexpected failure reached this branch: end workflow as failure.

## Cancellation Branch

The current Gravity export has a false branch under `If - Event Is Edit` named `Future - Cancellation Path (Not Yet Enabled)` that ends the workflow as success. Replace that branch with:

1. `If - Event Is Cancellation?`
   - Condition: Step 2 `isCancellation === true`
   - True branch should continue to Step 6, `Map - Normalize Shopify Order`.
   - False branch should log unsupported webhook topic and end as success.

2. Step 6 should run from Step 1/Step 2 webhook data when no Shopify GraphQL response exists.
   - The `03-map-normalize-shopify-order.js` snippet already supports this by falling back to the webhook REST order body.

3. Step 8 should produce:
   - `action: apply_cancellation`
   - `canApply: true`
   - `cancellation.memoNote`

4. Step 10 should set the Sales Order header `orderstatus` to `C` / Cancelled and save the Sales Order.

   Do not implement cancellation by closing every item line. Closing lines can move the Sales Order toward a Closed-style state and is not the desired business outcome for Shopify cancellations.

Do not add a Shopify GraphQL step to the cancellation branch unless the real cancellation webhook payload is missing required fields.

Before live cancellation testing:

- Replace `samples/order-cancelled-webhook-raw.json` with a real `orders/cancelled` payload.
- Identify one cancellable test order with matching NetSuite Sales Order.
- Re-check that the Sales Order is `Pending Approval` or `Pending Fulfillment`.

## Notes For Gravity Build

- App-step logs and failure emails belong on Shopify/NetSuite connector steps, not on native map/if/memory steps.
- Webhooks can run concurrently. The NetSuite apply step reloads and re-checks Sales Order status immediately before mutation.
- This workflow does not write back to Shopify.
- Shopify edit notes are carried through the workflow, but are not written to NetSuite until the destination field is defined.
- Shipping cost, shipping method, taxes, refunds, tags, and custom attributes remain out of scope.
