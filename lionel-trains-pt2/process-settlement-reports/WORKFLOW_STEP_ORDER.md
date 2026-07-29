# Workflow Step Order

Workflow:
`Amazon Settlement Reports to NetSuite Journal Entries`

This is the idealized Gravity step order. Only map and NetSuite Execute Custom Code steps have local code files; app, loop, if, memory, and flow-control steps are included here to show the full workflow structure.

## Top-Level Steps

1. **Schedule Trigger**
   - Run daily.
   - No local code file.

2. **Map: Build Runtime Config**
   - Centralizes recipients, cutoff date, NetSuite defaults, account IDs, File Cabinet folder, memory key prefix, and behavior flags.
   - Local code: `gravity-code/maps/00_build_runtime_config.js`

3. **Amazon Seller: List Completed Settlement Reports**
   - App action: `List FBM Reports`
   - Report type: `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`
   - Processing status: `DONE`
   - Region: America
   - No local code file.

4. **Memory/KV: Get Failed Settlements**
   - Purpose: read the shared key `amazon_settlement_failures`.
   - This must run before filtering so unresolved failed settlements can be merged back into the loop input.
   - If the key does not exist yet, continue with an empty array.
   - No local code file.

5. **Map: Filter Completed Settlement Reports**
   - Purpose: filter/sort Amazon reports after cutoff date, merge unresolved failed settlements from `amazon_settlement_failures`, dedupe, and expose `reports` for the loop.
   - Reads runtime config from `Build Runtime Config`, Amazon list output, and the failed-settlements Memory/KV get output.
   - Local code: `gravity-code/maps/01_filter_completed_settlement_reports.js`

6. **If: Any Reports Found**
   - If `reportCount > 0`, continue to the report loop.
   - If no reports are found, log success/no-op and end.
   - No local code file.

7. **Loop: Loop Settlement Reports**
   - Iterate over `Filter Completed Settlement Reports.reports`.
   - No local code file.

## Inside Report Loop

8. **Amazon Seller: Get Settlement Report Document**
   - App action: `Get FBM Report Document`
   - Input: current loop item's `reportDocumentId`
   - No local code file.

9. **HTTP: Download Settlement Report**
   - Method: `GET`
   - URL: signed URL from `Get Settlement Report Document`
   - No local code file.

10. **Map: Parse Settlement Report TSV**
   - Purpose: parse TSV, validate headers, validate detail total against header total, validate tax net, categorize rows, and expose settlement-level accounting data.
   - Reads account IDs and behavior flags from `Build Runtime Config`.
   - Local code: `gravity-code/maps/02_parse_settlement_report_tsv.js`

11. **If: Parsed Settlement Is Createable**
    - If `canCreateJournalEntry = true`, continue.
    - If false, go to failure-memory/log branch, then continue loop.
    - No local code file.

12. **Map: Build NetSuite Journal Entry Payload**
   - Purpose: build NetSuite Journal Entry payload and verify debits equal credits.
   - Reads NetSuite defaults and currency mapping from `Build Runtime Config`.
   - Does not add a clearing/balancing account. Cash account `1113` is the clearing line through the settlement header `total-amount`.
   - Local code: `gravity-code/maps/03_build_journal_entry_payload.js`

13. **NetSuite Execute Custom Code: Search Existing Journal Entry**
    - Purpose: search NetSuite by external ID `amazon_settlement_{settlement-id}`.
    - Local code: `gravity-code/netsuite/01_search_existing_journal_entry.js`

14. **Memory/KV: Get Failure State**
    - Purpose: read the shared key `amazon_settlement_failures`.
    - Needed so an existing Journal Entry can still go through CSV attachment retry if the previous run created the JE but failed attaching the file.
    - The value is an array. A pending attachment failure exists when one array item has the current `settlementId` and enough context to retry attachment.
    - No local code file.

15. **If: Existing Journal Entry Decision**
    - If multiple matching JEs exist: failure branch, save failure state, email/log, continue loop.
    - If exactly one JE exists and no pending attachment failure exists: log skip, continue loop.
    - If exactly one JE exists and pending attachment failure exists: continue to CSV attachment retry.
    - If no JE exists: continue to create JE.
    - No local code file.

16. **NetSuite Execute Custom Code: Create Journal Entry**
    - Purpose: create the NetSuite Journal Entry.
    - Run only when no matching JE exists.
    - Local code: `gravity-code/netsuite/02_create_journal_entry.js`

17. **If: Journal Entry Created Or Existing Retry Target Available**
    - Continue only if there is a newly created JE or an existing JE from a pending attachment retry.
    - If missing, failure branch, save failure state, email/log, continue loop.
    - No local code file.

18. **NetSuite Execute Custom Code: Attach Settlement CSV**
   - Purpose: save the downloaded settlement report in NetSuite File Cabinet and attach it to the Journal Entry.
   - Reads File Cabinet folder ID from `Build Runtime Config`.
   - Local code: `gravity-code/netsuite/03_attach_settlement_csv.js`

19. **If: Attachment Succeeded**
    - If successful, clear or resolve failure state if one existed.
    - If failed, build failure memory payload, save failure state, email/log, continue loop.
    - No local code file.

20. **Map: Build Resolved Failure Memory Payload**
    - Purpose: remove the current settlement from the shared failure array after a successful retry or successful full process.
    - Reads the current `amazon_settlement_failures` array from the Memory/KV get step and returns the same key with a filtered array value.
    - Local code: `gravity-code/maps/05_build_resolved_failure_memory_payload.js`

21. **Memory/KV: Save Updated Failure Array**
    - Key: `amazon_settlement_failures`
    - Value: output `value` from `Build Resolved Failure Memory Payload`.
    - No local code file.

22. **Flow Control: Log Settlement Success**
    - Log created, skipped, or attachment-retried result.
    - No local code file.

## Failure Branch Used Inside The Loop

Use this branch from any loop-level failure point that should skip only the current settlement and continue with the next report.

23. **Memory/KV: Get Current Failure Array**
    - Key: `amazon_settlement_failures`
    - Run immediately before building the failure payload so this branch does not overwrite failures added earlier in the same workflow run.
    - If the key does not exist, continue with an empty array.
    - No local code file.

24. **Map: Build Failure Memory Payload**
    - Purpose: add or replace the current settlement in the shared retryable failure array.
    - Reads the current `amazon_settlement_failures` array from `Get Current Failure Array` and returns the same key with the updated array value.
    - Set or provide `failurePhase` according to the failed stage, for example:
      - `parse_report`
      - `build_je_payload`
      - `search_existing_je`
      - `create_je`
      - `attach_csv`
      - `multiple_existing_je`
    - Local code: `gravity-code/maps/04_build_failure_memory_payload.js`

25. **Memory/KV: Save Failure State**
    - Key: `amazon_settlement_failures`
    - Value: output `value` from `Build Failure Memory Payload`
    - No local code file.

26. **Flow Control: Send Failure Email And Continue Loop**
    - Recipients:
      `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`
    - Behavior: continue loop.
    - No local code file.

## After The Loop

27. **Optional Memory: Update Checkpoint**
    - Update only after the full page/batch succeeds.
    - This checkpoint should not be treated as processed-settlement storage.
    - Do not let checkpointing prevent retrying failure states.
    - No local code file.

28. **Flow Control: Log Batch Summary**
    - Include report count, created count, skipped count, attachment retry count, and failure count if available.
    - No local code file.

## App Step Failure Handling

Configure Step Completion Options on app steps:

- Amazon Seller steps
- HTTP download step
- NetSuite Execute Custom Code steps
- Memory/KV app steps if applicable

Recommended behavior:

- Outside the report loop: stop workflow and email.
- Inside the report loop: save failure state, email, and continue loop.

## Local Code File Index

| Workflow Step | Local File |
| --- | --- |
| Map: Build Runtime Config | `gravity-code/maps/00_build_runtime_config.js` |
| Map: Filter Completed Settlement Reports | `gravity-code/maps/01_filter_completed_settlement_reports.js` |
| Map: Parse Settlement Report TSV | `gravity-code/maps/02_parse_settlement_report_tsv.js` |
| Map: Build NetSuite Journal Entry Payload | `gravity-code/maps/03_build_journal_entry_payload.js` |
| Map: Build Failure Memory Payload | `gravity-code/maps/04_build_failure_memory_payload.js` |
| Map: Build Resolved Failure Memory Payload | `gravity-code/maps/05_build_resolved_failure_memory_payload.js` |
| NetSuite: Search Existing Journal Entry | `gravity-code/netsuite/01_search_existing_journal_entry.js` |
| NetSuite: Create Journal Entry | `gravity-code/netsuite/02_create_journal_entry.js` |
| NetSuite: Attach Settlement CSV | `gravity-code/netsuite/03_attach_settlement_csv.js` |

## Values To Replace Before Go-Live

- Do not add `amazonSettlementTaxAccountId`; tax is validation-only and must not be posted.
- Do not add `amazonSettlementBalancingAccountId`; Cash account `1113` is the clearing line.
- Sandbox File Cabinet folder ID `701790` in `gravity-code/maps/00_build_runtime_config.js`, or pass `amazonSettlementFileCabinetFolderId` as a workflow argument
- Placeholder Gravity step keys inside each code file after Cloudy creates the actual steps
