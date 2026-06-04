# Cloudy Prompt: Add Logs And Failure Emails

Use this prompt with Cloudy / Gravity AI. It is intentionally self-contained because Cloudy does not have access to this local repository or the reference files in this vault.

Replace `ACCOUNTING_EMAIL@example.com` with the real recipient before sending.

```text
Please update the Gravity workflow `Shopify to NetSuite - Shopify Payout Reconciliation` to add Step Completion Option logging and failure emails for every external app connector step.

This workflow reconciles Shopify Payments payouts into NetSuite Journal Entries. It fetches Shopify payouts, filters eligible paid payouts, loops through each payout, checks NetSuite for an existing Journal Entry by externalId, creates a NetSuite Journal Entry when needed, logs each payout result, builds a batch summary, and updates a checkpoint.

Workflow name:
Shopify to NetSuite - Shopify Payout Reconciliation

Logging and email rules to apply:
- Add Step Completion Option logging and failure emails to app connector steps only.
- Do not add Step Completion Option logging/email config to native `map`, `if`, `loop`, `set memory`, or native `flow control` helper steps by default.
- Native steps may prepare values used by logs/emails, such as recipient lists, workflow labels, record identifiers, and context.
- On each app step, open the `Step Completion Option` tab and choose `Flow Control`.
- Configure:
  - `When this step fails`
  - `Log level`
  - `Log message`
  - `Send email on failure`
  - `To`
  - `Subject`
  - `Body`
  - success logging, when useful
- Use `Error` for app step failures that require attention.
- Use `Info` for normal successful app milestones.
- Failure email subjects must include the real workflow name as plain text.
- Do not use `{{ workflow.name }}` in subjects.
- Do not use emojis.
- Do not include line breaks in subjects.
- Every log message must start with the app name in brackets, such as `[Shopify]` or `[NetSuite]`.
- Do not include step numbers in log messages.
- Do not leave placeholders like `{step error message}`, `{timestamp}`, `{record id}`, `{workflow name}`, or fake step IDs.
- Use actual Gravity interpolation syntax`.
- Verify every referenced step key exists in this workflow.
- Verify every referenced output field exists or is the best available field from that step.
- If an app response returns arrays, reference the correct item path.
- Before saving, review every `{{ ... }}` reference and fix hallucinated paths.

Recipient setup:
- It's already set up the recipient for failure emails. It's available on the first map step

App connector steps that need configuration:
1. `Shopify: Fetch Payouts (GraphQL)`
2. `NetSuite: Search Existing JE by ExternalId`
3. `NetSuite: Create Journal Entry`

Specific configuration:

1. `Shopify: Fetch Payouts (GraphQL)`
- Failure behavior: `Stop Workflow``
- Reason: if Shopify payouts cannot be fetched, the workflow has no reliable source data and should not continue.
- Failure log level: `Error`
- Failure log message:
  `[Shopify] Failed to fetch Shopify Payments payouts for Shopify payout reconciliation. Error: {{ use the real error message reference for this Shopify step }}`
- Send email on failure: enabled
- To: use the configured alert recipient reference, or the literal configured recipient if a shared recipient variable is not available.
- Failure email subject:
  `Shopify to NetSuite - Shopify Payout Reconciliation - Shopify Fetch Failed`
- Failure email body:
  Include a clear message that the workflow was stopped because payouts could not be fetched.
  Include:
  - Workflow: `Shopify to NetSuite - Shopify Payout Reconciliation`
  - Step Name: `Shopify: Fetch Payouts (GraphQL)`
  - App: `Shopify`
  - Failure Behavior: `Stop Workflow`
  - Store name from the config step, if available
  - Current checkpoint `lastIssuedAt`, if available
  - Current checkpoint `lastPayoutId`, if available
  - Error message from this Shopify step
  - Timestamp from this Shopify step, if available
- Enable success logging if supported:
  `[Shopify] Fetched Shopify payout data for {{ use the real store name reference }}.`

2. `NetSuite: Search Existing JE by ExternalId`
- This step is inside the payout loop.
- Failure behavior: `Continue Loop`
- Reason: if the idempotency lookup fails, the current payout must be skipped to avoid creating a duplicate Journal Entry, but other payouts should still be processed.
- Failure log level: `Error`
- Failure log message:
  `[NetSuite] Failed to search existing Journal Entry by externalId {{ use the real externalId reference }} for Shopify payout {{ use the real payoutId reference }}. Error: {{ use the real error message reference for this NetSuite search step }}`
- Send email on failure: enabled
- Failure email subject:
  `Shopify to NetSuite - Shopify Payout Reconciliation - NetSuite Search Failed`
- Failure email body:
  Include a clear message that the current payout was skipped and the loop continued.
  Include:
  - Workflow: `Shopify to NetSuite - Shopify Payout Reconciliation`
  - Step Name: `NetSuite: Search Existing JE by ExternalId`
  - App: `NetSuite`
  - Failure Behavior: `Continue Loop`
  - Store name
  - Payout ID
  - External ID
  - Issued At or Issued Date, if available
  - Error message
  - Timestamp, if available
- Enable success logging:
  - If Gravity can conditionally describe the result and an existing JE is found:
    `[NetSuite] Found existing Journal Entry for Shopify payout {{ use the real payoutId reference }} with externalId {{ use the real externalId reference }}.`
  - If Gravity can conditionally describe the result and no JE is found:
    `[NetSuite] No existing Journal Entry found for Shopify payout {{ use the real payoutId reference }} with externalId {{ use the real externalId reference }}.`
  - If conditional success log messages are not supported on this step, use one neutral success log:
    `[NetSuite] Completed Journal Entry idempotency search for Shopify payout {{ use the real payoutId reference }} with externalId {{ use the real externalId reference }}.`

3. `NetSuite: Create Journal Entry`
- This step is inside the payout loop.
- Failure behavior: `Continue Loop`
- Reason: a failed Journal Entry creation should skip the current payout but allow the batch to continue.
- Failure log level: `Error`
- Failure log message:
  `[NetSuite] Failed to create Journal Entry for Shopify payout {{ use the real payoutId reference }} with externalId {{ use the real externalId reference }}. Error: {{ use the real error message reference for this NetSuite create step }}`
- Send email on failure: enabled
- Failure email subject:
  `Shopify to NetSuite - Shopify Payout Reconciliation - Create JE Failed`
- Failure email body:
  Include a clear message that the current payout was skipped and the loop continued.
  Include:
  - Workflow: `Shopify to NetSuite - Shopify Payout Reconciliation`
  - Step Name: `NetSuite: Create Journal Entry`
  - App: `NetSuite`
  - Failure Behavior: `Continue Loop`
  - Store name
  - Payout ID
  - External ID
  - Issued Date
  - Net Amount
  - Fee Total
  - Clearing Amount
  - Total Debits
  - Total Credits
  - Memo
  - Error message
  - Timestamp, if available
- Enable success logging:
  `[NetSuite] Created Journal Entry {{ use the real created JE id reference }} for Shopify payout {{ use the real payoutId reference }} with externalId {{ use the real externalId reference }}.`

Email body pattern to use for each failure email:

Hello,

This is an automated notification. A failure was detected in the workflow.

For `Stop Workflow`, say: The workflow was stopped.
For `Continue Loop`, say: The current payout was skipped and the workflow continued with the next payout.

------------------------------------------------------------
STEP FAILURE DETAILS
------------------------------------------------------------

Step Name        : [actual step name]
App              : [Shopify or NetSuite]
Workflow         : Shopify to NetSuite - Shopify Payout Reconciliation
Failure Behavior : [Stop Workflow or Continue Loop]

------------------------------------------------------------
ERROR INFORMATION
------------------------------------------------------------

Error Message : {{ use the real step error message reference }}
Timestamp     : {{ use the real timestamp reference if available }}

Then include the workflow-specific context available for that step:
- Store
- Payout ID
- External ID
- Issued Date
- Net Amount
- Fee Total
- Clearing Amount
- Total Debits
- Total Credits
- Memo
- Checkpoint values for the Shopify fetch step

------------------------------------------------------------
NEXT STEPS
------------------------------------------------------------

Please check the workflow run logs for full details, including the complete error context and any additional information needed to diagnose the issue.

------------------------------------------------------------

This is an automated message. Please do not reply to this email.

Batch summary:
- Keep the existing batch summary log after the loop.
- Do not replace per-app-step failure emails with only a batch summary.
- Make sure the batch summary still receives created, skipped, and failed statuses correctly after the new failure behavior is configured.
- Keep the summary log at info level.

Final review checklist before finishing:
- Every external app connector step has failure behavior configured.
- Every external app connector step has `Log level = Error` for failures.
- Every human-actionable app failure has `Send email on failure` enabled.
- `Shopify: Fetch Payouts (GraphQL)` uses `Stop Workflow` on failure.
- `NetSuite: Search Existing JE by ExternalId` uses `Continue Loop` on failure.
- `NetSuite: Create Journal Entry` uses `Continue Loop` on failure.
- NetSuite create has a success log with the created Journal Entry ID.
- Success logs exist for meaningful external app milestones.
- Log messages start with `[Shopify]` or `[NetSuite]`.
- Log messages do not include step numbers.
- Email subjects include `Shopify to NetSuite - Shopify Payout Reconciliation`.
- Email subjects have no emojis and no line breaks.
- Email bodies include enough context to debug the failed record.
- Every `{{ ... }}` reference points to a real existing workflow step and output.
- No placeholder tokens remain.
```
