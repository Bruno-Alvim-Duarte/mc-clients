# Gravity AI Prompt

Use this reference when generating a prompt for Gravity AI/Cloudy based on a workflow JSON.

Gravity AI/Cloudy does not have access to local skill files, repository files, or notes unless their contents are pasted into the prompt. The prompt must be self-contained.

## Output Shape

After the workflow JSON, add a separate section:

````markdown
**Gravity AI Prompt**
```text
...
```
````

If the user asks only for the prompt and already supplied a `workflow.json`, output only the prompt.

## Prompt Template

````text
You are Gravity AI/Cloudy. Implement the Gravity workflow described by the WORKFLOW_JSON parameter below.

Goal:
- Create or update a Gravity workflow that matches the supplied JSON as closely as Gravity supports.
- Preserve the workflow name, description, trigger, step order, step names, step responsibilities, conditions, loop targets, pagination settings, args, and code blocks.
- If a Gravity UI or connector limitation requires a small adaptation, make the smallest safe adaptation and report it at the end.

Implementation rules:
- Treat app connectors as Gravity app/action steps.
- Treat `map`, `loop`, `conditional`, `set memory`, and flow-control steps as native Gravity steps.
- Use map JavaScript for normalization, validation, payload construction, derived flags, and branch data.
- For NetSuite non-trivial work, use Execute Custom Code / SuiteScript. This includes searches, saved-search-like filters, duplicate checks, transaction transforms, record creation, updates, and complex field handling.
- For Shopify non-trivial work, use GraphQL Beta. This includes nested reads, custom filtering, mutations, and any query that needs fields not exposed by a simple list action.
- Use existing app actions only for simple operations where the arguments in the JSON are enough.
- Do not collapse the workflow into one large code step. Keep the step boundaries from the JSON unless Gravity cannot represent them.

Branching and loop rules:
- Implement `conditional` steps as If/Else steps using the supplied condition.
- Implement `loop` steps against the specified `loopTarget`.
- Keep child steps inside the appropriate loop or parent step.
- If explicit `branches` are present, use them to determine the intended true/false paths.
- If explicit `branches` are not present, infer the path from step order and step names, then report the inferred path summary.

Variable-reference rules:
- Verify every `[Step N: ...]` reference points to an existing previous step.
- Verify every `{{ ... }}` interpolation points to a real Gravity variable or replace it with the correct variable reference.
- Do not leave placeholders such as `{record id}`, `{error}`, or `{timestamp}`.
- If a placeholder like `{{CONFIRM_EMAIL_RECIPIENTS}}` remains, do not guess the value. Leave it visible and report it as a required confirmation.

Logging and failure behavior:
- Configure Step Completion Option / Flow Control for app steps when the JSON specifies logging or failure behavior.
- For app-step failures inside loops, prefer `Continue Loop` only when the failed record can be safely skipped.
- For critical app-step failures outside loops, prefer `Stop Workflow`.
- Use `Error` logs for failures requiring attention, `Warning` logs for recoverable unexpected states, and `Info` logs for successful milestones.
- Start app-specific log messages with the app name in brackets, for example `[NetSuite]`, `[Shopify]`, `[Acumatica]`, or `[HubSpot]`.
- Do not include step numbers in log messages.
- Enable success logs for create, update, delete, and other material external-system mutations when specified or when safe to do so.
- Failure email subjects must include the real workflow name as plain text and must not contain placeholders.
- Failure email bodies should include the step name, app, workflow name, error message reference, and record identifiers available from earlier steps.

Safety rules:
- Implement duplicate checks before create steps.
- Preserve idempotency keys, external IDs, custom matching fields, and skip/update/create behavior from the JSON.
- Validate required data before external mutations.
- Preserve explicit behavior for missing matches, partial line-item matches, and ambiguous matches.
- Preserve checkpoint and pagination behavior for scheduled polling workflows.

Before finishing:
- Review all step names and step numbers against the JSON.
- Review all code blocks for syntax issues introduced during implementation.
- Review all variable references and action args.
- Report any unresolved fields, credentials, connector actions, internal IDs, custom field IDs, email recipients, or business decisions that still need confirmation.
- Provide a concise implementation summary listing any adaptations made.

WORKFLOW_JSON:
```json
{{WORKFLOW_JSON}}
```
````

## Prompt Construction Rules

- Replace `{{WORKFLOW_JSON}}` with the complete final workflow JSON.
- Keep code blocks from the JSON intact.
- Include `assumptions`, `openQuestions`, and `implementationNotes` if they exist in the workflow artifact.
- If the workflow contains many unresolved placeholders, add a short "Known unresolved confirmations" section before `WORKFLOW_JSON`.
- Do not reference local file paths or skill names in the final prompt.
- Do not include conversational context that Gravity AI does not need.

## Optional Known Unresolved Confirmations Section

Use this section only when the workflow JSON contains placeholders or open questions:

```text
Known unresolved confirmations:
- `{{CONFIRM_EMAIL_RECIPIENTS}}`: Confirm who should receive failure emails.
- `{{CONFIRM_NETSUITE_ACCOUNT_ID}}`: Confirm NetSuite account ID for record links.
```
