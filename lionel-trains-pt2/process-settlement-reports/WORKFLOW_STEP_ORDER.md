# Workflow Step Order

Workflow:
`Amazon Settlement Reports to NetSuite Journal Entries`

This is the idealized Gravity step order. Only map and NetSuite Execute Custom Code steps have local code files; app, loop, if, memory, and flow-control steps are included here to show the full workflow structure.

## Top-Level Steps

1. **Schedule Trigger**
   - Run daily.
   - No local code file.

2. **Map: Build Runtime Config**
   - Centralizes recipients, cutoff date, NetSuite defaults, account IDs, File Cabinet folder, environment-scoped memory key, and behavior flags.
   - Required workflow argument for KV isolation:
     `amazonSettlementFailureStoreName` or `amazonSettlementKvStoreName`.
   - Optional store-specific workflow argument for the NetSuite Journal Entry line **Name** field:
     `journalEntryLineEntityId` (NetSuite entity internal ID).
   - Required for FBA invoice application: `fbaInvoiceCustomerInternalId` (the NetSuite Customer internal ID used by FBA Invoice Sync). If omitted, the workflow falls back to `journalEntryLineEntityId` only when it is that same Customer ID.
   - The map converts that value to camelCase and exposes `memory.failureListKey` as:
     `{camelCaseStoreName}_amazon_settlement_failures`.
   - Local code: `gravity-code/maps/00_build_runtime_config.js`

3. **Amazon Seller: List Completed Settlement Reports**
   - App action: `List FBM Reports`
   - Report type: `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`
   - Processing status: `DONE`
   - Region: America
   - No local code file.

4. **Memory/KV: Get Failed Settlements**
   - Purpose: read the environment-scoped key from `Build Runtime Config.memory.failureListKey`.
   - This must run before filtering so unresolved failed settlements can be merged back into the loop input.
   - If the key does not exist yet, continue with an empty array.
   - No local code file.

5. **Map: Filter Completed Settlement Reports**
   - Purpose: filter/sort Amazon reports after cutoff date, merge unresolved failed settlements from the environment-scoped failure key, dedupe, and expose `reports` for the loop.
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
   - Purpose: parse TSV, validate headers, validate detail total against header total, validate tax net, categorize rows, and expose settlement-level accounting data. For an order, Accounts Receivable includes `Order` ItemPrice revenue plus linked `Order` / `Promotion` adjustments, so the per-order AR amount matches the FBA invoice's net total.
   - Reads account IDs and behavior flags from `Build Runtime Config`.
   - Local code: `gravity-code/maps/02_parse_settlement_report_tsv.js`

11. **Map: Build Financial Event Group Search Request**
   - Purpose: build a Financial Event Group search window around the parsed settlement `settlement-end-date`.
   - Default window: 3 days before through 3 days after the settlement end date.
   - Exposes `startDate`, `endDate`, `financialEventGroupStartDate`, `financialEventGroupEndDate`, and `requiresCurrencyConversion`.
   - Local code: `gravity-code/maps/03_build_financial_event_group_search_request.js`

12. **If: Settlement Requires Currency Conversion**
   - If `requiresCurrencyConversion = true`, run the Financial Event Group lookup and conversion branch.
   - If `requiresCurrencyConversion = false`, skip Amazon Financial Event Groups and continue directly to `Converted/Parsed Settlement Is Createable` using the parsed settlement output.
   - No local code file.

13. **Amazon Seller: List Financial Event Groups**
   - App action: existing Gravity action that lists Financial Event Groups between two dates.
   - Input start/end date: output from `Build Financial Event Group Search Request`.
   - Run only when `requiresCurrencyConversion = true`.
   - No local code file.

14. **Map: Apply Settlement Currency Conversion**
   - Purpose: for configured source currencies such as MXN, find the Financial Event Group whose `fundTransferDate` matches the settlement `settlement-end-date`, calculate Amazon's exchange rate as `convertedTotal.currencyAmount / originalTotal.currencyAmount`, and convert the settlement accounting totals to USD.
   - Preserve each FBA order's source AR amount as `originalArAmount` and its Amazon-converted USD AR amount as `arAmount`; the later invoice-payment step uses this pair to correct the FBA invoice before payment.
   - If more than one group has the same `fundTransferDate`, use `originalTotal.currencyCode` and `originalTotal.currencyAmount` to disambiguate.
   - Run only when `requiresCurrencyConversion = true`.
   - Reads runtime config, parsed settlement, Financial Event Group search request, and Amazon Financial Event Group list output.
   - Local code: `gravity-code/maps/04_apply_settlement_currency_conversion.js`

15. **If: Converted/Parsed Settlement Is Createable**
    - If `canCreateJournalEntry = true`, continue.
    - If false, go to failure-memory/log branch, then continue loop.
    - On the conversion branch, read `canCreateJournalEntry` from `Apply Settlement Currency Conversion`.
    - On the no-conversion branch, read `canCreateJournalEntry` from `Parse Settlement Report TSV`.
    - No local code file.

16. **Map: Build NetSuite Journal Entry Payload**
   - Purpose: build NetSuite Journal Entry payload and verify debits equal credits.
   - Reads NetSuite defaults and currency mapping from `Build Runtime Config`.
   - On the conversion branch, reads the converted settlement output from `Apply Settlement Currency Conversion`.
   - On the no-conversion branch, reads the parsed settlement output directly; this is valid only when the parsed currency is supported by NetSuite, currently USD.
   - Does not add a clearing/balancing account. Cash account `1113` is the clearing line through the settlement header `total-amount`.
   - When `journalEntryLineEntityId` is configured, adds it as `entity` to every Journal Entry line; NetSuite displays this field as **Name**.
   - Local code: `gravity-code/maps/05_build_journal_entry_payload.js`

17. **NetSuite Execute Custom Code: Search Existing Journal Entry**
    - Purpose: search NetSuite by external ID `amazon_settlement_{settlement-id}`.
    - Local code: `gravity-code/netsuite/01_search_existing_journal_entry.js`

18. **Memory/KV: Get Failure State**
    - Purpose: read the environment-scoped key from `Build Runtime Config.memory.failureListKey`.
    - Needed so an existing Journal Entry can still go through CSV attachment retry if the previous run created the JE but failed attaching the file.
    - The value is an array. A pending attachment failure exists when one array item has the current `settlementId` and enough context to retry attachment.
    - No local code file.

19. **If: Existing Journal Entry Decision**
    - If multiple matching JEs exist: failure branch, save failure state, email/log, continue loop.
    - If exactly one JE exists and no pending attachment failure exists: log skip, continue loop.
    - If exactly one JE exists and pending attachment failure exists: continue to CSV attachment retry.
    - If exactly one JE exists with a pending `apply_fba_invoices` failure: skip CSV attachment and retry FBA invoice application against that existing JE.
    - If no JE exists: continue to create JE.
    - No local code file.

20. **NetSuite Execute Custom Code: Create Journal Entry**
    - Purpose: create the NetSuite Journal Entry.
    - Run only when no matching JE exists.
    - Local code: `gravity-code/netsuite/02_create_journal_entry.js`

21. **If: Journal Entry Created Or Existing Retry Target Available**
    - Continue only if there is a newly created JE or an existing JE from a pending attachment retry.
    - If missing, failure branch, save failure state, email/log, continue loop.
    - No local code file.

22. **NetSuite Execute Custom Code: Attach Settlement CSV**
   - Purpose: save the downloaded settlement report in NetSuite File Cabinet and attach it to the Journal Entry.
   - Reads File Cabinet folder ID from `Build Runtime Config`.
   - Local code: `gravity-code/netsuite/03_attach_settlement_csv.js`

23. **If: Attachment Succeeded**
    - If successful, continue to FBA invoice application.
    - If failed, build failure memory payload, save failure state, email/log, continue loop.
    - No local code file.

24. **NetSuite Execute Custom Code: Apply FBA Invoices**
    - Purpose: find the open invoices created by FBA Invoice Sync and apply the settlement JE's AR credit through a zero-dollar Customer Payment.
    - Match invoices only by the FBA Invoice Sync's Amazon Order ID in `externalid`; this is the deterministic, unique key.
    - When `currencyConversion.required = true`, before creating the Customer Payment, scale the untouched FBA invoice's item rates and shipping cost by Amazon's actual settlement `exchangeRate`. The invoice's current total must equal the source `originalArAmount`; after scaling, it must equal the converted `arAmount` within the configured rounding tolerance.
    - Never convert an invoice that is already partially applied. A retry recognizes an invoice already at the converted USD amount and does not scale it a second time.
    - Apply only invoices whose complete open balance is covered by that order's settlement AR credit; fail rather than create a partial payment.
    - Use the store's `fbaInvoiceCustomerInternalId`, the same customer on the JE AR line.
    - The payment external ID is deterministic per settlement, so a retry does not create a duplicate payment.
    - Local code: `gravity-code/netsuite/04_apply_fba_invoices.js`

25. **If: FBA Invoice Application Succeeded**
    - If successful (including no matching open FBA invoice), clear or resolve failure state if one existed.
    - If failed, save failure state with `failurePhase = apply_fba_invoices`, email/log, and continue loop.
    - No local code file.

26. **Map: Build Resolved Failure Memory Payload**
    - Purpose: remove the current settlement from the environment-scoped failure array after a successful retry or successful full process.
    - Reads the current environment-scoped failure array from the Memory/KV get step and returns the same key with a filtered array value.
    - Local code: `gravity-code/maps/07_build_resolved_failure_memory_payload.js`

27. **Memory/KV: Save Updated Failure Array**
    - Key: output `key` from `Build Resolved Failure Memory Payload`.
    - Value: output `value` from `Build Resolved Failure Memory Payload`.
    - No local code file.

28. **Flow Control: Log Settlement Success**
    - Log created, skipped, attachment-retried, and FBA invoice application results.
    - No local code file.

## Failure Branch Used Inside The Loop

Use this branch from any loop-level failure point that should skip only the current settlement and continue with the next report.

29. **Memory/KV: Get Current Failure Array**
    - Key: `Build Runtime Config.memory.failureListKey`
    - Run immediately before building the failure payload so this branch does not overwrite failures added earlier in the same workflow run.
    - If the key does not exist, continue with an empty array.
    - No local code file.

30. **Map: Build Failure Memory Payload**
    - Purpose: add or replace the current settlement in the shared retryable failure array.
    - Reads the current environment-scoped failure array from `Get Current Failure Array` and returns the same key with the updated array value.
    - Set or provide `failurePhase` according to the failed stage, for example:
      - `parse_report`
      - `currency_conversion`
      - `build_je_payload`
      - `search_existing_je`
      - `create_je`
      - `attach_csv`
      - `apply_fba_invoices`
      - `multiple_existing_je`
    - Local code: `gravity-code/maps/06_build_failure_memory_payload.js`

31. **Memory/KV: Save Failure State**
    - Key: output `key` from `Build Failure Memory Payload`.
    - Value: output `value` from `Build Failure Memory Payload`
    - No local code file.

32. **Flow Control: Send Failure Email And Continue Loop**
    - Recipients:
      `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`
    - Behavior: continue loop.
    - No local code file.

## After The Loop

31. **Optional Memory: Update Checkpoint**
    - Update only after the full page/batch succeeds.
    - This checkpoint should not be treated as processed-settlement storage.
    - Do not let checkpointing prevent retrying failure states.
    - No local code file.

32. **Flow Control: Log Batch Summary**
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
| Map: Build Financial Event Group Search Request | `gravity-code/maps/03_build_financial_event_group_search_request.js` |
| Map: Apply Settlement Currency Conversion | `gravity-code/maps/04_apply_settlement_currency_conversion.js` |
| Map: Build NetSuite Journal Entry Payload | `gravity-code/maps/05_build_journal_entry_payload.js` |
| Map: Build Failure Memory Payload | `gravity-code/maps/06_build_failure_memory_payload.js` |
| Map: Build Resolved Failure Memory Payload | `gravity-code/maps/07_build_resolved_failure_memory_payload.js` |
| NetSuite: Search Existing Journal Entry | `gravity-code/netsuite/01_search_existing_journal_entry.js` |
| NetSuite: Create Journal Entry | `gravity-code/netsuite/02_create_journal_entry.js` |
| NetSuite: Attach Settlement CSV | `gravity-code/netsuite/03_attach_settlement_csv.js` |
| NetSuite: Apply FBA Invoices | `gravity-code/netsuite/04_apply_fba_invoices.js` |

## Values To Replace Before Go-Live

- Do not add `amazonSettlementTaxAccountId`; tax rows are not posted individually. Non-zero tax net variances route to fee account `8606` / NetSuite internal ID `336`, Department `300` / NetSuite internal ID `34`.
- Do not add `amazonSettlementBalancingAccountId`; Cash account `1113` is the clearing line.
- Pass `fbaInvoiceCustomerInternalId` for each store. It must be the Customer used on both the FBA invoices and the Journal Entry's AR line; `journalEntryLineEntityId` can be used as the fallback when it is the same ID.
- Sandbox File Cabinet folder ID `701790` in `gravity-code/maps/00_build_runtime_config.js`, or pass `amazonSettlementFileCabinetFolderId` as a workflow argument
- Placeholder Gravity step keys inside each code file after Cloudy creates the actual steps
