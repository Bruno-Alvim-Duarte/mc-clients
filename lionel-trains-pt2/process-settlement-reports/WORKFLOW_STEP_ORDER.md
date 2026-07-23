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

4. **Map: Filter Completed Settlement Reports**
   - Purpose: filter/sort Amazon reports after cutoff date and expose `reports` for the loop.
   - Reads runtime config from `Build Runtime Config`.
   - Local code: `gravity-code/maps/01_filter_completed_settlement_reports.js`

5. **If: Any Reports Found**
   - If `reportCount > 0`, continue to the report loop.
   - If no reports are found, log success/no-op and end.
   - No local code file.

6. **Loop: Loop Settlement Reports**
   - Iterate over `Filter Completed Settlement Reports.reports`.
   - No local code file.

## Inside Report Loop

7. **Amazon Seller: Get Settlement Report Document**
   - App action: `Get FBM Report Document`
   - Input: current loop item's `reportDocumentId`
   - No local code file.

8. **HTTP: Download Settlement Report**
   - Method: `GET`
   - URL: signed URL from `Get Settlement Report Document`
   - No local code file.

9. **Map: Parse Settlement Report TSV**
   - Purpose: parse TSV, validate headers, validate detail total against header total, validate tax net, categorize rows, and expose settlement-level accounting data.
   - Reads account IDs and behavior flags from `Build Runtime Config`.
   - Local code: `gravity-code/maps/02_parse_settlement_report_tsv.js`

10. **If: Parsed Settlement Is Createable**
    - If `canCreateJournalEntry = true`, continue.
    - If false, go to failure-memory/log branch, then continue loop.
    - No local code file.

11. **Map: Build NetSuite Journal Entry Payload**
   - Purpose: build NetSuite Journal Entry payload and verify debits equal credits.
   - Reads NetSuite defaults, currency mapping, and optional balancing account from `Build Runtime Config`.
   - Local code: `gravity-code/maps/03_build_journal_entry_payload.js`

12. **NetSuite Execute Custom Code: Search Existing Journal Entry**
    - Purpose: search NetSuite by external ID `amazon_settlement_{settlement-id}`.
    - Local code: `gravity-code/netsuite/01_search_existing_journal_entry.js`

13. **Memory/KV: Get Failure State**
    - Purpose: read key `amazon_settlement_failure_{settlement-id}`.
    - Needed so an existing Journal Entry can still go through CSV attachment retry if the previous run created the JE but failed attaching the file.
    - No local code file.

14. **If: Existing Journal Entry Decision**
    - If multiple matching JEs exist: failure branch, save failure state, email/log, continue loop.
    - If exactly one JE exists and no pending attachment failure exists: log skip, continue loop.
    - If exactly one JE exists and pending attachment failure exists: continue to CSV attachment retry.
    - If no JE exists: continue to create JE.
    - No local code file.

15. **NetSuite Execute Custom Code: Create Journal Entry**
    - Purpose: create the NetSuite Journal Entry.
    - Run only when no matching JE exists.
    - Local code: `gravity-code/netsuite/02_create_journal_entry.js`

16. **If: Journal Entry Created Or Existing Retry Target Available**
    - Continue only if there is a newly created JE or an existing JE from a pending attachment retry.
    - If missing, failure branch, save failure state, email/log, continue loop.
    - No local code file.

17. **NetSuite Execute Custom Code: Attach Settlement CSV**
   - Purpose: save the downloaded settlement report in NetSuite File Cabinet and attach it to the Journal Entry.
   - Reads File Cabinet folder ID from `Build Runtime Config`.
   - Local code: `gravity-code/netsuite/03_attach_settlement_csv.js`

18. **If: Attachment Succeeded**
    - If successful, clear or resolve failure state if one existed.
    - If failed, build failure memory payload, save failure state, email/log, continue loop.
    - No local code file.

19. **Map: Build Resolved Failure Memory Payload**
    - Purpose: build `status = resolved` payload when Gravity cannot delete a failure memory key directly.
    - Run only after a successful retry or successful full process when a prior failure key existed.
    - Local code: `gravity-code/maps/05_build_resolved_failure_memory_payload.js`

20. **Memory/KV: Clear Or Resolve Failure State**
    - Prefer deleting `amazon_settlement_failure_{settlement-id}` if available.
    - If delete is unavailable, set the same key with `status = resolved`.
    - No local code file.

21. **Flow Control: Log Settlement Success**
    - Log created, skipped, or attachment-retried result.
    - No local code file.

## Failure Branch Used Inside The Loop

Use this branch from any loop-level failure point that should skip only the current settlement and continue with the next report.

22. **Map: Build Failure Memory Payload**
    - Purpose: build retryable failure state.
    - Set or provide `failurePhase` according to the failed stage, for example:
      - `parse_report`
      - `build_je_payload`
      - `search_existing_je`
      - `create_je`
      - `attach_csv`
      - `multiple_existing_je`
    - Local code: `gravity-code/maps/04_build_failure_memory_payload.js`

23. **Memory/KV: Save Failure State**
    - Key: `amazon_settlement_failure_{settlement-id}`
    - Value: output from `Build Failure Memory Payload`
    - No local code file.

24. **Flow Control: Send Failure Email And Continue Loop**
    - Recipients:
      `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`
    - Behavior: continue loop.
    - No local code file.

## After The Loop

25. **Optional Memory: Update Checkpoint**
    - Update only after the full page/batch succeeds.
    - This checkpoint should not be treated as processed-settlement storage.
    - Do not let checkpointing prevent retrying failure states.
    - No local code file.

26. **Flow Control: Log Batch Summary**
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

- `TODO_TAX_ACCOUNT_ID` in `gravity-code/maps/00_build_runtime_config.js`, or pass `amazonSettlementTaxAccountId` as a workflow argument
- `netsuite.balancingAccountId` in `gravity-code/maps/00_build_runtime_config.js`, or pass `amazonSettlementBalancingAccountId` as a workflow argument, only if Lionel confirms a balancing account is required
- Sandbox File Cabinet folder ID `701790` in `gravity-code/maps/00_build_runtime_config.js`, or pass `amazonSettlementFileCabinetFolderId` as a workflow argument
- Placeholder Gravity step keys inside each code file after Cloudy creates the actual steps
