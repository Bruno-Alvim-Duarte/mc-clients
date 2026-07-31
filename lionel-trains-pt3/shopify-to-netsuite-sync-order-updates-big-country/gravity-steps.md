# Gravity Steps

Workflow: Shopify to NetSuite - Sync Order Updates (Big Country)

Scope for first build/test pass: `orders/edited` only, using Shopify order `#68073` / `7202376679490` and NetSuite Sales Order internal ID `47142255`.

Cancellation branch is documented in the same sequence, but live cancellation testing is deferred until edit testing passes.

## Code Placement

All reusable code snippets live in `gravity-code/`.

When a Gravity step is created, Gravity will generate real step keys. Replace each `REPLACE_WITH_..._STEP_KEY` reference in the snippet with the actual key generated in the workflow.

## Workflow Arguments

Expected Gravity workflow arguments:

- `locationID`: default NetSuite location, same meaning as create-order workflow.
- `discountID`: NetSuite discount item ID, same meaning as create-order workflow.
- Optional existing arguments from create-order workflow can remain available, but this workflow should not overwrite `entity`, `subsidiary`, `csegdivision`, `customform`, `currency`, or `department`.

## Step Order

1. Shopify webhook trigger
   - Type: webhook
   - Topics: `orders/edited`, later `orders/cancelled`
   - Output consumed by Step 2.

2. Map - Normalize Webhook
   - Type: map
   - Code: `gravity-code/01-map-normalize-webhook.js`
   - Purpose: detect topic, normalize Shopify order ID/GID, preserve webhook metadata, set alert recipients.

3. If - Event Is Edit?
   - Type: if
   - Condition: Step 2 `isEdit === true`
   - Yes path: Step 4.
   - No path: Step 6 for cancellation once cancellation testing is enabled.

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
   - Purpose: produce one normalized order shape for either edit GraphQL result or cancellation webhook body.

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
     - Only allow `SalesOrd:A` and `SalesOrd:B`.
     - Stop/alert for `SalesOrd:C`, `SalesOrd:D`, `SalesOrd:E`, `SalesOrd:F`, `SalesOrd:H`, or unknown status.
     - Stop/alert for missing or duplicate SKU matches.

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
      - Edit: update shipping address, item quantities/rates/locations, added lines, removed lines by closing, and discount line/percent.
      - Cancellation later: close all item lines and append cancellation memo note.
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

## Cancellation Branch Later

For cancellation testing, route non-edit webhooks from Step 3 directly to Step 6. The cancellation webhook body should already contain the full order fields needed for lookup and line close. Step 4 and Step 5 are edit-only.

Before enabling live cancellation testing:

- Replace `samples/order-cancelled-webhook-raw.json` with a real `orders/cancelled` payload.
- Identify one cancellable test order with matching NetSuite Sales Order.
- Re-check that the Sales Order is `Pending Approval` or `Pending Fulfillment`.

## Notes For Gravity Build

- App-step logs and failure emails belong on Shopify/NetSuite connector steps, not on native map/if/memory steps.
- Webhooks can run concurrently. The NetSuite apply step reloads and re-checks Sales Order status immediately before mutation.
- This workflow does not write back to Shopify.
- Shipping cost, shipping method, taxes, refunds, notes, tags, and custom attributes remain out of scope.
