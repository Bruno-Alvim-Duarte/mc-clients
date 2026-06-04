# Gravity AI Workflow Export Prompt

Use this prompt once per existing Gravity workflow.

```text
I need to recreate documentation for one already-built Gravity workflow in a local project folder.

Please inspect the current Gravity workflow named:

[PASTE WORKFLOW NAME HERE]

Return every detail needed for another AI/dev agent to create a complete folder for this workflow, similar to these existing Lionel Trains workflow docs:
- `lionel-trains/shopify-reconciliation`
- `lionel-trains/sync-invetory`

Do not include secrets, tokens, passwords, private keys, or full credential values. For credentials, return only the connector/app name, account label if visible, environment, and what permission/scope appears to be required.

Preferred output:

1. Full Gravity workflow YAML
   - If Gravity can export the full workflow YAML, include it in a fenced `yaml` block.
   - Include all node IDs, step IDs, names, app/action types, connections, branch structure, schedules, retry settings, error settings, and embedded code/query bodies.
   - Preserve exact step names and internal references.

2. Human-readable workflow summary
   - Workflow name.
   - Business purpose.
   - Source systems and destination systems.
   - What starts the workflow.
   - What records/data it reads.
   - What records/data it creates, updates, or deletes.
   - Expected final result.

3. Folder/documentation metadata
   - Recommended folder slug, using lowercase kebab-case.
   - Recommended main document filename.
   - Any related workflow names this workflow depends on.
   - Whether this workflow is production, staging, draft, disabled, or test-only.

4. Step-by-step implementation inventory
   For every step, include:
   - Step number/order.
   - Exact step name.
   - Gravity node/step ID.
   - App/type/action.
   - Parent step, branch, or loop context.
   - Inputs and where each input comes from.
   - Output shape and important output fields.
   - Any filters, conditions, loop settings, branch logic, and stop/continue behavior.
   - Any dynamic expressions or references to previous steps.
   - Any hardcoded values.
   - Any values that should become environment/config variables.

5. Code, queries, and payloads
   Include exact bodies for all:
   - JavaScript/map/transform steps.
   - Shopify GraphQL queries/mutations and variables.
   - NetSuite SuiteQL queries.
   - NetSuite SuiteScript code.
   - REST requests: method, URL/path, headers with secrets redacted, query params, and body.
   - Payload builders or response parsers.

6. Business rules and mappings
   - Field mappings from source to destination.
   - Account, department, division, subsidiary, location, currency, class, store, warehouse, or payment mappings.
   - Date/time rules and timezone.
   - Filtering rules.
   - Matching rules.
   - Idempotency/deduplication rules.
   - Checkpoint or incremental sync rules.
   - Rounding, quantity, currency, tax, fee, or accounting calculations.

7. Error handling and alerts
   - Retry policy.
   - What happens when a step fails.
   - What gets skipped and why.
   - Email/log/Slack alerts, with recipients included if visible.
   - Any manual follow-up instructions built into the workflow.

8. Runtime configuration
   - Schedule/cadence, days, and timezone.
   - Environment-specific values.
   - Connector credentials used, with secrets redacted.
   - Required feature flags or Gravity environment variables.
   - Any currently hardcoded test filters or test data.

9. Validation material
   - Example input record/payload.
   - Example output record/payload.
   - Recent successful run summary if available.
   - Recent failure examples if available.
   - Known edge cases.
   - Open questions or assumptions.

10. Gaps
   If you cannot access the full YAML or any specific setting, say exactly what is missing and provide the closest available information from the workflow UI.

Return the answer in Markdown. Put the YAML first if available, then the structured sections above. Be exhaustive: the goal is that another AI/dev agent can create the local folder and documentation without needing to inspect Gravity again.
```

