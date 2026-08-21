## Turnover Readiness

Status: Not ready

Summary:
MC-21983 defines an hourly one-way sync that creates Viewpoint Spectrum AR Customer Invoices from posted ServiceTitan invoices, then marks the source invoice as exported. The high-level flow, most core fields, regular-invoice versus credit-memo rule, and prerequisite dependencies are identified. The workflow is not build-ready because the complete Spectrum payload, invoice idempotency, Business Unit/Job cost-center rules, line-level tax and credit-memo treatment, incremental checkpoint, and operational exception decisions are still open.

## Confirmed Understanding

- Source system: ServiceTitan (project context identifies tenant ID `5056159653`).
- Destination system: Viewpoint Spectrum.
- Source record: Posted ServiceTitan customer invoice, including customer, optional job/project, Business Unit, tax, batch, and invoice line items.
- Destination record: Spectrum AR Customer Invoice created through `AddARInvoice`.
- Direction: One-way, ServiceTitan to Spectrum, followed by a ServiceTitan status/write-back that marks the invoice exported only after the Spectrum creation succeeds.
- Trigger/cadence: Scheduled polling every hour.
- Incremental/backfill scope: Incremental processing is intended for new invoices. Historical backfill scope and checkpoint behavior are not defined.

## Blocking Questions

### Invoice Eligibility and Lifecycle

1. Please confirm the exact ServiceTitan query for each hourly run: does it include only invoices in `Posted` status that have not already been exported, and what go-live invoice-date cutoff should apply?
   Why it matters: The issue says “new invoices,” while the source status and cutoff determine which records are safe to process and prevent historical invoices from entering unintentionally.
   Implementation impact: Gravity needs an explicit source filter before pagination; invoices with no line items should be excluded or logged as specified.

2. After an invoice has been exported, can it ever be changed, voided, or credited in ServiceTitan? If so, should the change create a Spectrum credit memo, update the original invoice, or be handled outside this workflow?
   Why it matters: Marking an invoice exported may make it non-editable, but the expected accounting handling for post-export corrections is not stated.
   Implementation impact: This determines whether the workflow is create-only or must recognize later lifecycle events without creating duplicate AR activity.

### Matching and Duplicate Prevention

1. What is the approved idempotency key for the same ServiceTitan invoice, and which Spectrum lookup must occur before calling `AddARInvoice`? Please confirm whether the stable key is ServiceTitan invoice ID, `number`, a Spectrum `GUID`, or a defined combination including `Company_Code` and `Batch_Code`.
   Why it matters: Spectrum requires a unique invoice number, but an API timeout or a failure after Spectrum accepts the invoice can otherwise cause an hourly retry to create a duplicate.
   Implementation impact: Gravity needs a deterministic search/create-or-skip path and must only mark the source exported after the target result is confirmed.

2. What should happen when the invoice number already exists in Spectrum but cannot be conclusively matched to the same ServiceTitan invoice?
   Why it matters: Reusing or matching the wrong invoice number creates an AR reconciliation risk.
   Implementation impact: Ambiguous matches should stop automatic creation, log the ServiceTitan and Spectrum identifiers, and notify an owner rather than being auto-resolved.

### Required Header Values and Dependencies

1. Which Spectrum `Company_Code` should be used for Stelco, and is it one fixed value or a mapping based on a ServiceTitan Business Unit, job, location, or other attribute?
   Why it matters: `Company_Code` is required by `AddARInvoice` but is not included in the issue field map.
   Implementation impact: This is a required header value for every request and belongs in the approved mapping/configuration.

2. Please provide the approved Business Unit-to-Spectrum `Income_Cost_Center` mapping. The project context identifies service cost centers `1002` (NC), `2002` (SC), and `3002` (GA), but does not identify the ServiceTitan values that select them.
   Why it matters: The issue requires a client-provided mapping; the available cost-center list alone cannot select the correct value.
   Implementation impact: Gravity needs a maintained lookup and a defined skip-or-fail outcome when a Business Unit is blank or unmapped.

3. For a ServiceTitan invoice linked to a project/job, should the Spectrum cost center come from the linked Job’s Spectrum cost center, the ServiceTitan Business Unit mapping, or a precedence rule between both? Please confirm the intended header/detail placement as well.
   Why it matters: The issue names both Job and Business Unit, while the referenced Spectrum/Agave guidance indicates project invoices may use the linked Job cost center.
   Implementation impact: The map step and payload must apply one approved rule; conflicting cost-center sources should not be silently chosen.

4. Are `batchNumber` values always present, within Spectrum’s allowed length, and already valid as Spectrum `Batch_Code` values? If not, what approved batch-code derivation or fallback should be used?
   Why it matters: `Batch_Code` is required by Spectrum and affects AR grouping and reconciliation.
   Implementation impact: The workflow needs validation before the write and a safe exception path for invalid batches.

5. Please provide the approved `taxZoneId` to Spectrum `Sales_Tax_Code` mapping, including tax-exempt, blank, and unmapped values.
   Why it matters: The issue requires tax-code validation but supplies no client mapping; the code also determines Spectrum’s tax treatment.
   Implementation impact: Gravity needs a lookup/translation before payload construction and should not guess a tax code.

### Line Items, Tax, and Credit Memos

1. With one Spectrum detail line per ServiceTitan invoice item, how should the invoice-level ServiceTitan `tax` amount be represented so it is not duplicated on every detail line? Please provide one approved multi-line invoice payload or allocation rule.
   Why it matters: The stated map sends `tax` to `Sales_Tax_Amount`, while the field is associated with imported detail records; repeating the full amount per item would overstate tax.
   Implementation impact: The map step needs a documented tax allocation or a documented single-line/header convention, followed by a total-balance validation.

2. For credit memos, should Gravity send the absolute positive values for `Line_Extension` and `Sales_Tax_Amount` with `Transaction_Type = C`, including when individual ServiceTitan lines or discounts are negative? Please confirm the approved calculation for discounts, adjustments, zero-value items, and rounding.
   Why it matters: Spectrum requires positive line and sales-tax amounts even when the transaction is a credit memo.
   Implementation impact: The workflow must normalize signs and validate that the header/line totals reconcile before submission.

3. What should happen when a required GL account is blank, unmapped, or not valid in Spectrum? Please provide the approved ServiceTitan pricebook/`items[].glAccount` to Spectrum `GL_Account` mapping or confirm that the values match exactly, including formatting such as removal of dashes if required.
   Why it matters: A GL account is necessary to record revenue correctly; the project contains a chart of accounts but not an approved item-level mapping in the issue.
   Implementation impact: An unmapped line must prevent an incorrect invoice from being created; this requires a validation branch before `AddARInvoice`.

4. What is the approved behavior when mapped values exceed Spectrum field limits, especially `number` / `Invoice_Or_Transaction` (10 characters), `summary` / `Remarks` (65), `items[].description` / `Detail_Description` (30), and GL account codes (12)?
   Why it matters: The issue mentions truncating remarks if necessary but does not define treatment for other constrained fields or the preservation of invoice uniqueness.
   Implementation impact: The integration needs approved normalization or a record-specific exception; it must not silently make an invoice number non-unique.

### Incremental Processing and Backfill

1. Which ServiceTitan date/cursor and stable tie-breaker should drive the hourly incremental query—for example, posted or modified timestamp plus invoice ID—and can multiple invoices share the same timestamp?
   Why it matters: A timestamp-only checkpoint can skip or duplicate invoices when several records have the same value or when a posted invoice is later corrected.
   Implementation impact: Use a paginated, composite checkpoint in Gravity memory and advance it only after an invoice has successfully completed its approved outcome.

2. Is a historical invoice backfill required? If yes, what exact start/end date, expected volume, and reconciliation process should be used, and should it run separately before the hourly workflow is enabled?
   Why it matters: Backfill volume, processing-period eligibility, and exception handling differ from ongoing invoice processing.
   Implementation impact: A bounded separate run avoids overlap with the production checkpoint and permits controlled reconciliation.

### Exceptions, Notifications, and Acceptance

1. For missing customer/job/Business Unit links, invalid tax or GL mappings, invalid AR/GL dates, or an unmatched duplicate, should Gravity skip the invoice and continue the batch, retry automatically, or stop the entire run? Who should receive the failure emails and own the correction?
   Why it matters: The issue requires validation but does not define the operational decision after validation fails.
   Implementation impact: Record-specific failures can use an error log plus `Continue Loop` when approved; authentication, source-query, or systemic Spectrum configuration failures should use `Stop Workflow` with an actionable email.

2. What retry behavior is approved for an uncertain Spectrum response or a failure while marking ServiceTitan exported after Spectrum has already created the invoice?
   Why it matters: Retrying the full sequence without a recovery lookup can produce duplicate Spectrum invoices or leave successfully created invoices unmarked in ServiceTitan.
   Implementation impact: A recovery path should first locate the target invoice using the approved idempotency key, then retry only the safe incomplete action.

3. Which test environment/credentials and representative invoices are available for approval: regular multi-line invoice, credit memo, job/project invoice, each Business Unit/cost center, taxed and tax-exempt invoice, missing dependency, and duplicate/retry scenario?
   Why it matters: Financial mappings and exception behavior need evidence before go-live.
   Implementation impact: These cases form the acceptance set for the mapping, recovery behavior, logs, and reconciliation.

## Follow-Up Questions

### Reconciliation and Operating Limits

1. What daily and peak invoice volume, ServiceTitan/Spectrum API limits, Spectrum maintenance windows, and maximum acceptable sync delay should the hourly workflow support?
   Why it matters: Cadence alone does not define a safe page size, run cap, or retry pacing.

2. Which audit data should be retained or reported after each successful export—for example, ServiceTitan invoice ID/number, Spectrum invoice ID or GUID, company, batch, transaction type, totals, and export timestamp—and who reviews exceptions?
   Why it matters: AR invoice reconciliation requires an auditable link across the two systems.

## Suggested Assumptions To Confirm

- If no different instruction is provided, assume only posted, not-yet-exported ServiceTitan invoices with at least one line item and a post-go-live invoice date are eligible.
- If no different instruction is provided, assume each ServiceTitan invoice is create-only in Spectrum; corrections after export require an approved credit-memo or separate accounting process.
- If no different instruction is provided, assume invoice-specific validation failures are logged, emailed, and skipped so unrelated invoices continue; authentication, source-query, and Spectrum-wide configuration failures stop the workflow.
- If no different instruction is provided, assume Gravity uses a scheduled, paginated read and a composite checkpoint stored in memory only after the invoice reaches a safe, reconciled outcome.

## Build-Readiness Checklist

- [ ] Eligibility filters, post-export lifecycle, and go-live cutoff are confirmed.
- [ ] Idempotency key, Spectrum lookup, and duplicate-recovery behavior are confirmed.
- [ ] `Company_Code`, batch behavior, customer/job dependencies, and Business Unit/Job cost-center precedence are confirmed.
- [ ] Tax-code, GL-account, line-item, discount, credit-memo, and field-length mappings are approved.
- [ ] Tax allocation and total-reconciliation rules for multi-line invoices are confirmed.
- [ ] Pagination, composite checkpoint, backfill scope, and run-volume limits are confirmed.
- [ ] Record-level versus systemic failure behavior, retries, logs, and failure-email recipients are confirmed.
- [ ] Test credentials, representative records, reconciliation evidence, and go-live approver are available.
