# Gravity Workflow Patterns

Use this reference when designing or reviewing a complete Gravity workflow.

## Batch And Checkpoint Pattern

Prefer scheduled workflows for polling integrations that process records in pages.

Typical structure:

1. Trigger on a schedule.
2. Read the last checkpoint from memory.
3. Query the source app for a limited page of records after the checkpoint, commonly 50 records.
4. Loop through the returned array.
5. Use map steps for transformations, validations, duplicate keys, and payload shaping.
6. Use app steps for target-system calls.
7. Use flow control logs for successful milestones.
8. On record-level failure, log the error, send email when action is needed, and decide whether to fail the workflow or continue the loop.
9. After successful processing, store the last processed created date, updated date, issued date, or stable ordering ID in memory.

Choose the checkpoint field carefully. Prefer a monotonic field such as created timestamp, updated timestamp, issued date, or an ordered ID. If records can share the same timestamp, include a tie-breaker strategy.

## Map Step Practices

Keep business logic in map steps. Use map steps to:

- Normalize source data.
- Build search queries.
- Prepare connector payloads.
- Derive variables for later steps.
- Parse arrays returned by app actions.
- Guard optional data with optional chaining.

Assume prior-step outputs are available through `input.<stepKey>`. Many app results are arrays even when the app returns one logical record, so start with `[0]` only when the workflow expects a single item.

## Logging And Error Handling

Use info logs for normal progress such as "customer created" with the created ID. Use warning logs for recoverable unexpected states. Use error logs plus email for failures that need human attention.

In loop workflows, use flow control to skip the current record when the error is record-specific and the rest of the batch can continue. Fail the workflow when continuing could corrupt data or hide a systemic issue.

For detailed app-step log and email configuration, including Step Completion Option settings, success log expectations, email subject rules, and Gravity AI prompt guidance, read [logs-and-emails.md](logs-and-emails.md).

## Field Interpolation

Treat Gravity text fields, especially flow control log messages and email fields, as variable-aware fields. Build messages with useful identifiers from the workflow such as source ID, target ID, customer name, order number, or checkpoint value.
