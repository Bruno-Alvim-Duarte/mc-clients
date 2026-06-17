**Gravity AI Flow Control Prompt**
````text
You are Gravity AI/Cloudy. Update the existing Gravity workflow named "Amazon FBA to NetSuite - FBA Invoice Sync". Do not create a duplicate workflow.

Goal:
Implement consistent Step Completion Option / Flow Control behavior across the workflow, following the same logging and email pattern for every external app step.

Workflow context:
- Workflow name: Amazon FBA to NetSuite - FBA Invoice Sync
- Source app: Amazon Seller / Amazon Orders API
- Destination app: NetSuite
- Destination record: NetSuite Invoice
- Schedule: every 30 minutes
- Main source identifier: Amazon Order ID
- Alert recipients: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com
- Recipients are also available from the runtime config map step as the `recipients` output. Use the actual Gravity reference for that field if available.

Important implementation rule:
- Configure Step Completion Option / Flow Control on app connector steps that read from or write to external systems.
- Do not add Step Completion Option logging/email configuration to native helper steps by default: map, If/Else, loop, Set Memory, and existing Flow Control helper steps.
- Existing native Flow Control helper steps should remain as explicit business-path steps, for example skipped-order alert paths.

External app steps that need Flow Control configuration:
- Amazon - Get Recently Updated Shipped FBA Orders
- Amazon - Get Retry FBA Order by Order Id
- Amazon - Get Order Items
- NetSuite - Find Existing Invoice
- NetSuite - Resolve Invoice Items by SKU
- NetSuite - Create Invoice

Native steps that should usually NOT get app-step completion configuration:
- Map - Read Memory State and Retry Queue
- Map - Runtime Config and Amazon Query
- Memory - Reset Retry Fetched Orders Cache
- Map - Retry Orders To Fetch
- Iterate - Loop through Retry Orders To Fetch
- Map - Build Retry Fetched Orders Cache
- Memory - Set Retry Fetched Orders Cache
- Map - Merge and Deduplicate Amazon Orders
- Iterate - Loop through Amazon FBA Orders
- Map - Normalize Amazon Order
- If/Else - Order Has Required Data
- If/Else - No Existing Invoice
- Map - Build NetSuite Invoice Payload
- If/Else - Invoice Payload Can Be Created
- Map - Build Retry Queue Without Created Invoice
- Memory - Set Retry Queue After Created Invoice
- Flow Control - Log Invoice Created and Continue
- Map - Build Mismatch Alert
- Map - Build Retry Queue For Mismatch
- Memory - Set Retry Queue For Mismatch
- Flow Control - Email and Skip Mismatch
- Map - Build Retry Queue Without Existing Invoice
- Memory - Set Retry Queue After Existing Invoice
- Flow Control - Skip: Existing Invoice
- Map - Build Invalid Order Alert
- Map - Build Retry Queue For Invalid Order
- Memory - Set Retry Queue For Invalid Order
- Flow Control - Email and Skip Invalid Amazon Order
- Map - Build Next Checkpoint
- Memory - Set Checkpoint
- Memory - Clear Retry Fetched Orders Cache
- Flow Control - Log Batch Complete

Failure behavior pattern:
- For app steps outside the per-order processing loop, use `Stop Workflow` on failure when the step failing means the batch cannot safely continue.
- For app steps inside a loop, use `Continue Loop` on failure when the failure is specific to the current retry/order record and the remaining records can safely continue.
- Use `Error` log level for failures that require attention.
- Enable failure email for failures that need human attention.
- Failure email subject must include the real workflow name as plain text. Do not use a workflow variable in the subject.
- Failure email subject must not contain emojis, line breaks, or unresolved placeholders.
- Failure email body must include enough context to debug the failed record.
- Every app-specific log message must start with the app name in brackets, for example `[Amazon]` or `[NetSuite]`.
- Do not include step numbers in log messages.

Recommended per-step configuration:

1. Amazon - Get Recently Updated Shipped FBA Orders
- When this step fails: Stop Workflow
- Log level: Error
- Send email on failure: true
- To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, or the actual runtime config recipients reference if available
- Subject: Amazon FBA to NetSuite - FBA Invoice Sync - Amazon List Orders Failed
- Failure log message: [Amazon] Failed to list recently updated shipped FBA orders. Error: use the real Gravity error message reference for this step.
- Failure email body must say the workflow was stopped because Amazon orders could not be listed.
- Include context: Last Updated After, Last Updated Before, Order Status, Fulfillment Channel, Marketplace Scope, and the real error message/timestamp references.

2. Amazon - Get Retry FBA Order by Order Id
- This step is inside the retry-order loop.
- When this step fails: Continue Loop
- Log level: Error
- Send email on failure: true
- To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, or the actual runtime config recipients reference if available
- Subject: Amazon FBA to NetSuite - FBA Invoice Sync - Amazon Retry Order Failed
- Failure log message: [Amazon] Failed to fetch retry FBA order for Amazon Order ID <current retry order id>. Error: use the real Gravity error message reference for this step.
- Failure email body must say the current retry order was skipped and the workflow continued with the next retry/order.
- Include context: current retry Amazon Order ID, retry reason if available, and real error message/timestamp references.

3. Amazon - Get Order Items
- This step is inside the main Amazon order loop.
- When this step fails: Continue Loop
- Log level: Error
- Send email on failure: true
- To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, or the actual runtime config recipients reference if available
- Subject: Amazon FBA to NetSuite - FBA Invoice Sync - Amazon Order Items Failed
- Failure log message: [Amazon] Failed to get order items for Amazon Order ID <current Amazon Order ID>. Error: use the real Gravity error message reference for this step.
- Failure email body must say the current Amazon order was skipped and the workflow continued with the next order.
- Include context: current Amazon Order ID, marketplace, purchase date, last update date if available, and real error message/timestamp references.

4. NetSuite - Find Existing Invoice
- This step is inside the main Amazon order loop.
- When this step fails: Continue Loop
- Log level: Error
- Send email on failure: true
- To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, or the actual runtime config recipients reference if available
- Subject: Amazon FBA to NetSuite - FBA Invoice Sync - NetSuite Invoice Search Failed
- Failure log message: [NetSuite] Failed to search for an existing invoice for Amazon Order ID <current Amazon Order ID>. Error: use the real Gravity error message reference for this step.
- Failure email body must say the current Amazon order was skipped because duplicate checking could not be completed.
- Include context: Amazon Order ID, external ID being searched, and real error message/timestamp references.
- Do not allow the workflow to continue to invoice creation for this order if duplicate checking fails.

5. NetSuite - Resolve Invoice Items by SKU
- This step is inside the main Amazon order loop.
- When this step fails: Continue Loop
- Log level: Error
- Send email on failure: true
- To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, or the actual runtime config recipients reference if available
- Subject: Amazon FBA to NetSuite - FBA Invoice Sync - NetSuite Item Lookup Failed
- Failure log message: [NetSuite] Failed to resolve NetSuite items by SKU for Amazon Order ID <current Amazon Order ID>. Error: use the real Gravity error message reference for this step.
- Failure email body must say the current Amazon order was skipped because item matching could not be completed.
- Include context: Amazon Order ID, SKUs being matched if available, and real error message/timestamp references.
- Do not create a partial invoice when item lookup fails.

6. NetSuite - Create Invoice
- This step is inside the main Amazon order loop.
- When this step fails: Continue Loop
- Log level: Error
- Send email on failure: true
- To: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, or the actual runtime config recipients reference if available
- Subject: Amazon FBA to NetSuite - FBA Invoice Sync - NetSuite Invoice Create Failed
- Failure log message: [NetSuite] Failed to create invoice for Amazon Order ID <current Amazon Order ID>. Error: use the real Gravity error message reference for this step.
- Failure email body must say invoice creation failed for the current Amazon order and the workflow continued with the next order.
- Include context: Amazon Order ID, NetSuite customer ID, external ID, line count if available, shippingCost if available, and real error message/timestamp references.
- Enable On Success: true
- Success log message: [NetSuite] Created invoice <created invoice id> for Amazon FBA order <Amazon Order ID>.

Existing business-path Flow Control steps:
- Keep `Flow Control - Email and Skip Mismatch` as a warning log plus Send Email enabled. It should continue the loop.
- Keep `Flow Control - Email and Skip Invalid Amazon Order` as a warning log plus Send Email enabled. It should continue the loop.
- Keep `Flow Control - Skip: Existing Invoice` as an info log. It should continue the loop and should not send a failure email.
- Keep `Flow Control - Log Invoice Created and Continue` as an info log. It should continue the loop and should not send a failure email.
- Keep `Flow Control - Log Batch Complete` as an info log.

Failure email body template:
Use this structure, but replace every variable reference with real Gravity references from the current workflow.

Hello,

This is an automated notification. A failure was detected in the workflow.

The failed record was skipped and the workflow continued with the next record.

------------------------------------------------------------
STEP FAILURE DETAILS
------------------------------------------------------------

Step Name   : <actual step name>
App         : <Amazon or NetSuite>
Workflow    : Amazon FBA to NetSuite - FBA Invoice Sync

------------------------------------------------------------
ERROR INFORMATION
------------------------------------------------------------

Error Message     : <real Gravity error message reference>
Timestamp         : <real Gravity error timestamp reference, if available>
Amazon Order ID   : <real current Amazon Order ID reference, if available>
NetSuite Record   : <real NetSuite record ID/reference, if available>
Additional Context: <step-specific context>

------------------------------------------------------------
NEXT STEPS
------------------------------------------------------------

Please check the workflow run logs for full details, including the complete stack trace and any additional context that may help diagnose the issue.

------------------------------------------------------------

This is an automated message. Please do not reply to this email.

For the Amazon list-orders step only, change the wording to say the workflow was stopped because this is a batch-level failure.

Variable reference rules:
- Before saving, inspect the actual Gravity output keys for every referenced step.
- Replace all placeholder text such as `<current Amazon Order ID>`, `<created invoice id>`, `<real Gravity error message reference>`, and `<step-specific context>` with real Gravity variable references.
- If a step output is an array, reference the correct array item path.
- If the current loop item has a generated key, use that generated key.
- Do not leave `{record id}`, `{error}`, `{timestamp}`, `<...>`, or any unresolved placeholder in the final configuration.
- If Gravity cannot expose a specific value, omit that value from the body rather than inventing a reference.

Review checklist before finishing:
- Every external app step listed above has Flow Control configured.
- Batch-level app failures stop the workflow.
- Record-level app failures inside loops continue the loop.
- Human-actionable failures send email to the configured recipients.
- NetSuite invoice creation has a success log with created invoice ID and Amazon Order ID.
- Log messages start with `[Amazon]` or `[NetSuite]`.
- Log messages do not include step numbers.
- Email subjects include `Amazon FBA to NetSuite - FBA Invoice Sync`.
- Email bodies include enough context to debug the failed record.
- All variable references are real and verified against the current workflow.
- Report a concise summary of what you configured and any values you could not reference.
````
