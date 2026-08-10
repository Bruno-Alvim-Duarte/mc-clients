# Cloudy Prompt - Amazon Settlement Reports to NetSuite Journal Entries

You are helping me build a Gravity workflow.

Workflow name:
Amazon Settlement Reports to NetSuite Journal Entries

Important: you do not have access to my local files, prior chats, Linear, or any local documentation. Use only the requirements in this prompt and any code snippets I paste into the Gravity step code editors.

## Goal

Create a daily scheduled Gravity workflow that:

1. Lists completed Amazon Seller settlement reports.
2. Downloads each new settlement report file.
3. Parses the tab-delimited settlement report.
4. Categorizes all settlement rows into NetSuite GL categories.
5. Searches NetSuite for an existing Journal Entry by settlement external ID.
6. Skips the settlement if the Journal Entry already exists, unless there is a pending attachment retry.
7. Creates one NetSuite Journal Entry per settlement ID when no matching Journal Entry exists.
8. Saves the settlement report file in NetSuite File Cabinet and attaches it to the Journal Entry.
9. Sends failure emails when an app step fails.
10. Stores only failed settlement attempts in Gravity memory or Key Value Storage. Do not store successfully processed settlements in memory.

## Connections

- Amazon Seller connection: `Amazon - Big Country Toys`
- NetSuite Advanced connection: `Lionel Trains`
- Use NetSuite sandbox during testing.

## Amazon Source Requirements

Use Amazon Seller action `List FBM Reports`.

Report type:
`GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`

Only process reports where:
`processingStatus = DONE`

Region:
America only

Marketplaces:
All marketplaces available in the existing Amazon connection.

Initial cutoff date:
`2026-07-01T00:00:00.000Z`

After listing reports, use each report's `reportDocumentId` with Amazon Seller action `Get FBM Report Document`.

That action returns a signed URL. Use an HTTP GET step against that signed URL to download the tab-delimited settlement report body.

## Settlement Report Headers

The downloaded file is tab-delimited and has these headers:

```text
settlement-id
settlement-start-date
settlement-end-date
deposit-date
total-amount
currency
transaction-type
order-id
merchant-order-id
adjustment-id
shipment-id
marketplace-name
amount-type
amount-description
amount
fulfillment-id
posted-date
posted-date-time
order-item-code
merchant-order-item-id
merchant-adjustment-item-id
sku
quantity-purchased
promotion-id
```

## NetSuite Journal Entry Defaults

Create one NetSuite Journal Entry per settlement ID.

Use these NetSuite defaults:

- Subsidiary: `4`
- Division custom segment field: `csegdivision`, value `4`
- Location ID: `32`
- Class ID: `38`
- Department ID: `34`
- Currency: USD, NetSuite internal ID `1`
- Memo: `Amazon Settlement {settlement-id}`
- Transaction date: Amazon `settlement-end-date`
- Posting period: NetSuite default
- Approval status: NetSuite default
- AR entity/customer: none
- Do not apply the Journal Entry against invoices. Only create the Journal Entry.

## Confirmed Accounts

| Category | Account # | NetSuite Internal ID |
| --- | ---: | ---: |
| Accounts Receivable | 1100 | 123 |
| Cash | 1095 | 1113 |
| Amazon Selling Fees | 8606 | 336 |
| Amazon Fulfillment Fees | 7716 | 434 |
| Amazon Storage Fee | 7736 | 523 |
| Refunds | 6425 | 260 |
| Department 300 | n/a | 34 |

Known pending IDs:

- Tax account: not needed. Tax rows must not be posted to the Journal Entry.
- Clearing/balancing account: not needed. Cash account `1113` acts as the clearing line by using the settlement header `total-amount`.
- Production File Cabinet folder ID: not confirmed yet. Sandbox folder ID is `701790`.

## Categorization Rules

Most important rule:
Do not ignore settlement rows unless the client explicitly approves that behavior.

Use compound categorization across:

- `transaction-type`
- `amount-type`
- `amount-description`

Do not rely on `amount-type` alone.

Debit/credit direction:

- For settlement detail rows, use the Amazon amount sign.
- Positive detail amounts become credits.
- Negative detail amounts become debits.
- The header `total-amount` is the bank deposit and is special: positive header total debits Cash, negative header total credits Cash.

Current mapping:

- Cash `1113`: header `total-amount` as the bank deposit.
- Accounts Receivable `123`: `Order / ItemPrice / Principal` and other non-tax order item price amounts.
- Tax: do not record tax rows in the Journal Entry. Validate tax only.
- Amazon Selling Fees `336`: selling fee rows, Amazon fee rows, fee corrections, reimbursements, and positive or negative catch-all leftovers if client approves catch-all.
- Amazon Fulfillment Fees `434`: fulfillment, per-unit fulfillment, customer return, removal order, inbound transportation, and similar fulfillment descriptions.
- Amazon Storage Fee `523`: inventory storage, AWD storage, AWD processing, AWD transportation, inbound placement, and similar storage descriptions.
- Refunds `260`: any `transaction-type` starting with `Refund`, including `Refund_Retrocharge`.
- Do not route settlement detail rows to Cash. Cash must only represent the settlement header payout/deposit.

Confirmed AR/Cash balancing rule:

- Principal invoice value is credited to Accounts Receivable `123`.
- Cash account `1113` is debited for the settlement payout/deposit from the header `total-amount`.
- Fee/refund/storage/fulfillment/reimbursement/catch-all lines use their mapped non-Cash accounts by sign.
- Do not add a separate clearing or balancing account. If the generated Journal Entry does not balance after tax is excluded and all non-tax rows are categorized, skip the settlement and alert.

Tax handling:

- The workflow must validate tax rows.
- Amazon tax and withheld tax should normally net to zero.
- Use a compound rule such as `amount-type = ItemPrice` plus `amount-description` containing `Tax`, paired against `ItemWithheldTax`.
- If tax and withheld tax do not net to zero, skip that settlement, save failure state, and send failure email.
- If tax nets to zero, omit tax rows from the Journal Entry.
- Do not silently omit tax rows without validating the tax net first.

Catch-all:

- Categorize all identifiable rows first.
- If catch-all is approved:
  - negative leftovers go to Amazon Selling Fees `336`
  - positive leftovers go to Amazon Selling Fees `336` as an offset
- Do not send positive leftovers to Cash because Cash is already the net settlement payout from the header.
- Client approval for catch-all is still pending.

## Idempotency And Memory

Use settlement ID as the canonical key.

Use NetSuite as the source of truth for successfully processed settlements:

- External ID format: `amazon_settlement_{settlement-id}`
- Search NetSuite by external ID before creating the Journal Entry.
- If exactly one matching Journal Entry exists, skip creation.
- If multiple matching Journal Entries are found, stop/skip that settlement and send a failure email.

Do not save successful settlements in Gravity memory.

Only save failure state in Gravity memory or Key Value Storage:

- Key: `amazon_settlement_failures`
- Value: an array of unresolved failed settlement objects.
- Each array item should include:
  - `status`
  - `failurePhase`
  - `errorMessage`
  - `settlementId`
  - `reportId`
  - `reportDocumentId`
  - `externalId`
  - `journalEntryId` if one exists
  - `tranId` if one exists
  - timestamp
- Before saving a new failure, get the current `amazon_settlement_failures` array, remove any existing item for the same `settlementId`, append the latest failure item, then set the whole array back to the same key.
- In the failure branch, run a fresh Memory/KV Get for `amazon_settlement_failures` immediately before `Build Failure Memory Payload`; do not rely only on the initial get from the start of the workflow, or failures added earlier in the same run can be overwritten.

If a Journal Entry was created but CSV attachment failed:

- Store the failure state with the created NetSuite Journal Entry ID.
- On a later run, detect the existing Journal Entry and retry only the CSV attachment.
- After successful retry, get the current `amazon_settlement_failures` array, remove the current settlement from the array, then set the whole array back to the same key.

## Logging And Failure Emails

Recipients:

```text
bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com
```

Add Step Completion Options for app steps only:

- Amazon Seller app steps
- HTTP GET step
- NetSuite Execute Custom Code steps
- Memory/KV steps if they are connector/app steps in this Gravity environment

Do not add app-step completion options to native map/if/loop steps unless needed for explicit flow control.

Failure behavior:

- For app failures outside the settlement loop, stop the workflow and email recipients.
- For app failures inside the settlement loop, continue the loop after logging/emailing and storing failure state.
- Failed settlement should not block the rest of the batch.

Log messages:

- Start app logs with `[Amazon]`, `[HTTP]`, `[NetSuite]`, or `[Memory]`.
- Do not include step numbers in log messages.
- Include settlement ID, report ID, report document ID, external ID, and NetSuite Journal Entry ID when available.

Email subject:

`Amazon Settlement Reports to NetSuite Journal Entries - Step Failed`

Email body should include:

- Workflow name
- Failed step name
- App name
- Failure behavior
- Error message using the real Gravity error variable for that step
- Settlement ID if available
- Report ID if available
- Report document ID if available
- External ID if available
- Journal Entry ID if available

Before saving log/email configuration, verify every `{{ ... }}` variable reference against the actual step keys and outputs. Do not leave placeholder variable references.

## Step Structure To Create

Please create this workflow structure. Use clear step names close to the names below. The exact generated step keys can differ, but after creating the steps, update the code snippets' `input.<stepKey>` references to the real keys.

1. Schedule Trigger
   - Daily cadence.

2. Map: `Build Runtime Config`
   - Use code snippet: `00_build_runtime_config.js`
   - This is the shared source for recipients, cutoff date, NetSuite defaults, account IDs, File Cabinet folder, memory key prefix, and behavior flags.
   - Later snippets should read this output through `input.mapBuildRuntimeConfig[0]`; replace `mapBuildRuntimeConfig` with the actual generated step key.

3. Amazon Seller: `List Completed Settlement Reports`
   - Action: `List FBM Reports`
   - report type: `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`
   - processing status: `DONE`
   - region: America

4. Memory/KV: `Get Failed Settlements`
   - Get key `amazon_settlement_failures`.
   - If the key does not exist, continue with an empty array.
   - This step must happen before the filter map so failed settlements can be retried even if Amazon's current list does not include them.

5. Map: `Filter Completed Settlement Reports`
   - Use code snippet: `01_filter_completed_settlement_reports.js`
   - Replace input step keys with the real runtime config and Amazon list step keys.
   - Also replace the Memory/KV get step key for `amazon_settlement_failures`.
   - This map merges completed Amazon reports with unresolved failed settlements from the array and dedupes them.
   - Output array path for loop: `reports`

6. Loop: `Loop Settlement Reports`
   - Iterate over the filtered `reports` array.

Inside the loop:

7. Amazon Seller: `Get Settlement Report Document`
   - Action: `Get FBM Report Document`
   - Input: current loop item's `reportDocumentId`

8. HTTP: `Download Settlement Report`
   - Method: GET
   - URL: signed URL from `Get Settlement Report Document`

9. Map: `Parse Settlement Report TSV`
   - Use code snippet: `02_parse_settlement_report_tsv.js`
   - Replace input step keys with the actual runtime config, loop, Amazon document, and HTTP download step keys.

10. Map: `Build Financial Event Group Search Request`
   - Use code snippet: `03_build_financial_event_group_search_request.js`
   - Replace input step keys with the actual runtime config and parse map keys.
   - This builds a window around the parsed `settlement-end-date` for the Amazon Financial Event Group lookup.

11. If: `Settlement Requires Currency Conversion`
   - Continue to `List Financial Event Groups` only when `requiresCurrencyConversion = true`.
   - If `requiresCurrencyConversion = false`, skip the Amazon Financial Event Group action and continue toward Journal Entry payload creation using the parsed settlement output directly.

12. Amazon Seller: `List Financial Event Groups`
   - Use the existing Gravity action that lists Financial Event Groups between two dates.
   - Input start/end date from `Build Financial Event Group Search Request`.
   - This action does not need a local code snippet.
   - Run only in the `requiresCurrencyConversion = true` branch.

13. Map: `Apply Settlement Currency Conversion`
   - Use code snippet: `04_apply_settlement_currency_conversion.js`
   - Replace input step keys with the actual runtime config, parse map, search request map, and Financial Event Group action keys.
   - For MXN settlements, match the Financial Event Group whose `fundTransferDate` equals the settlement `settlement-end-date`.
   - Calculate Amazon's exchange rate as `convertedTotal.currencyAmount / originalTotal.currencyAmount` and convert the settlement totals to USD.
   - If more than one group matches by date, use `originalTotal.currencyCode` and `originalTotal.currencyAmount` to disambiguate.
   - Run only in the `requiresCurrencyConversion = true` branch.

14. If: `Settlement Is Createable`
   - In the conversion branch, continue only when currency conversion map output `canCreateJournalEntry = true`.
   - In the no-conversion branch, continue only when parse map output `canCreateJournalEntry = true`.
   - If false, build failure memory payload, save failure state, send/log failure, and continue loop.

15. Map: `Build NetSuite Journal Entry Payload`
   - Use code snippet: `05_build_journal_entry_payload.js`
   - In the conversion branch, replace input step keys with the real runtime config and currency conversion map keys.
   - In the no-conversion branch, replace input step keys with the real runtime config and parse map keys.
   - This step should not add a clearing/balancing account. Cash `1113` is the clearing line from the settlement header total.
   - If the Journal Entry does not balance, send the settlement to the failure branch and continue the loop.

16. NetSuite Execute Custom Code: `Search Existing Journal Entry`
   - Use code snippet: `01_search_existing_journal_entry.js`
   - Replace input step key with the real payload map key.

17. If: `Existing Journal Entry Decision`
   - If multiple matches are found, save failure state, send/log failure, and continue loop.
   - If exactly one match exists and there is no pending attachment failure, log skip and continue loop.
   - If exactly one match exists and there is a pending attachment failure for this settlement, continue to attachment retry.
   - If no match exists, create the Journal Entry.

18. NetSuite Execute Custom Code: `Create Journal Entry`
   - Use code snippet: `02_create_journal_entry.js`
   - Replace input step key with the real payload map key.

19. NetSuite Execute Custom Code: `Attach Settlement CSV`
   - Use code snippet: `03_attach_settlement_csv.js`
   - Replace input step keys with the real runtime config, payload, create/search, and HTTP download step keys.

20. Map: `Build Resolved Failure Memory Payload`
   - Use code snippet: `07_build_resolved_failure_memory_payload.js`
   - Use only if there was a prior failure array item to resolve.
   - It returns the same shared key and a new array with the current settlement removed.
   - Replace input step keys with the real runtime config, payload, create, and attach step keys.

21. Memory/KV: `Save Updated Failure Array`
   - Key: `amazon_settlement_failures`
   - Value: the `value` array returned by `Build Resolved Failure Memory Payload`.

22. Flow Control: `Log Settlement Success`
   - Log created, skipped, or attachment retried.

After the loop:

23. Optional Memory: `Update Checkpoint`
   - If implemented, update only after the full page/batch succeeds.
   - Do not use this as processed-settlement memory.
   - Do not let checkpointing prevent retrying failures saved in memory.

24. Flow Control: `Log Batch Summary`
   - Include report count, processed count, skipped count, failure count if available.

## Code Snippets

I have local code snippets prepared for the map and NetSuite Execute Custom Code steps. Do not invent replacement code. When a step needs code, ask me to paste the corresponding snippet, then update only the `input.<stepKey>` references to the actual generated Gravity step keys.

Snippet mapping:

- Map `Build Runtime Config`: `00_build_runtime_config.js`
- Map `Filter Completed Settlement Reports`: `01_filter_completed_settlement_reports.js`
- Map `Parse Settlement Report TSV`: `02_parse_settlement_report_tsv.js`
- Map `Build Financial Event Group Search Request`: `03_build_financial_event_group_search_request.js`
- Map `Apply Settlement Currency Conversion`: `04_apply_settlement_currency_conversion.js`
- Map `Build NetSuite Journal Entry Payload`: `05_build_journal_entry_payload.js`
- Map `Build Failure Memory Payload`: `06_build_failure_memory_payload.js`
- Map `Build Resolved Failure Memory Payload`: `07_build_resolved_failure_memory_payload.js`
- NetSuite `Search Existing Journal Entry`: `01_search_existing_journal_entry.js`
- NetSuite `Create Journal Entry`: `02_create_journal_entry.js`
- NetSuite `Attach Settlement CSV`: `03_attach_settlement_csv.js`

## Important Open Items

Do not go live until these are resolved:

- Production NetSuite File Cabinet folder internal ID.
- Client approval for catch-all categorization.
- Final decision on category-only lines versus order-level line memo. Current build assumes category-level lines.

## Sample Validation Already Performed Locally

The local parser and payload builder were tested against a real sample settlement report.

Sample settlement:

- Settlement ID: `26590577301`
- Header total: `16311.96`
- Detail row total: `16311.96`
- Difference: `0`
- Tax positive amount: `2269.67`
- Tax negative amount: `-2269.67`
- Tax net: `0`
- Catch-all rows: `88`

The Journal Entry payload builder balanced after tax rows were validated and excluded from the Journal Entry:

- Tax recorded in Journal Entry: `false`
- Journal Entry line count: `8`
- Total debits: `30966.58`
- Total credits: `30966.58`
- Difference: `0`

This confirms the parsing and sign-based balancing strategy with Cash as the clearing line. Production still requires the production File Cabinet folder ID and client approval for catch-all behavior.

## Final Review Request

After creating or updating the workflow, review:

1. All app step failure behavior.
2. All email recipients and subjects.
3. Every `{{ ... }}` variable reference.
4. Every code snippet `input.<stepKey>` reference.
5. NetSuite account IDs, department/class/location/division IDs, and File Cabinet folder ID.
6. That successful settlements are not stored in memory.
7. That failed settlements are saved in memory/KV for retry.
8. That an existing NetSuite Journal Entry causes skip unless there is a pending CSV attachment retry.
9. That tax rows are validated for zero net and not posted to the Journal Entry.
