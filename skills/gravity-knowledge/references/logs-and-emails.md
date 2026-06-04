# Gravity Logs And Email Guidelines

Use this document as context when asking Gravity AI to add logs and failure emails to an existing workflow.

Important: Gravity AI / Cloudy is an external service and does not have access to this local skill file, this vault, or any other local repository files unless their contents are pasted into the chat. Prompts sent to Gravity AI must be self-sufficient. Do not only reference this file path or other local docs. Include the relevant logging rules, workflow name, app step names, failure behavior, recipient details, and variable-reference requirements directly in the prompt.

Gravity workflows are built from steps. Some steps call external systems through apps such as NetSuite, Shopify, Acumatica, HubSpot, Salesforce, FTP, or other connectors. Other steps are native Gravity steps such as `map`, `if`, `loop`, `flow control`, and `set memory`.

## Which Steps Need Logs And Emails

Add logs and failure emails to app steps.

Examples of app steps:

- NetSuite search, create, update, delete, or SuiteScript steps.
- Shopify GraphQL, REST, order, fulfillment, payout, or customer steps.
- Acumatica create, update, query, or delete steps.
- Any other connector step that reads from or writes to an external system.

Do not add logs and emails to native Gravity steps by default.

Examples of native steps that usually do not need this setup:

- `map`
- `if`
- `loop`
- `set memory`
- Native `flow control` helper steps

Native steps can still prepare values used by logs and emails, such as recipient lists, workflow labels, record identifiers, or debug context. They just should not normally receive the Step Completion Option logging/email configuration themselves.

## Where To Configure Logs And Emails

On each app step, open the `Step Completion Option` tab and choose `Flow Control`.

Configure the available options based on the purpose of the step:

1. `When this step fails`
   Choose what Gravity should do if the app step fails.
   Available options are `Stop Workflow`, `Go to Next Step`, `Continue Loop`, and `Break Loop`.

2. `Log level`
   Choose `None`, `Error`, `Warning`, or `Info`.

3. `Log message`
   Write a clear message. This field can reference workflow variables.

4. `Send email on failure`
   Enable this when a human needs to know the app step failed.

5. `To`
   Set the recipients. Usually the recipients should come from an earlier `map` step, often the first map step in the workflow.

6. `Subject`
   Use a short subject that includes the workflow name. The workflow name normally cannot be referenced as a variable, so write the actual workflow name in the subject.

7. `Body`
   Write a dynamic, informative email body. Do not use a rigid fixed body for every step; include the specific context that helps debug the failed step.

8. `Enable On Success`
   Enable this when a successful app step should create a log.

9. `Log Message`
   For success logs, include the important result of the app action. This is especially important when the step creates, updates, or deletes a record in an app.

## Failure Behavior Rules

Choose failure behavior based on the risk of continuing.

- Use `Stop Workflow` when continuing could corrupt data, create duplicates, hide a systemic issue, or make later steps unsafe.
- Use `Continue Loop` when the workflow is processing records in a loop and the failure is specific to the current record. The workflow should skip the failed record and keep processing the remaining records.
- Use `Go to Next Step` only when the next step is intentionally designed to handle the missing or failed result.
- Use `Break Loop` when the current loop should stop, but the workflow may still need to run steps after the loop.

For record-level app failures inside a loop, the most common pattern is:

- Log level: `Error`
- Send email on failure: enabled
- When this step fails: `Continue Loop`
- Email body: say that the step failed and the current item was skipped

For critical app failures outside a loop, the most common pattern is:

- Log level: `Error`
- Send email on failure: enabled
- When this step fails: `Stop Workflow`
- Email body: say that the workflow was stopped

## Log Level Rules

Use `Error` for app step failures that require attention.

Use `Warning` for recoverable unexpected states where the workflow can continue but the result should be reviewed. For example, an optional lookup returned no match and the workflow is using a fallback.

Use `Info` for normal successful milestones. For example:

- `[NetSuite]` Created Sales Order `{{ createSalesOrder.id }}`
- `[Shopify]` Updated Fulfillment `{{ updateFulfillment.id }}`
- `[Acumatica]` Deleted record `{{ deleteRecord.id }}`
- `[NetSuite]` Found existing customer `{{ customerLookup.id }}` and skipped customer creation

Use `None` only when the step is low-value for observability or already covered by a nearby higher-value app step log.

## Log Message Do And Don't

Do:

- Start every log message with the app name in brackets, for example `[NetSuite]`, `[Shopify]`, or `[Acumatica]`.

Don't:

- Do not include the step number in the log message. Avoid using the step number because it can change and becomes difficult to maintain.

## Success Log Requirements

For app steps that create, update, delete, or materially change records, enable success logging.

Success logs should include:

- The action performed: created, updated, deleted, fetched, searched, skipped, or matched.
- The app name as the first part of the message, in brackets.
- The main source identifier, such as source order ID, customer email, SKU, item fulfillment ID, payout ID, or invoice number.
- The target record ID returned by the app step when available.
- Any context that helps reconcile the run later.
- No step number.

Examples:

```text
[NetSuite] Created Customer {{ createCustomer.internalid }} for Shopify customer {{ currentOrder.customer.id }} / {{ currentOrder.customer.email }}.
```

```text
[Shopify] Updated fulfillment {{ updateFulfillment.id }} for NetSuite Item Fulfillment {{ itemFulfillment.internalid }} and tracking number {{ tracking.number }}.
```

```text
[Acumatica] Deleted shipment {{ deleteShipment.id }} for source shipment {{ currentShipment.shipmentNbr }}.
```

## Failure Log Requirements

Failure logs should include:

- The step name when useful.
- The app name as the first part of the message, in brackets.
- What the step was trying to do.
- The key source record identifier.
- The target record identifier, if known.
- The error message or error object reference available from Gravity.
- No step number.

Example:

```text
[NetSuite] Failed while getting Sales Order memo for Item Fulfillment {{ item_fulfillment.internalid }}. Error: {{ step123.error.message }}
```

Replace `{{ step123.error.message }}` with the real Gravity variable reference for the failing step's error message.

## Failure Email Pattern

Failure emails should be specific to the step. Keep the structure consistent, but make the body dynamic and useful for debugging.

Email body pattern:

```text
Hello,

This is an automated notification. A failure was detected in your workflow and this step was skipped.

------------------------------------------------------------
STEP FAILURE DETAILS
------------------------------------------------------------

Step Name   : Get Sales Order Memo to see the Shopify Order ID
App         : NetSuite
Workflow    : NetSuite to Shopify - Update Shipments

------------------------------------------------------------
ERROR INFORMATION
------------------------------------------------------------

Error Message              : {{ step123.error.message }}
Timestamp                  : {{ step123.error.timestamp }}
Item Fulfillment ID Looked : {{ item_fulfillment.internalid }}
Shopify Order ID           : {{ shopifyOrder.id }}
NetSuite Sales Order ID    : {{ salesOrder.internalid }}

Add more workflow-specific context here when it helps debugging.

------------------------------------------------------------
NEXT STEPS
------------------------------------------------------------

Please check the workflow run logs for full details, including the complete stack trace and any additional context that may help diagnose the issue.

------------------------------------------------------------

This is an automated message. Please do not reply to this email.
```

Adjust the first sentence based on the configured failure behavior:

- If the step uses `Continue Loop`, say the failed record or current item was skipped.
- If the step uses `Go to Next Step`, say the workflow continued to the next step.
- If the step uses `Stop Workflow`, say the workflow was stopped.
- If the step uses `Break Loop`, say the loop was stopped and the workflow continued after the loop if applicable.

## Email Subject Rules

Subjects must be short and operational.

Requirements:

- Include the workflow name as plain text.
- Include the app name or failed operation when helpful.
- Do not use emojis.
- Do not include line breaks.
- Do not leave placeholders in the subject.

Good examples:

```text
NetSuite to Shopify - Update Shipments - NetSuite Step Failed
```

```text
Shopify Payout Reconciliation - Failed To Create NetSuite Journal Entry
```

Avoid:

```text
{{ workflow.name }} failed
```

```text
Emoji-prefixed NetSuite error subject
```

## Variable Reference Rules

Gravity text fields can reference workflow variables. The AI must use real workflow references and must verify them against the available steps and outputs.

Important rules:

- Do not leave placeholders like `{step error message}`, `{timestamp}`, `{record id}`, or `{workflow name}` in the final Gravity configuration.
- Use actual Gravity interpolation syntax, for example `{{ step123.bla }}`.
- Verify every referenced step key exists in the workflow.
- Verify every referenced output field exists or is the best available field from that step.
- For app responses that return arrays, reference the correct item path.
- If recipients are prepared in a map step, reference that actual map output in the `To` field.
- If the workflow name is needed in the email subject, write the real workflow name as text instead of trying to reference it as a variable.

Before applying the configuration, ask Gravity AI to review every `{{ ... }}` reference and fix hallucinated paths.

## Review Checklist

Before finishing, verify:

- Every app step that can fail has the right failure behavior.
- Important app failures have `Log level = Error`.
- Human-actionable failures have `Send email on failure` enabled.
- Success logs exist for create, update, delete, and other important external-system mutations.
- Success logs include created, updated, or deleted record IDs when available.
- Log messages start with the app name in brackets.
- Log messages do not include step numbers.
- Email subjects include the real workflow name, have no emojis, and have no line breaks.
- Email bodies include enough context to debug the failed record without opening every previous step.
- All `{{ ... }}` references are real and point to existing workflow step outputs.
- No placeholder tokens remain in the final configuration.
