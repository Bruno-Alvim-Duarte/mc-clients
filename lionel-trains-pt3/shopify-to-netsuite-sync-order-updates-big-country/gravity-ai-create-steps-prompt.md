# Cloudy Prompt - Create Gravity Step Skeleton

```text
You are Gravity AI / Cloudy. Please create or update a Gravity workflow skeleton for:

Workflow name:
Shopify to NetSuite - Sync Order Updates (Big Country)

Important:
- Do not write the final JavaScript, SuiteScript, or GraphQL code.
- I will manually paste the code into each code step after you create the workflow structure.
- Your job is to create the steps in the correct order, with clear names, correct step types, branches, app actions, and placeholder code/comments showing where I should paste each snippet.
- Keep the workflow inactive/draft.
- Use the Shopify Big Country Toys connection for Shopify app steps.
- Use the NetSuite sandbox connection for NetSuite app steps.
- First test scope is orders/edited only. Include the cancellation path as a future branch, but do not fully enable or test cancellation yet.
- Test record context: Shopify order #68073, Shopify numeric ID 7202376679490, NetSuite Sales Order internal ID 47142255, NetSuite status Pending Fulfillment, Shopify Exported tag present.

Business behavior:
- Webhook source: Shopify.
- Supported topics: orders/edited and orders/cancelled.
- For edit events, fetch the full Shopify order using Shopify GraphQL Beta before NetSuite lookup.
- For cancellation events, the webhook body should be enough to normalize the order and set the NetSuite Sales Order status to Cancelled.
- Only process Shopify orders with the Exported tag.
- Find NetSuite Sales Order by Shopify order name in NetSuite field custbody_shopify_ord_id.
- Only update NetSuite Sales Orders in Pending Approval or Pending Fulfillment.
- Stop and alert for Cancelled, Partially Fulfilled, Pending Billing / Partially Fulfilled, Billed / Fully Fulfilled, Closed, or unknown status.
- Missing or duplicate NetSuite SKU matches should alert and skip.
- Duplicate Shopify lines with the same SKU should be merged when they can safely map to one NetSuite item line. Multiple cancelled duplicate Shopify lines with quantity 0 should collapse into one target line with quantity 0. Duplicate positive Shopify SKU lines should alert only if their positive rates or locations differ.
- Edits should update shipping address, item quantities, item rates, item locations, added lines, cancelled lines by setting quantity to 0, and discount line/discount percent.
- If Shopify keeps a cancelled line item with quantity 0, preserve the NetSuite item line with quantity 0 so the cancelled item remains visible.
- Add Shopify line-item discount description notes to that NetSuite item line description using " - " as the separator. Preserve any existing description/notes already on the line and do not duplicate the same note.
- Add Shopify order_edit.staff_note to the description only for NetSuite item lines referenced by the edit delta using " - " as the separator. Preserve existing description/notes and do not add it to older zero-quantity lines that merely appear in the full Shopify order.
- Do not update shipping cost, shipping method, taxes, refunds, Shopify tags, or custom attributes.
- Do not write back to Shopify.
- On NetSuite update failure, write a memory entry, send an email, and stop.

Alert recipients:
bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com

Workflow arguments expected:
- locationID
- discountID

Create the following steps in this exact order.

1. Shopify Webhook Trigger
- Type: webhook trigger
- Topics: orders/edited and orders/cancelled.

2. Map - Normalize Webhook
- Type: map
- Placeholder code only:
  return [{ todo: "Paste code from 01-map-normalize-webhook.js here" }];
- Purpose: normalize webhook topic, Shopify order ID/GID, order name when available, event type, edit notes, and alert recipients.

3. If - Event Is Edit
- Type: if/else
- Condition should evaluate Step 2 output isEdit equals true.
- True branch: continue to Step 4.
- False branch: continue to Step 3A.

3A. If - Event Is Cancellation
- Type: if/else
- Condition should evaluate Step 2 output isCancellation equals true.
- True branch: continue to Step 6.
- False branch: log unsupported webhook topic and end the workflow as success.
- This replaces the current Future - Cancellation Path / Not Yet Enabled branch.

4. Map - Build Shopify Full Order Query
- Type: map
- Placeholder code only:
  return [{ todo: "Paste code from 02-map-build-shopify-order-query.js here" }];
- Purpose: build the GraphQL query and variables for the Shopify full order fetch.

5. Shopify - GraphQL Beta - Get Full Order
- Type: Shopify app action
- Connection: Shopify Big Country Toys
- Action: GraphQL Beta
- Query should eventually come from Step 4 output query.
- Variables should eventually come from Step 4 output variables.
- If you cannot wire the fields until code is pasted, leave clear notes on this step saying:
  Query = Step 4 output query
  Variables = Step 4 output variables
- Step Completion Option / Flow Control:
  - On failure: Stop Workflow
  - Log level: Error
  - Send failure email: true
  - To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com
  - Subject: Shopify to NetSuite - Sync Order Updates (Big Country) - Shopify GraphQL Failed
  - Failure log message should start with [Shopify].
  - Enable success log if available. Success log should start with [Shopify].

6. Map - Normalize Shopify Order
- Type: map
- Placeholder code only:
  return [{ todo: "Paste code from 03-map-normalize-shopify-order.js here" }];
- Purpose: normalize the full Shopify order for edit events or the webhook body for cancellation events, and carry edit notes forward.

7. NetSuite - Execute Custom Code - Find Sales Order And Items
- Type: NetSuite app action
- Connection: NetSuite sandbox
- Action: Execute Custom Code
- Placeholder SuiteScript only:
  function execute() { return { todo: "Paste code from 04-netsuite-find-sales-order-and-items.js here" }; }
  execute();
- Purpose: find Sales Order by Shopify order name in custbody_shopify_ord_id, load status/lines, and resolve Shopify SKUs to NetSuite items.
- Step Completion Option / Flow Control:
  - On failure: Stop Workflow
  - Log level: Error
  - Send failure email: true
  - To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com
  - Subject: Shopify to NetSuite - Sync Order Updates (Big Country) - NetSuite Lookup Failed
  - Failure log message should start with [NetSuite].
  - Enable success log if available. Success log should start with [NetSuite].

8. Map - Build Update Plan
- Type: map
- Placeholder code only:
  return [{ todo: "Paste code from 05-map-build-update-plan.js here" }];
- Purpose: apply business rules and decide whether to apply edit, apply cancellation, skip, alert, or stop. Include cancelled Shopify lines with quantity 0 in edit.targetLines[] and carry descriptionNotes[] per affected line.

9. If - Plan Can Apply
- Type: if/else
- Condition should evaluate Step 8 output canApply equals true.
- True branch: continue to Step 10.
- False branch: continue to Step 12.

10. NetSuite - Execute Custom Code - Apply Sales Order Update
- Type: NetSuite app action
- Connection: NetSuite sandbox
- Action: Execute Custom Code
- Placeholder SuiteScript only:
  function execute() { return { todo: "Paste code from 06-netsuite-apply-sales-order-update.js here" }; }
  execute();
- Purpose:
  - For edits: update shipping address, item quantities/rates/locations, added lines, cancelled lines with quantity 0, and discount line/percent.
  - For edit notes: append target descriptionNotes[] into the affected item line description using " - " as the separator, preserving existing notes and avoiding duplicates.
  - For cancellation: set Sales Order orderstatus = C / Cancelled and append cancellation memo note.
- Step Completion Option / Flow Control:
  - On failure: Stop Workflow
  - Log level: Error
  - Send failure email: true
  - To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com
  - Subject: Shopify to NetSuite - Sync Order Updates (Big Country) - NetSuite Update Failed
  - Failure log message should start with [NetSuite].
  - Enable success log. Success log should start with [NetSuite].

11. If - NetSuite Apply Failed
- Type: if/else
- Condition should evaluate Step 10 output success equals false.
- True branch: continue to Step 12.
- False branch: continue to Step 15.

12. Map - Build Alert Email
- Type: map
- Placeholder code only:
  return [{ todo: "Paste code from 07-map-build-alert-email.js here" }];
- Purpose: build a manual review or failure email from the update plan and NetSuite result.

13. If - Should Send Alert
- Type: if/else
- Condition should evaluate Step 12 output shouldSend equals true.
- True branch: continue to Step 14.
- False branch: continue to Step 16.

14. Flow Control - Send Manual Review Or Failure Email
- Type: Flow Control
- Action: Send email
- To should come from Step 12 output to.
- Subject should come from Step 12 output subject.
- Body should come from Step 12 output body.
- If fields cannot be wired before code is pasted, leave notes saying:
  To = Step 12 output to
  Subject = Step 12 output subject
  Body = Step 12 output body

15. Flow Control - Log Success
- Type: Flow Control
- Action: Info log and end workflow as success.
- Message should start with [NetSuite].
- Suggested message:
  [NetSuite] Synced Shopify order update to NetSuite Sales Order.

16. Map - Build Memory Entry
- Type: map
- Placeholder code only:
  return [{ todo: "Paste code from 08-map-build-memory-entry.js here" }];
- Purpose: prepare a memory entry for failures or manual-review outcomes.

17. If - Should Write Memory
- Type: if/else
- Condition should evaluate Step 16 output shouldWrite equals true.
- True branch: continue to Step 18.
- False branch: continue to Step 19.

18. Memory - Set Failure Or Manual Review Entry
- Type: Set Memory
- Key should come from Step 16 output key.
- Value should come from Step 16 output value.
- Saves on: always.
- If fields cannot be wired before code is pasted, leave notes saying:
  Key = Step 16 output key
  Value = Step 16 output value

19. Flow Control - End Skipped Or Alerted Run
- Type: Flow Control
- Action: end workflow as success for skipped/manual-review branches after logging a warning.
- Warning log message should start with [NetSuite] or [Shopify] depending on what Gravity supports.

Logging rules:
- Configure Step Completion Option / Flow Control only on external app connector steps by default: Shopify GraphQL and NetSuite Execute Custom Code.
- Do not add app-step completion logging/email configuration to native helper steps by default: map, if/else, flow control, loop, memory.
- App failure logs must start with [Shopify] or [NetSuite].
- Email subjects must include the full workflow name as plain text.
- Do not leave fake variable references in email bodies. If you cannot verify a variable path, use a simple static operational message for now and tell me what needs to be wired after code is pasted.

After creating/updating the workflow:
- Do not activate it.
- Report the final step list in order.
- Report the generated Gravity step keys for every code step if you can see them.
- Report any fields you could not wire until code is pasted.
- Report any connection/action limitation you encountered.
```
