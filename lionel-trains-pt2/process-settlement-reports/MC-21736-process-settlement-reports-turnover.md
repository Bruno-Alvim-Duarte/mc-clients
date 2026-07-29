# MC-21736 - Amazon to NetSuite Process Settlement Reports Turnover

## Turnover Readiness

Status: Build-ready for sandbox; production still needs File Cabinet folder and catch-all approval

Summary:
This integration should retrieve Amazon settlement reports on a daily schedule and create one NetSuite Journal Entry per settlement ID. Most operational decisions are now confirmed: report type, marketplace/region scope, completed-report filter, settlement ID idempotency, category-level aggregation, NetSuite defaults, checkpoint behavior, error recipients, sandbox testing, tax handling, and AR/Cash balancing. Tax rows are validation-only and are not posted when tax nets to zero. Cash account `1113` acts as the clearing line through the settlement header `total-amount`; no separate clearing/balancing account is needed.

## Confirmed Understanding

- Source system: Amazon Seller / Amazon FBA settlement reports
- Destination system: NetSuite
- Source record: Amazon settlement report
- Destination record: NetSuite Journal Entry
- Direction: Amazon to NetSuite
- Trigger/cadence: daily scheduled check for new settlement reports
- Amazon report type: `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`
- Amazon report doc: <https://developer-docs.amazon.com/sp-api/docs/report-type-values-settlement>
- Source region: America only
- Marketplaces: all marketplaces available in the existing Gravity Amazon connection
- Amazon account/connection: already connected in Gravity; no additional account discovery needed
- Report status/filter: completed reports only
- New-report key: settlement ID
- Journal Entry grouping: one NetSuite Journal Entry per settlement ID
- Journal Entry line granularity: category only
- Journal Entry posting date: settlement end date
- Incremental checkpoint: settlement end date
- Backfill/testing scope: a few days before go-live, only to have records available for testing
- Duplicate-prevention key: settlement ID
- Existing Journal Entry behavior: skip it
- NetSuite defaults:
  - Subsidiary: `4`
  - Division: `4`
  - Location ID: `32`
  - Class: `38`
  - Memo: `Amazon Settlement {id}`
- Failure and mismatch email recipients: `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`
- Sensitive field restriction: no special restriction confirmed
- Sandbox testing: yes
- Approval owners: Ari and Jeff
- Expected volume: not high enough to require special handling for now
- Sample report file: `lionel-trains-pt2/process-settlement-reports/f3046412-eb05-4311-a3ad-c560828360fc.amzn1.tortuga.4.na.txt`

## Planned Gravity Report Retrieval

1. Use the Amazon Seller app step `List FBM Reports` to list available reports.
2. Filter to completed reports for the America region and report type `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`.
3. Use the Amazon Seller app step `Get FBM Report Document` with the `reportDocumentId` returned by the list step.
4. Read the document URL returned in the payload.
5. Use an HTTP app step to `GET` that URL and retrieve the tab-delimited settlement report file.
6. Parse the flat file and group rows by `settlement-id`.
7. Aggregate rows by the approved category mapping and create one balanced NetSuite Journal Entry per settlement ID.

## Blocking Questions

### Amazon Report Selection

1. Which exact Amazon settlement report type should be used?

   Answer: Use `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`.

   Why it matters: Amazon has multiple settlement/report formats, and the parser depends on the selected report type.

   Implementation impact: The workflow will parse a tab-delimited V2 settlement report with fields such as `settlement-id`, `settlement-end-date`, `amount-type`, `amount-description`, and `amount`.

2. Which Amazon accounts, marketplaces, or regions should be included?

   Answer: Use all marketplaces available in the existing Gravity Amazon connection. Region is America only. The Amazon account is already connected in Gravity.

   Why it matters: Currency, subsidiary, and settlement data may differ by marketplace.

   Implementation impact: No additional Amazon account discovery is needed; the list report step should use the existing connected account and America region scope.

3. What qualifies as a "new" settlement report: report ID, settlement ID, posted date, settlement end date, generated date, or another value?

   Answer: Settlement ID.

   Why it matters: This controls duplicate prevention and checkpointing.

   Implementation impact: Store/process settlement IDs as the stable record key.

4. Should the workflow process only completed/available settlement reports, or should pending/in-progress reports also be considered?

   Answer: Completed reports only.

   Why it matters: Incomplete reports may change after the workflow reads them.

   Implementation impact: Filter the report list to completed reports before attempting to download or process the document.

### NetSuite Journal Entry Mapping

5. What NetSuite account should be used for each settlement amount category: orders/principal, order fees, refunds, other fees, and settlement payout/balancing line?

   Answer: Confirmed in the current build prompt/turnover review. Accounts Receivable is `123`, Cash is `1113`, Amazon Selling Fees is `336`, Amazon Fulfillment Fees is `434`, Amazon Storage Fee is `523`, Refunds is `260`, and Department 300 is `34`.

   Client question: Resolved. No separate settlement clearing account is required.

   Why it matters: Journal Entries must balance and follow Lionel's accounting policy.

   Implementation impact: Journal Entry construction can proceed in sandbox using confirmed accounts. Cash acts as the clearing line.

6. For each settlement amount type, should the line be debit or credit?

   Answer: Preserve Amazon signs for detail rows: positive detail amounts become credits, negative detail amounts become debits. The header `total-amount` is the Cash line: positive header total debits Cash, negative header total credits Cash. Principal invoice value credits Accounts Receivable; Cash debits the net payout; fee/refund lines balance the entry by sign.

   Why it matters: Amazon values may already include negative signs, and the workflow needs a confirmed accounting rule instead of inferring signs.

   Implementation impact: Debit/credit direction and NetSuite account IDs are confirmed for sandbox.

7. Should Journal Entry lines be aggregated by category only, or should they preserve more detail from the Amazon settlement report?

   Answer: Category only.

   Why it matters: The ticket lists high-level categories, but not the required line granularity.

   Implementation impact: The workflow should summarize settlement rows into category-level Journal Entry lines.

8. What NetSuite header values should be set on the Journal Entry: subsidiary, currency, posting date, posting period, approval status, memo, department, class, and location?

   Answer:
   - Subsidiary: `4`
   - Division: `4`
   - Location ID: `32`
   - Class: `38`
   - Memo: `Amazon Settlement {id}`
   - Posting date: settlement end date

   Why it matters: These are commonly required for NetSuite Journal Entries.

   Implementation impact: These defaults can be set in the NetSuite create payload. Posting period and approval status are not explicitly confirmed, so use NetSuite defaults unless the client requires otherwise.

9. Which date from Amazon should drive the NetSuite posting date: settlement start date, settlement end date, deposit date, generated date, or another value?

   Answer: Settlement end date.

   Why it matters: Posting date affects the accounting period.

   Implementation impact: Use `settlement-end-date` as the NetSuite Journal Entry transaction date.

### Idempotency And Existing Records

10. Which value should be stored on the NetSuite Journal Entry to identify the Amazon settlement: settlement ID, report ID, payout ID, or another stable identifier?

    Answer: Settlement ID.

    Why it matters: Scheduled polling can encounter the same settlement report more than once.

    Implementation impact: Search NetSuite by settlement ID before create. Store the settlement ID in a stable field such as external ID or a custom body field.

11. If a matching Journal Entry already exists, should Gravity skip it, update it, or fail for review?

    Answer: Skip it.

    Why it matters: Reprocessed settlement reports need a clear business rule.

    Implementation impact: This is a create-only workflow after the duplicate check.

12. If multiple matching Journal Entries are found for the same settlement identifier, should the workflow stop, skip, or notify a human?

    Answer: Not explicitly confirmed.

    Recommended assumption: Stop processing that settlement, do not create a new Journal Entry, and send a failure email with the duplicate settlement ID and matching NetSuite record IDs.

    Why it matters: Multiple matches indicate a duplicate or data quality issue.

    Implementation impact: Add a safety branch after the NetSuite lookup.

### Backfill And Checkpoints

13. Should the workflow process only reports found after go-live, or should historical settlement reports be backfilled?

    Answer: Process a few days before go-live only, enough to have data for testing.

    Why it matters: Backfills often need a separate date range, validation process, and volume controls.

    Implementation impact: Initialize the workflow with a limited pre-go-live cutoff date instead of processing all history.

14. Which field should be used as the checkpoint: report generated date, settlement end date, deposit date, report ID, Amazon cursor, or another stable value?

    Answer: Settlement end date.

    Why it matters: The checkpoint must allow the workflow to resume safely without skipping or duplicating reports.

    Implementation impact: Store the latest successfully processed `settlement-end-date` in Gravity memory.

15. When should the checkpoint be advanced: after each successful Journal Entry, after each page of Amazon reports, or only after the full run succeeds?

    Answer: After the page of Amazon reports, which in this workflow is effectively after the full run succeeds.

    Why it matters: Partial failures can otherwise cause missed reports or duplicate processing.

    Implementation impact: Update the checkpoint only after the page/batch has completed successfully.

### Error Handling And Notifications

16. Who should receive failure emails?

    Answer: `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`

    Why it matters: The ticket says to send error emails but does not name recipients.

    Implementation impact: Configure Gravity flow control with email enabled for these recipients.

17. Should one bad settlement report stop the whole workflow, or should Gravity log the failed report and continue processing the rest?

    Answer: If the failure happens inside the settlement loop, log/email the failed record and continue to the next record.

    Why it matters: A daily batch may contain multiple reports, and one bad report should have a defined effect on the run.

    Implementation impact: Use record-level failure handling inside the loop so one bad settlement does not block all other settlements.

18. What identifiers should be included in failure emails and logs?

    Answer: It depends on the failed step. Include as much context as the step used or produced.

    Why it matters: Operations needs enough context to identify the failed settlement and NetSuite record attempt.

    Implementation impact: At minimum, include settlement ID, report ID/report document ID when available, marketplace, settlement end date, failed step name, NetSuite response if applicable, and amount/category context when available.

## Follow-Up Questions

### Testing And Validation

1. Can the client provide one or more sample Amazon settlement reports and the expected NetSuite Journal Entry result?

   Answer: Sample settlement report is available at `lionel-trains-pt2/process-settlement-reports/f3046412-eb05-4311-a3ad-c560828360fc.amzn1.tortuga.4.na.txt`. The expected NetSuite Journal Entry output still depends on the final account mapping.

   Why it matters: This is the fastest way to validate grouping, account mapping, and debit/credit signs.

2. Can test Journal Entries be created in a NetSuite sandbox?

   Answer: Yes.

   Why it matters: Journal Entry validation needs real NetSuite required fields and accounting rules.

3. Who must approve the final mapping and test Journal Entry output before go-live?

   Answer: Ari and Jeff.

   Why it matters: Accounting approval should happen before production processing.

4. Are any Amazon report fields sensitive and excluded from logs or failure emails?

   Answer: No.

   Why it matters: Prevents exposing sensitive financial or customer data in operational emails.

### Volume And Schedule

5. Is daily processing sufficient, or is there a preferred time of day and timezone for the scheduled run?

   Answer: Daily is good.

   Why it matters: Settlement reports may become available after a specific Amazon processing window.

6. What is the expected number of settlement reports per day and peak backfill volume?

   Answer: Unknown, but expected volume is low enough that no special handling is needed for now.

   Why it matters: Volume determines pagination, batch limits, and timeout safeguards.

## Remaining Client Questions

1. Production NetSuite File Cabinet folder internal ID.

2. Client approval for catch-all categorization: negative uncategorized leftovers to Amazon Selling Fees and positive uncategorized leftovers to Amazon Selling Fees as offsets.

3. If multiple NetSuite Journal Entries are found for the same settlement ID, should the workflow stop and alert? Recommended answer: yes, stop that settlement and send an email.

## Suggested Assumptions To Confirm

- Create one NetSuite Journal Entry per Amazon settlement ID.
- Use a daily scheduled Gravity workflow.
- Process only completed settlement reports.
- Use all marketplaces available in the existing America-region Amazon connection.
- Use settlement ID for duplicate prevention.
- Store settlement ID on the NetSuite Journal Entry external ID or a custom body field.
- Skip settlements when a matching Journal Entry already exists.
- Aggregate Journal Entry lines by category only.
- Use `settlement-end-date` as both the NetSuite posting date and the Gravity checkpoint.
- Update the checkpoint after the full report page/batch succeeds.
- Use a few pre-go-live days only for test data, not a full historical backfill.
- Use Gravity flow control with email enabled for failure notifications.
- If a settlement fails inside the processing loop, log/email that settlement and continue with the next one.
- Failure emails should include the failed step plus all available settlement/report/NetSuite identifiers.

## Build-Readiness Checklist

- [x] Amazon settlement report type confirmed
- [x] Amazon account/marketplace/region filters confirmed
- [x] Source report status/date filters confirmed
- [ ] NetSuite Journal Entry account mapping approved
- [ ] Clearing account confirmed
- [x] Debit/credit direction partially confirmed
- [x] Journal Entry line aggregation/detail level confirmed
- [x] NetSuite Journal Entry header defaults confirmed
- [x] Posting date rule confirmed
- [x] Idempotency/matching key confirmed
- [x] Existing Journal Entry behavior confirmed
- [x] Pagination/checkpoint strategy confirmed
- [x] Limited test backfill scope confirmed
- [x] Error recipients confirmed
- [x] Batch failure and retry behavior confirmed
- [x] Sample settlement report received
- [x] NetSuite sandbox testing and approval owner confirmed
