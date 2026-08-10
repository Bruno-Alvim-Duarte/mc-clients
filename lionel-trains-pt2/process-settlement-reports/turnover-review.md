# Amazon Settlement to NetSuite Journal Entry - Turnover Review

## Turnover Readiness

Status: Mostly ready, but not build-ready until the remaining accounting edge cases and production NetSuite attachment details are confirmed.

Summary:
The integration shape is clear: a daily scheduled Gravity workflow will poll Amazon Seller for completed settlement reports, download each new settlement CSV, aggregate the report into accountant-defined GL categories, and create one NetSuite Journal Entry per settlement report with the CSV attached. The older planning doc confirms several operational defaults that were missing here, including NetSuite subsidiary/division/location/class, settlement ID idempotency, settlement-end-date checkpointing, existing Journal Entry skip behavior, sandbox testing, and failure email recipients. The requirements buddy call clarified that no settlement row should be ignored, debit/credit direction should follow the amount sign, and categorization must use a compound rule across `transaction-type`, `amount-type`, and `amount-description`. Successful settlements should not be stored in Gravity memory; NetSuite duplicate lookup by settlement ID is the source of truth for already-created Journal Entries. Gravity memory or Key Value Storage should only hold failed settlement attempts so later runs can retry. The remaining open decisions are the production File Cabinet folder and final client approval of catch-all categorization rules.

## Confirmed Understanding

- Source system: Amazon Seller Partner API, connection `Amazon - Big Country Toys`
- Destination system: NetSuite Advanced, connection `Lionel Trains` sandbox for testing
- Source record: Amazon settlement report `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`
- Destination record: NetSuite Journal Entry
- Direction: Amazon to NetSuite
- Trigger/cadence: daily scheduled polling
- Source region: America only
- Marketplaces: all marketplaces available in the existing Gravity Amazon connection
- Incremental/backfill scope: daily incremental plus a limited pre-go-live backfill window for testing only
- One Journal Entry should be created per new settlement report
- The settlement CSV should be attached to the Journal Entry
- Department should be set to internal ID `34` on every Journal Entry line
- New-report key: CSV `settlement-id`
- Duplicate-prevention key: settlement ID
- Existing Journal Entry behavior: skip the settlement if a matching Journal Entry already exists
- Processed-settlement state: do not store successful settlements in Gravity memory
- Success source of truth: NetSuite lookup by settlement ID, preferably via `externalId` or a custom body field
- Failure state: store unresolved failed settlement attempts in one Gravity memory or Key Value Storage array under an environment-scoped key, `{camelCaseStoreName}_amazon_settlement_failures`, so a later run can retry with context without crossing workflow environments.
- Journal Entry grouping: one Journal Entry per settlement ID
- Journal Entry line granularity: category only
- No settlement row should be ignored unless the client explicitly approves that behavior
- Categorization should use `transaction-type`, `amount-type`, and `amount-description`, not `amount-type` alone
- Debit/credit direction should follow the sign of the Amazon amount
- Journal Entry posting date: settlement end date
- Incremental checkpoint: settlement end date
- Checkpoint update timing: after the full report page or batch succeeds
- Expected volume: low enough that no special handling is expected for now
- Sandbox testing: approved
- Approval owners: Ari and Jeff
- Sensitive field restriction: none confirmed
- Sample report file: `lionel-trains-pt2/process-settlement-reports/f3046412-eb05-4311-a3ad-c560828360fc.amzn1.tortuga.4.na.txt`

## Confirmed NetSuite Defaults

- Subsidiary: `4`
- Division: `4`
- Location ID: `32`
- Class: `38`
- Department: `34`
- Memo: `Amazon Settlement {id}`
- Posting date: Amazon `settlement-end-date`
- Posting period: use NetSuite default unless the client requires explicit period setting
- Approval status: use NetSuite default unless the client requires explicit approval handling

## Confirmed Source Actions

- Use Amazon Seller action `List FBM Reports`.
- Pass report type `GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2`.
- Read completed reports with `processingStatus = DONE`.
- Scope to the America region and all marketplaces available in the existing Gravity Amazon connection.
- Use each report's `reportDocumentId`.
- Pass `reportDocumentId` to Amazon Seller action `Get FBM Report Document`.
- The action returns a signed download URL.
- Use an HTTP app step to `GET` the signed URL and retrieve the report file.
- The CSV is tab-delimited.
- Parse the flat file and group rows by `settlement-id`.
- Aggregate rows by the approved category mapping.
- Create one balanced NetSuite Journal Entry per settlement ID.

## Confirmed CSV Header

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

## Sample Report Snapshot

Sample file:
`lionel-trains-pt2/process-settlement-reports/f3046412-eb05-4311-a3ad-c560828360fc.amzn1.tortuga.4.na.txt`

- Line count: 4,285 lines, including the header row
- Settlement ID: `26590577301`
- Settlement start date: `2026-05-29 20:02:19 UTC`
- Settlement end date: `2026-06-12 20:02:19 UTC`
- Deposit date: `2026-06-14 20:02:19 UTC`
- Total amount: `16311.96`
- Currency: `USD`
- Observed transaction types: `Order`, `Refund`, `other-transaction`, `FBAFees`, `Refund_Retrocharge`
- Observed amount types include: `ItemPrice`, `ItemFees`, `ItemWithheldTax`, `Promotion`, `other-transaction`, `FBA Inventory Reimbursement`, `AWD Storage Fee`, `AWD Processing Fee`, `AWD Transportation Fee`, and one long FBA customer returns fee description

## Confirmed GL Accounts

| Category | Account # | NetSuite Internal ID | NetSuite Display Name |
| --- | ---: | ---: | --- |
| Accounts Receivable | 1100 | 123 | 1100 Accounts Receivable |
| Cash | 1095 | 1113 | 1095 East West Bank - Receivables |
| Amazon Selling Fees | 8606 | 336 | 8606 Outside Office Service |
| Amazon Fulfillment Fees | 7716 | 434 | 7716 COS-Other Misc |
| Amazon Storage Fee | 7736 | 523 | 7736 Storage Cost Tooling |
| Refunds | 6425 | 260 | 6425 Other Credit Memos |
| Department 300 | n/a | 34 | 300 |

## Confirmed Category Mapping

- Cash `1095`: net deposit total from the report header row `total-amount`, with debit/credit direction based on the amount sign.
- Credit Accounts Receivable `1100`: `Order / ItemPrice / Principal` amounts. Tax should not be mixed into principal and should not be posted to the Journal Entry.
- Debit Amazon Selling Fees `8606`: `Order / ItemFees`, fee corrections, Amazon fees such as deal performance or participation fees, reimbursements, and positive or negative uncategorized or leftover amounts if the catch-all rule is approved by Lionel.
- Debit Amazon Fulfillment Fees `7716`: `FBAFees` such as FBA per-unit fulfillment fees, customer return per-unit fees, removal order fees, and `other-transaction / Inbound Transportation Fee`.
- Debit Amazon Storage Fee `7736`: `FBAFees` such as inventory storage fees, `AWD Storage Fee`, inbound placement service fees, and AWD storage, processing, or transportation fees.
- Debit Refunds `6425`: any `transaction-type` that starts with `Refund`, including refund item prices, refund fees, and `Refund_Retrocharge`.
- No settlement detail rows should route to Cash. Cash `1095` should only be the net deposit total from the report header.
- All lines should carry Department `300`, NetSuite internal ID `34`.

## Requirements Buddy Call Notes

- The settlement `total-amount` is the amount that arrived in Lionel's bank account, so every settlement row must be accounted for or explicitly validated away.
- The sample report total `16311.96` matches the sum of the report lines, which confirms the parser should reconcile row totals back to the header total.
- `Order / ItemPrice / Principal` should map to Accounts Receivable because invoices already exist for the sales; the Journal Entry lets accounting clear or reconcile the amount rather than count revenue twice.
- Amazon tax lines need special handling. Amazon records tax collected and then records withheld tax because Amazon handles the tax. These should normally net to zero.
- Tax should be validated with a compound key such as `amount-type = ItemPrice` plus `amount-description = Tax`, paired against related `ItemWithheldTax`. If tax and withheld tax do not net to zero, the workflow should skip that settlement, save failure state, and alert.
- Refunds are category-simple: anything with `transaction-type` beginning with `Refund` should go to the Refunds category. Negative refunds should post normally, and positive refund corrections should also remain in Refunds.
- Storage fees are rare but should be identified by descriptions such as storage, inbound placement, and AWD storage/processing/transportation.
- Fulfillment fees should be identified by descriptions such as fulfillment, shipping, per-unit fulfillment, customer return fulfillment fees, and removal order fees.
- FBA Inventory Reimbursement was discussed as money returned by Amazon. Current confirmed implementation treats reimbursement-like positive amounts as Amazon Selling Fees offsets so the Cash account remains equal to the settlement header payout.
- Catch-all guidance after AR/Cash confirmation: categorize everything that can be identified; if a leftover amount is negative, route it to Amazon Selling Fees; if a leftover amount is positive, route it to Amazon Selling Fees as an offset. Do not route detail leftovers to Cash because Cash is already the settlement header payout.
- A separate clearing or balancing account is not needed. Cash account `1095` / internal ID `1113` acts as the clearing line through the settlement header `total-amount`: principal credits Accounts Receivable, cash debits the net payout, and fee/refund lines balance the entry.

## Blocking Questions

### NetSuite Journal Entry Posting

1. Does the Accounts Receivable line require a NetSuite customer or entity? If yes, which customer or entity internal ID should be used?
   Why it matters: NetSuite Accounts Receivable journal lines often require an entity, and applying a Journal Entry against open invoices usually depends on the entity.
   Implementation impact: Without this, the Journal Entry may not save or may not be applicable to invoices.

   A: No it doesn't.

2. Should the workflow only create the Journal Entry, or should it also apply the Accounts Receivable credit against open invoices?
   Why it matters: "So it can be applied against open invoices" could mean manual application later or automated application now.
   Implementation impact: Automated application would require additional NetSuite SuiteScript logic beyond Journal Entry creation.

   A: Only create the Journal Entry.

3. Should posting period and approval status use NetSuite defaults, or should the workflow set them explicitly?
   Why it matters: The older planning doc says to use NetSuite defaults unless the client requires otherwise, but this should be confirmed before production posting.
   Implementation impact: Explicit posting period or approval handling requires additional payload fields or SuiteScript logic.

   A: Use NetSuite defaults.

4. Which clearing or balancing account should be used if the Journal Entry needs a counter line to net to zero?
   Why it matters: The call raised that the category mappings explain where amounts belong, but the Journal Entry may still need a clearing account concept similar to Lionel's Shopify payout reconciliation workflow.
   Implementation impact: This may require adding an additional clearing line or changing the cash/AR balancing logic so the Journal Entry posts cleanly.

   A: None. Lionel confirmed no separate clearing/balancing account is needed. Cash `1095` / internal ID `1113` is the clearing line using the settlement header `total-amount`.

### Amount Logic

5. Please confirm the sign handling: should all category totals be converted into positive debit or credit amounts based on the mapping, or should Amazon signs be preserved?
   Why it matters: Settlement rows often contain negative fees and refunds. Wrong sign logic can invert the Journal Entry.
   Implementation impact: This controls the aggregation code and balance calculation.

   A: Requirements buddy guidance is to let the sign drive debit/credit. Negative amounts should post as debits to the relevant category; positive amounts should post as credits or positive reversals for that same category, depending on the category/account behavior.

6. How should Amazon tax lines be handled after validating that `ItemPrice / Tax` and related `ItemWithheldTax` net to zero?
   Why it matters: Amazon records tax and withheld tax because Amazon handles tax collection/remittance. These lines should normally cancel each other out, but ignoring them without validation can hide settlement mismatches.
   Implementation impact: The workflow should use compound classification and validate tax nets to zero. If not zero, it should skip the settlement, save failure state, and alert. If zero, tax rows should be omitted from the Journal Entry.

   A: Confirmed by Lionel. Do not record tax. Validate that tax nets to zero; if not, skip the settlement and alert.

7. What should happen if `total-amount` is negative, zero, or not equal to the final net settlement after aggregation?
   Why it matters: Some settlements may be reversals, reserves, or adjustments.
   Implementation impact: This determines whether Cash is debit or credit and whether the workflow fails or posts a balancing line.

   A: Total amount comes from Amazon so we don't have to worry about it.

8. Should Lionel approve the catch-all rule from the requirements buddy call?
   Why it matters: This changes whether unknown Amazon rows are posted automatically or held for review.
   Implementation impact: Current rule is to categorize everything identifiable first, then route negative leftovers to Amazon Selling Fees and positive leftovers to Amazon Selling Fees as offsets. This keeps Cash equal to the settlement header payout.

   A: Use Amazon Selling Fees for both negative leftovers and positive leftover offsets. Lionel approval is still needed.

### Duplicate Protection

9. If multiple matching NetSuite Journal Entries are found for the same settlement ID, should the workflow stop that settlement and send a failure email?
   Why it matters: Multiple matches indicate an existing duplicate or data quality issue.
   Implementation impact: Recommended behavior is to stop processing that settlement, avoid creating another Journal Entry, and include the matching NetSuite record IDs in the failure log/email.

   A: If the workflow finds one existing journal entry with the same settlement ID it should skip. So we would never have more than one journal entry per settlement ID.

### CSV Attachment

10. Which NetSuite File Cabinet folder should store the downloaded settlement CSV?
    Why it matters: SuiteScript upload and attach logic needs a folder internal ID.
    Implementation impact: This blocks the file creation and attachment script.

    A: Internal ID: 701790. OBS: THIS IS A SANDBOX FOLDER. when we pass to production we want to remember to create one in production and use that instead.

11. If the Journal Entry is created but CSV attachment fails, how should the workflow retry?
    Why it matters: This prevents created but incomplete records from being silently skipped.
    Implementation impact: Do not mark successful settlements in memory. If attachment fails, save failure context in the environment-scoped failure array, including settlement ID, report ID, report document ID, failure phase, error message, and the NetSuite Journal Entry ID if one was created. On the next run, the workflow should detect the existing Journal Entry in NetSuite and, if there is an unresolved attachment failure array item for that settlement, retry only the CSV attachment instead of creating a new Journal Entry or skipping completely. After a successful retry, remove that settlement from the array and set the updated array back to the same environment-scoped key.

    A: Save to memory only on failure so the workflow can retry later. Do not save processed settlements in memory.


### Backfill And Source Filtering

12. What exact pre-go-live cutoff date should be used for the limited testing backfill?
    Why it matters: The older planning doc says "a few days before go-live," but the workflow needs a concrete date.
    Implementation impact: This determines memory initialization and the first production query.

    A: July 1st, 2026.

13. Should the workflow process every unprocessed report returned across all pages using `nextToken`, or cap each daily run to a maximum number of reports?
    Why it matters: This prevents timeouts if many historical reports are available.
    Implementation impact: This defines pagination and loop limits.

    A: No

### Error Handling

14. Linear and the older turnover say to send failure emails to `bruno@mindcloud.co`, `AMiller@lionel.com`, and `jjones@lionel.com`, but the newer plan says email alerting is deferred. Should this build send failure emails or only rely on Gravity run history?
    Why it matters: These are conflicting requirements.
    Implementation impact: If emails are enabled, we need recipients and step-level failure email templates.

    A: Yes. Send failure emails to bruno@mindcloud.co, AMiller@lionel.com, and jjones@lionel.com.

## Follow-Up Questions

### NetSuite Defaults

1. Should the Journal Entry `currency` always come from the Amazon CSV `currency` field?
   Why it matters: The current sample is USD, but marketplace scope may include records that need currency validation.
   
   A: It will always be USD

2. Should the line memo include the category name only, or should it include settlement ID and category?
   Why it matters: A consistent line memo helps reconciliation and duplicate review.

   A: The line should include the category and the order id.

3. The workflow is currently planned as category-level aggregation, but an earlier answer says the line memo should include order ID. Should Journal Entry lines remain category-only, or should the workflow create more granular lines by order/category so an order ID can appear on the line memo?
   Why it matters: A single category-level line can include many orders, so it cannot accurately include one order ID.

### Testing

1. Can we create test Journal Entries and file attachments in the NetSuite sandbox using a real settlement sample?
   Answer from older planning: Yes.
   Why it matters: This confirms that the connection, accounts, segments, entity requirements, and file attachment logic work before production.
   
   A: Yes

2. Who signs off that the six GL category totals match the accountant's expectation?
   Answer from older planning: Ari and Jeff.
   Why it matters: The mapping is accounting-sensitive and should be approved before go-live.

   A: Ari and Jeff.

## Suggested Assumptions To Confirm

- Use daily scheduled Gravity polling. Confirmed
- Process only reports with `processingStatus = DONE`. Confirmed
- Use all marketplaces available in the existing America-region Amazon connection. Confirmed
- Do not ignore any settlement report row unless Lionel explicitly approves the rule. Confirmed by requirements buddy
- Use compound categorization across `transaction-type`, `amount-type`, and `amount-description`. Confirmed by requirements buddy
- Use the Amazon amount sign to determine debit/credit direction. Confirmed by requirements buddy
- Use settlement ID as the canonical duplicate-prevention key. Confirmed
- Use NetSuite `externalId` or a custom body field as the source of truth for duplicate protection. Confirmed
- Search NetSuite by `externalId` before creating a Journal Entry. Confirmed
- Skip settlements when a matching Journal Entry already exists. Confirmed
- Do not save processed settlements in Gravity memory. Confirmed
- Save failed settlement attempts in one Gravity memory or Key Value Storage array so they can be retried later. Confirmed
- If CSV attachment fails after Journal Entry creation, store the created NetSuite Journal Entry ID with the failure context and retry attachment on a later run. Confirmed
- After a successful retry, remove the settlement from the environment-scoped failure array and set the updated array. Confirmed
- Use NetSuite Execute Custom Code or SuiteScript for Journal Entry creation and CSV file attachment. Confirmed
- Use `settlement-end-date` as the NetSuite posting date and Gravity checkpoint. Confirmed
- Update the checkpoint after the full report page or batch succeeds. Confirmed
- Use a few pre-go-live days only for test data, not a full historical backfill. Confirmed
- If a settlement fails inside the processing loop, log/email that settlement and continue with the next settlement. Confirmed
- Send failure emails to `bruno@mindcloud.co`, `AMiller@lionel.com`, and `jjones@lionel.com`. Confirmed
- Use memo format `Amazon Settlement {id}` unless another format is requested. Confirmed
- Validate Amazon tax and withheld tax net to zero before omitting tax lines. Confirmed: do not post tax.
- Route negative uncategorized leftovers to Amazon Selling Fees and positive uncategorized leftovers to Amazon Selling Fees as offsets. Needs Lionel approval before go-live.
- Do not use a separate Amazon clearing or balancing account. Confirmed: Cash is the clearing line.

## Build-Readiness Checklist

- [x] Amazon settlement report type confirmed
- [x] Amazon account, marketplace, and region filters confirmed
- [x] Source report status filter confirmed
- [x] NetSuite subsidiary, division, class, location, department, memo, and posting date defaults confirmed
- [x] NetSuite currency behavior confirmed
- [x] NetSuite posting period and approval behavior confirmed
- [x] Accounts Receivable customer or entity requirement confirmed
- [x] Invoice application behavior confirmed
- [ ] Journal Entry line granularity versus order-id memo requirement confirmed
- [x] Clearing or balancing account confirmed
- [x] Amount sign handling confirmed
- [x] Tax posting/omission rule confirmed
- [ ] Catch-all categorization rule approved by Lionel
- [x] Idempotency and matching key confirmed
- [x] Existing Journal Entry behavior confirmed
- [x] Multiple matching Journal Entries behavior confirmed
- [x] Sandbox File Cabinet folder internal ID confirmed
- [ ] Production File Cabinet folder internal ID confirmed
- [x] Failed settlement memory/retry behavior confirmed
- [x] Checkpoint field and update timing confirmed
- [ ] Pagination run cap confirmed
- [x] Concrete pre-go-live cutoff date confirmed
- [x] Error email enable/disable decision confirmed
- [x] Error recipients confirmed if emails are enabled
- [x] Sandbox test path confirmed
- [x] Accounting sign-off owner confirmed
