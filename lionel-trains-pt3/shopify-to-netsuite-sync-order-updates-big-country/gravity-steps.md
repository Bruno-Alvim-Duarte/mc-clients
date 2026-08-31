# Gravity Steps

Workflow: Shopify to NetSuite - Sync Order Updates (Big Country)

Current scope:

- `orders/edited` is built and has been tested for item quantity increase/decrease, item value decrease, and item addition.
- Cancelled-line edit behavior changed after client confirmation: when Shopify keeps the line with quantity `0`, NetSuite should keep the item line visible with quantity `0` and should be retested.
- `orders/cancelled` is the next branch to enable.
- A daily scheduled retry path should drain a shared KV queue of failed webhook bodies and POST each body back to the normal webhook URL.
- Existing edit test record: Shopify order `#68073` / `7202376679490` and NetSuite Sales Order internal ID `47142255`.

## Code Placement

All reusable code snippets live in `gravity-code/`.

When a Gravity step is created, Gravity will generate real step keys. Replace each `REPLACE_WITH_..._STEP_KEY` reference in the snippet with the actual key generated in the workflow.

## Workflow Arguments

Expected Gravity workflow arguments:

- `locationID`: default NetSuite location, same meaning as create-order workflow.
- `discountID`: NetSuite discount item ID, same meaning as create-order workflow.
- `retryWebhookUrl`: the public Gravity webhook URL for this same workflow. Required by the daily scheduled retry path.
- Optional `retryQueueKey`: defaults to `big_country_order_update_retry_queue`.
- Optional existing arguments from create-order workflow can remain available, but this workflow should not overwrite `entity`, `subsidiary`, `csegdivision`, `customform`, `currency`, or `department`.

## Step Order

1. Shopify Webhook Trigger
   - Type: webhook
   - Topics: `orders/edited` and `orders/cancelled`
   - Output consumed by Step 3 when this is a webhook run.

1A. Daily Scheduled Trigger
   - Type: scheduled trigger
   - Cadence: once per day.
   - Output consumed by Step 3 when this is a scheduled run.

2. Map - Detect Trigger Source
   - Type: map
   - Code: `gravity-code/00-map-detect-trigger-source.js`
   - Purpose: determine whether the run was started by a webhook or by the daily schedule.
   - Output includes `isWebhook`, `isScheduled`, `retryQueueKey`, and `retryWebhookUrl`.

3. If - Is Scheduled Retry Run?
   - Type: if
   - Condition: Step 2 `isScheduled === true`
   - Yes path: Step 3A.
   - No path: Step 4.

3A. KV/Memory - Get Retry Queue
   - Type: get memory / KV read
   - Key: Step 2 `retryQueueKey`
   - Purpose: load the array of webhook bodies waiting for replay.

3B. KV/Memory - Clear Retry Queue Snapshot
   - Type: set memory / KV write
   - Key: Step 2 `retryQueueKey`
   - Value: `[]`
   - Purpose: drain the queue before replay. If a replay fails again in the normal webhook path, that webhook body is added back to the queue.

3C. Map - Normalize Retry Queue
   - Type: map
   - Input: Step 2 and Step 3A
   - Code: `gravity-code/09-map-normalize-retry-queue.js`
   - Purpose: turn the KV value into one row per queued webhook body.

3D. Loop - Retry Queued Webhook Bodies
   - Type: loop
   - Input: Step 3C rows.
   - Inside the loop:
     - Map - Build Retry Webhook Request
       - Code: `gravity-code/10-map-build-retry-webhook-request.js`
       - Purpose: prepare `POST`, URL, headers, and body.
     - HTTP - POST Retry Body To Workflow Webhook
       - URL: loop map `url`
       - Method: `POST`
       - Headers: loop map `headers`
       - Body: loop map `body`

3E. Flow Control - End Scheduled Retry Run
   - Type: flow control
   - Action: end as success after the loop finishes.

4. Map - Normalize Webhook
   - Type: map
   - Code: `gravity-code/01-map-normalize-webhook.js`
   - Purpose: detect topic, normalize Shopify order ID/GID, preserve webhook metadata, capture edit notes, set alert recipients.
   - Edit notes carried from `body.order_edit.staff_note` and `body.order_edit.discounts.line_item.additions/removals[].description`.
   - Note destination is NetSuite item line `description`.
   - Also exposes `retry.webhookBody` so failure branches can add the original webhook body to the retry queue.

5. If - Event Is Edit?
   - Type: if
   - Condition: Step 4 `isEdit === true`
   - Yes path: Step 6.
   - No path: Step 5A.

5A. If - Event Is Cancellation?
   - Type: if
   - Condition: Step 4 `isCancellation === true`
   - Yes path: Step 8.
   - No path: Step 23, with an info log for unsupported webhook topic.
   - This replaces the current `Future - Cancellation Path (Not Yet Enabled)` flow-control skip.

6. Map - Build Shopify Full Order Query
   - Type: map
   - Code: `gravity-code/02-map-build-shopify-order-query.js`
   - Purpose: build GraphQL query and variables for the Shopify order.

7. Shopify - GraphQL Beta - Get Full Order
   - Type: app action
   - App: Shopify Big Country Toys connection
   - Action: GraphQL Beta
   - Query: Step 6 `query`
   - Variables: Step 6 `variables`
   - Step Completion Option:
     - Failure: Stop Workflow
     - Log level: Error
     - Send failure email: enabled
     - Recipients: Step 4 `alertRecipients`
   - Success log: `[Shopify] Fetched full order for Shopify order {{ Step 4 order.name/order.numericId }}.`

8. Map - Normalize Shopify Order
   - Type: map
   - Code: `gravity-code/03-map-normalize-shopify-order.js`
   - Purpose: produce one normalized order shape.
   - Edit path source: Step 7 Shopify GraphQL response.
   - Cancellation path source: Step 4 webhook `rawBody`; do not call Shopify GraphQL for cancellation unless the live payload is missing required fields.
   - Carries edit notes forward as `editNotes`.

9. NetSuite - Execute Custom Code - Find Sales Order And Items
   - Type: app action
   - App: NetSuite sandbox connection
   - Action: Execute Custom Code
   - Code: `gravity-code/04-netsuite-find-sales-order-and-items.js`
   - Purpose: find Sales Order by Shopify order name in `custbody_shopify_ord_id`, load status/lines, resolve Shopify SKUs to NetSuite items.
   - Step Completion Option:
     - Failure: Stop Workflow
     - Log level: Error
     - Send failure email: enabled
     - Recipients: Step 4 `alertRecipients`
   - Success log: `[NetSuite] Searched Sales Order for Shopify order {{ Step 8 name }}.`

10. Map - Build Update Plan
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
     - Stop/alert for missing or duplicate NetSuite SKU matches.
     - Merge duplicate Shopify lines with the same SKU when they can safely map to one NetSuite item line.
     - Multiple duplicate cancelled Shopify lines with quantity `0` collapse into one target line with quantity `0`.
     - Stop/alert for duplicate positive Shopify SKU lines only when their positive rates or locations differ.
     - For `orders/cancelled`, build `action: apply_cancellation`.
     - For `orders/edited`, build `action: apply_edit`.
     - Include Shopify lines with quantity `0` in `edit.targetLines[]` so cancelled items stay visible in NetSuite.
     - Add line-item discount descriptions to that line's `descriptionNotes[]`.
     - Add `staff_note` to `descriptionNotes[]` only for lines referenced by the edit delta; do not add it to older zero-quantity lines that merely appear in the full Shopify order.

11. If - Plan Can Apply?
   - Type: if
   - Condition: Step 10 `canApply === true`
   - Yes path: Step 12.
   - No path: Step 14.

12. NetSuite - Execute Custom Code - Apply Sales Order Update
    - Type: app action
    - App: NetSuite sandbox connection
    - Action: Execute Custom Code
    - Code: `gravity-code/06-netsuite-apply-sales-order-update.js`
    - Purpose:
      - Edit: update shipping address, item quantities/rates/locations, added lines, cancelled lines with quantity `0`, and discount line/percent.
      - Edit notes: append new notes to affected NetSuite item line `description` using ` - ` as the separator; preserve any description/notes already on the line.
      - Cancellation: close all open Sales Order item lines and append cancellation memo note.
    - Step Completion Option:
      - Failure: Stop Workflow
      - Log level: Error
      - Send failure email: enabled
      - Recipients: Step 4 `alertRecipients`
    - Success log: `[NetSuite] Applied {{ Step 10 action }} for Shopify order {{ Step 10 shopifyOrder.name }} to Sales Order {{ Step 10 netsuite.salesOrder.internalId }}.`

13. If - NetSuite Apply Failed?
    - Type: if
    - Condition: Step 12 `success === false`
    - Yes path: Step 14.
    - No path: Step 17.

14. Map - Build Alert Email
    - Type: map
    - Code: `gravity-code/07-map-build-alert-email.js`
    - Purpose: build manual review/failure email from plan and NetSuite result.

15. If - Should Send Alert?
    - Type: if
    - Condition: Step 14 `shouldSend === true`
    - Yes path: Step 16.
    - No path: Step 18.

16. Flow Control - Send Manual Review Or Failure Email
    - Type: flow control
    - Action: Send email
    - To: Step 14 `to`
    - Subject: Step 14 `subject`
    - Body: Step 14 `body`

17. Flow Control - Log Success
    - Type: flow control
    - Action: Info log
    - Message: `[NetSuite] Synced Shopify order update for {{ Step 10 shopifyOrder.name }} to Sales Order {{ Step 12 salesOrderId }}.`
    - Then end workflow as success.

18. KV/Memory - Get Retry Queue
    - Type: get memory / KV read
    - Key: Step 2 `retryQueueKey` or literal `big_country_order_update_retry_queue`
    - Purpose: load the current queue before appending this failed webhook body.

19. Map - Append Current Webhook To Retry Queue
    - Type: map
    - Input: Step 4, Step 10, Step 12, Step 18
    - Code: `gravity-code/11-map-append-current-webhook-to-retry-queue.js`
    - Purpose: append the original webhook body to the retry queue when the NetSuite update failed, or when the plan failure is retryable (`netsuite_lookup_failed` / `sales_order_not_found`).

20. If - Should Write Retry Queue?
    - Type: if
    - Condition: Step 19 `shouldWrite === true`
    - Yes path: Step 21.
    - No path: Step 23.

21. KV/Memory - Set Retry Queue
    - Type: set memory
    - Key: Step 19 `key`
    - Value: Step 19 `value`
    - Saves on: always

22. Map - Build Memory Entry (Optional Audit)
    - Type: map
    - Code: `gravity-code/08-map-build-memory-entry.js`
    - Purpose: optional per-run audit entry for failures/manual-review outcomes. This is separate from the retry queue.

23. Flow Control - End Skipped Or Alerted Run
    - Type: flow control
    - If alert/manual-review was sent: end workflow as success after logging warning.
    - If unexpected failure reached this branch: end workflow as failure.

## Retry Queue Behavior

- Queue key: `big_country_order_update_retry_queue` unless `workflowArguments.retryQueueKey` overrides it.
- Queue value: an array of original Shopify webhook bodies.
- Scheduled path reads the queue, clears it to `[]`, then POSTs each body to `workflowArguments.retryWebhookUrl`.
- Successful replayed webhooks disappear because the queue was drained before replay.
- Failed replayed webhooks are added back to the queue by the normal webhook failure branch.
- The append map deduplicates identical bodies by stable JSON fingerprint so one body is not appended twice to the same queue snapshot.

## Cancellation Branch

The current Gravity export has a false branch under `If - Event Is Edit` named `Future - Cancellation Path (Not Yet Enabled)` that ends the workflow as success. Replace that branch with:

1. `If - Event Is Cancellation?`
   - Condition: Step 4 `isCancellation === true`
   - True branch should continue to Step 8, `Map - Normalize Shopify Order`.
   - False branch should log unsupported webhook topic and end as success.

2. Step 8 should run from Step 1/Step 4 webhook data when no Shopify GraphQL response exists.
   - The `03-map-normalize-shopify-order.js` snippet already supports this by falling back to the webhook REST order body.

3. Step 10 should produce:
   - `action: apply_cancellation`
   - `canApply: true`
   - `cancellation.memoNote`

4. Step 12 should close all open Sales Order item lines, append the cancellation memo, and save the Sales Order.

   Do not implement cancellation by setting the Sales Order header `orderstatus` to `C`; that value can be returned by NetSuite as a compact status code but is not valid for this SuiteScript update path.

Do not add a Shopify GraphQL step to the cancellation branch unless the real cancellation webhook payload is missing required fields.

Before live cancellation testing:

- Replace `samples/order-cancelled-webhook-raw.json` with a real `orders/cancelled` payload.
- Identify one cancellable test order with matching NetSuite Sales Order.
- Re-check that the Sales Order is `Pending Approval` or `Pending Fulfillment`.

## Notes For Gravity Build

- App-step logs and failure emails belong on Shopify/NetSuite connector steps, not on native map/if/memory steps.
- Webhooks can run concurrently. The NetSuite apply step reloads and re-checks Sales Order status immediately before mutation.
- Scheduled retry runs should end before the normal webhook processing branch. Do not let a scheduled run continue into `Map - Normalize Webhook`.
- This workflow does not write back to Shopify.
- Shopify edit notes are written to affected NetSuite item line `description` values.
- Shipping cost, shipping method, taxes, refunds, tags, and custom attributes remain out of scope.
