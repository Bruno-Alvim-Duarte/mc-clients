## Turnover Readiness

Status: Not ready

Summary:
MC-21983 defines an hourly, create-only one-way sync that creates Viewpoint Spectrum AR Customer Invoices from eligible ServiceTitan invoices, then marks the source invoice as exported. Eligible invoices are in `Posted` status and have an invoice date on or after August 1. Changes, voids, and credits after export are explicitly outside this workflow's scope. The batch fallback, cost-center source, checkpoint, backfill, retry recovery, and operational assumptions are now defined. The workflow is not build-ready because the actual company value, Business Unit/GL mappings, Spectrum tax code for `In-House Sales`, and complete invoice payload rules are still open.

## Confirmed Understanding

- Source system: ServiceTitan (project context identifies tenant ID `5056159653`).
- Destination system: Viewpoint Spectrum.
- Source record: Posted ServiceTitan customer invoice, including customer, optional job/project, Business Unit, tax, batch, and invoice line items.
- Destination record: Spectrum AR Customer Invoice created through `AddARInvoice`.
- Direction: One-way, ServiceTitan to Spectrum, followed by a ServiceTitan status/write-back that marks the invoice exported only after the Spectrum creation succeeds.
- Trigger/cadence: Scheduled polling every hour.
- Incremental/backfill scope: Read `Posted` invoices with an invoice date on or after August 1. Run the initial backfill from August 1, then continue with the hourly incremental workflow.

## Confirmed Decisions

- Source eligibility: Each hourly run reads only ServiceTitan invoices in `Posted` status with an invoice date on or after August 1. Invoices already marked as exported are not processed again.
- Post-export lifecycle: This is a create-only workflow. If an exported ServiceTitan invoice is later changed, voided, or credited, the change is outside the scope of this workflow. The integration must not update the original Spectrum invoice or create a Spectrum credit memo.
- Idempotency: The ServiceTitan invoice ID is the stable cross-system key for the same invoice. The [ServiceTitan Invoices Get List endpoint](https://developer.servicetitan.io/docs/apis/tenant-accounting-v2/endpoints/Invoices_GetList) returns this `id` in each invoice response and supports filtering by invoice IDs through its `ids` parameter. Before `AddARInvoice`, Gravity searches only with this cross-system key. If it finds an existing invoice, the workflow skips the record; it does not perform an additional validation or an ambiguous-match check using the invoice number.
- Company-code approach (requirements confirmation): One fixed Spectrum `Company_Code` will be used for all customer invoices; its actual value is still unknown. Spectrum [`AddARInvoice`](https://help.trimble.com/doc/spectrum/spectrum/api-web-services/list-of-web-services/accounts-receivable-services/add-ar-invoice) requires a valid three-character company code.
- Cost-center source: Always derive the `Income_Cost_Center` from the Business Unit on the ServiceTitan invoice; do not derive it from the linked job/project. Apply the mapped value consistently to every required invoice payload placement.
- Batch fallback: When ServiceTitan `batchNumber` is blank, use the current date in `yyyyMMdd` format in the `America/New_York` timezone as Spectrum `Batch_Code`. This eight-character value fits Spectrum's 10-character limit.
- GL account handling: The client has a GL-account list, but the mapping must be established individually using the ServiceTitan GL account ID/name and the corresponding Spectrum `GL_Account` code/description. Do not pass ServiceTitan `items[].glAccount` through as-is until that mapping is approved. Blank-source behavior remains as previously documented: leave `GL_Account` blank when it is optional and not mapped.
- Tax-code mapping: ServiceTitan tax-zone IDs are system-specific and must not be passed directly to Spectrum. The observed ServiceTitan tax zone is named `In-House Sales`; obtain the equivalent Spectrum [`Sales_Tax_Code`](https://help.trimble.com/doc/spectrum/spectrum/api-web-services/list-of-web-services/accounts-receivable-services/add-ar-invoice) and map the zone by name.
- Incremental checkpoint: Use ServiceTitan `modifiedOn` plus invoice ID as a composite ascending checkpoint in Gravity memory. Advance it only after the invoice has completed a safe outcome (created/exported, or intentionally skipped and alerted).
- Backfill: Start the initial backfill at August 1 with no separate end date, then continue with the same hourly workflow and composite checkpoint.
- Retry recovery: If Spectrum creates the invoice but the ServiceTitan exported-status write-back fails, first recover the Spectrum invoice by ServiceTitan invoice ID, then retry only the ServiceTitan write-back. Do not call `AddARInvoice` again.
- Record-level exceptions: For an error inside the invoice loop, including an eligible invoice with no line items, send an alert, log the error, skip that invoice, and continue processing the remaining invoices. Validation and mapping failures are not retried automatically.
- Operating assumptions: Use scheduled, paginated reads with a page size of 50. No client volume, rate-limit, or reconciliation-retention requirement is needed; Gravity run logs are the operational audit trail.
- Retry queue: Use Gravity memory only. Queue transient app failures, retry them on the next hourly run up to three times, and alert after the last attempt. Validation and mapping failures are alerted and skipped; they are not retried automatically.
- Access and test data: No sandbox access and no test records are currently available; this is not a client decision required for the build.
- Failure-email contact: The only known contact is `aturner@stelco-electric.com`; Matheus could not confirm that this is the complete recipient list.

## Blocking Questions

### Required Header Values and Dependencies

1. What is the single default Spectrum `Company_Code` for all Stelco customer invoices?
   Why it matters: The fixed-default approach is confirmed, but `AddARInvoice` requires the actual valid three-character value.
   Implementation impact: Store the approved value as integration configuration; do not derive it from a ServiceTitan attribute.

2. Please provide the approved ServiceTitan Business Unit ID/name to Spectrum `Income_Cost_Center` code/description mapping, including the behavior when the Business Unit is blank or unmapped.
   Why it matters: The issue requires a client-provided mapping; the source Business Unit alone does not define the correct Spectrum cost center.
   Implementation impact: Gravity needs a maintained lookup and a defined skip-or-fail outcome when a Business Unit is blank or unmapped.

3. What is the Spectrum tax-zone ID/code (`Sales_Tax_Code`) for the tax zone equivalent to ServiceTitan's `In-House Sales` tax zone?
   Why it matters: The ServiceTitan tax-zone ID is system-specific and cannot be used as the Spectrum code.
   Implementation impact: Store the supplied Spectrum code in the approved tax mapping and use it when creating invoices.

4. Please provide the approved GL-account mapping list. For each ServiceTitan GL account ID/name, identify the corresponding Spectrum `GL_Account` code/description and confirm the behavior when there is no match.
   Why it matters: GL accounts must be mapped by a stable identifier on both systems, not by a display name alone.
   Implementation impact: Gravity needs a maintained lookup and must skip/alert an invoice line when no approved match exists.

### Line Items, Tax, and Credit Memos

1. With one Spectrum detail line per ServiceTitan invoice item, how should the invoice-level ServiceTitan `tax` amount be represented so it is not duplicated on every detail line? Please provide one approved multi-line invoice payload or allocation rule.
   Why it matters: The stated map sends `tax` to `Sales_Tax_Amount`, while the field is associated with imported detail records; repeating the full amount per item would overstate tax.
   Implementation impact: The map step needs a documented tax allocation or a documented single-line/header convention, followed by a total-balance validation.

2. For credit memos, should Gravity send the absolute positive values for `Line_Extension` and `Sales_Tax_Amount` with `Transaction_Type = C`, including when individual ServiceTitan lines or discounts are negative? Please confirm the approved calculation for discounts, adjustments, zero-value items, and rounding.
   Why it matters: Spectrum requires positive line and sales-tax amounts even when the transaction is a credit memo.
   Implementation impact: The workflow must normalize signs and validate that the header/line totals reconcile before submission.

3. What is the approved behavior when mapped values exceed Spectrum field limits, especially `number` / `Invoice_Or_Transaction` (10 characters), `summary` / `Remarks` (65), `items[].description` / `Detail_Description` (30), and GL account codes (12)? This is especially needed for the client-provided GL mapping by stable ID/code.
   Why it matters: The issue mentions truncating remarks if necessary but does not define treatment for other constrained fields or the preservation of invoice uniqueness.
   Implementation impact: The integration needs approved normalization or a record-specific exception; it must not silently make an invoice number non-unique.

### Exceptions, Notifications, and Acceptance

1. Should `aturner@stelco-electric.com` receive every failure email or only specific exception types? Please identify any additional recipients.
   Why it matters: Record-level failures will alert and continue, so the recipient list needs a clear owner.
   Implementation impact: Configure the approved recipients on app-step failure emails.

## Suggested Assumptions To Confirm

- Only `Posted`, not-yet-exported ServiceTitan invoices with an invoice date on or after August 1 are eligible. An eligible invoice with no line items is alerted and skipped.
- The workflow is confirmed as create-only in Spectrum. Corrections, voids, and credits after export are outside its scope and do not trigger a Spectrum update or credit memo.
- Invoice-specific validation failures are alerted, logged, and skipped so unrelated invoices continue; only transient app failures enter the Gravity-memory retry queue.

## Build-Readiness Checklist

- [x] Eligibility filters and go-live cutoff are confirmed.
- [x] Post-export lifecycle is confirmed as out of scope.
- [x] ServiceTitan invoice ID, Gravity lookup, and duplicate-prevention behavior are confirmed.
- [ ] Default `Company_Code` value and Business Unit-to-`Income_Cost_Center` mapping are confirmed.
- [ ] GL-account mapping by stable ServiceTitan ID/Spectrum code is approved; blank optional GL-account behavior is confirmed.
- [ ] Spectrum tax code for `In-House Sales`, line-item, discount, credit-memo, and field-length mappings are approved.
- [ ] Tax allocation and total-reconciliation rules for multi-line invoices are confirmed.
- [x] Pagination uses 50-record pages; `modifiedOn`/invoice-ID checkpoint and August 1 backfill are confirmed.
- [x] Record-level failures alert, skip, and continue; transient app failures retry from Gravity memory on the next hourly run up to three times. Failure-email recipients remain open.
