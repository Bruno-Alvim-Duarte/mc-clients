## Turnover Readiness

Status: Not ready

Summary:
MC-21982 defines an hourly, create-only ServiceTitan-to-Viewpoint Spectrum payment sync. Payments created on or after August 1 are read in `createdAt` order and each payment creates one Spectrum Cash Receipt when it passes the required validation. The lifecycle, loop-level exception behavior, retry mechanics, financial/date assumption, and prepayment scope are now defined. The workflow is still not build-ready because the payment-ID field-length constraint, actual default company code, receipt payload/balance rules, and final notification recipients remain unresolved.

## Confirmed Understanding

- Source system: ServiceTitan.
- Destination system: Viewpoint Spectrum.
- Source record: ServiceTitan accounting payment, including its customer, batch, payment reference, total, date, and `appliedTo` invoice applications.
- Destination record: Spectrum Cash Receipt created through `AddCash_Receipts`, with a receipt header and invoice detail lines.
- Direction: One-way, ServiceTitan to Spectrum.
- Trigger/cadence: Scheduled polling every hour.
- Incremental/backfill scope: Process payments created on or after August 1. Use `createdAt` as the ServiceTitan filter, ascending sort field, and Gravity checkpoint. Do not query later modifications to an already created payment.

## Confirmed Decisions

- Eligibility: Process only payments created on or after August 1. The workflow is create-only; later modifications are out of scope.
- Checkpoint: Use `createdAt` plus the ServiceTitan payment `id` as the composite filter, ascending sort, and Gravity-memory checkpoint for the hourly query.
- Receipt validation: Before creating a receipt, validate the applicable required receipt data, including payment ID, date, positive total, invoice application data, and `batch.number`. If validation fails, do not create a Spectrum receipt.
- Invalid/reversal-like payments: Payments that do not meet the required validation, including negative or zero-dollar payments, are not created in Spectrum.
- `Reference_Number`: Map the ServiceTitan payment ID to Spectrum `Reference_Number`; do not use `checkNumber`. Verified current payment IDs fit Spectrum's 10-character limit, so no transformation is required.
- Payment-to-receipt relationship: Each ServiceTitan payment maps to exactly one Spectrum Cash Receipt, including when the payment has multiple invoice applications.
- Invoice lookup key: `Invoice_Number` alone is sufficient to find the Spectrum invoice; no additional customer, company, invoice-type, or other key validation is required for the lookup.
- Batch mapping: Treat `batch.number` as populated and valid for Spectrum `Batch_Code`; if it is blank, fail validation and do not create the receipt.
- Record-level exceptions: Send an alert, log the error, skip the payment, and continue processing the loop. Validation and matching failures are not retried automatically.
- Backfill: Include payments created on or after August 1, then continue using the hourly workflow and its `createdAt` checkpoint.
- Missing customer: If the payment has no customer or the customer cannot be found, skip the payment and issue a warning. Do not create a non-customer cash receipt.
- Invoice matching: If an invoice is not found, is closed, or has insufficient remaining balance, skip the whole payment and issue a warning.
- Invoice type: All in-scope payments are associated with invoices. Set `Invoice_Type` to `I`; `P` is out of scope and no special future prepayment/overpayment process is required.
- Company-code approach (requirements confirmation): One fixed Spectrum `Company_Code` will be used for all payments; its actual value is still unknown.
- Documentation validation: Spectrum [`AddCash_Receipts`](https://help.trimble.com/en-gb/spectrum/spectrum/api-web-services/list-of-web-services/accounts-receivable-services/add-cash-receipts) limits `Reference_Number` to 10 characters and requires it to be unique with `Customer_Code`. Its documentation identifies this field as the check/reference number, but a payment ID can be used only if every ID fits the limit without truncation. The service can infer a customer from an invoice when `Customer_Code` is blank, but the approved workflow behavior is to skip/warn instead of relying on that fallback.
- Post-creation lifecycle: This is a create-only workflow. Once Spectrum creates the Cash Receipt, later ServiceTitan voids, refunds, reversals, and other changes are explicitly out of scope and are not updated in Spectrum by this workflow.
- Financial/date convention: Assume ServiceTitan amounts and dates already use the currency, timezone, and accounting-date convention required by Spectrum; no conversion is applied.
- Operating assumptions: Use scheduled, paginated reads with a page size of 50. No client volume, rate-limit, or reconciliation-retention requirement is needed; Gravity run logs are the operational audit trail.
- Retry queue: Use Gravity memory only. Queue transient app failures, retry them on the next hourly run up to three times, and alert after the last attempt. Validation and matching failures are alerted and skipped; they are not retried automatically.
- Access and test data: No sandbox access and no test records are currently available; this is not a client decision required for the build.
- Failure-email contact: The only known contact is `aturner@stelco-electric.com`; Matheus could not confirm that this is the complete recipient list.

## Blocking Questions

### Receipt and Application Rules

1. Each ServiceTitan payment maps to exactly one Spectrum Cash Receipt, including when it has multiple invoice applications. A missing or unmatched customer will skip/warn, so please confirm the required `AddCash_Receipts` header/detail payload structure and whether one request can contain all application lines.
   Why it matters: A customer-associated receipt is required by the approved exception behavior, but the aggregation shape is still unknown.
   Implementation impact: Gravity will build one customer-specific Cash Receipt per payment; the request assembly remains open pending confirmation.

2. All in-scope payments are expected to apply fully to invoices and use `Invoice_Type = I`. Please confirm that the sum of `appliedTo.appliedAmount` must equal `Transaction_Amount`, and that any difference will be skipped/warned rather than sent as a partial payment, overpayment, or prepayment.
   Why it matters: Spectrum can create an overpayment when the transaction amount exceeds the applied amount, but requirements state that such cases are not in scope.
   Implementation impact: The payload-validation map should enforce a zero balance before the Spectrum write.

3. What is the single default Spectrum `Company_Code` for all Stelco payments?
   Why it matters: The fixed-default approach is confirmed, but the actual valid company value is not. Spectrum can default this field from the Authorization ID when blank, but requirements should explicitly approve either that dependency or a supplied value.
   Implementation impact: Store the approved value/configuration rule once; do not derive it from ServiceTitan data.


### Exceptions, Notifications, and Acceptance

1. Should `aturner@stelco-electric.com` receive every failure email or only selected exception types, and who else should receive them?
   Why it matters: Failures need an owner to protect AR reconciliation and prevent silent missed payments.
   Implementation impact: Configure actionable app-step error logs and email notifications, including the ServiceTitan payment ID, customer code, invoice references, batch, and Spectrum response/error when available.

## Suggested Assumptions To Confirm

- The ServiceTitan payment ID is retained in Gravity-memory retry records and run logs and is sent directly in `Reference_Number`.
- Payment-specific validation and lookup failures are alerted, logged, and skipped so unrelated payments can continue; only transient app failures enter the retry queue.

## Build-Readiness Checklist

- [x] Payment eligibility filters and `createdAt` checkpoint are confirmed.
- [x] Post-creation changes, voids, refunds, and reversals are explicitly out of scope.
- [x] `Reference_Number` maps directly to the verified 10-character-or-less payment ID.
- [x] Customer/invoice matching rules are confirmed: missing customer, missing/closed invoice, and insufficient balance are skip-and-warn.
- [ ] Receipt header/detail payload and balancing rule are approved; `Invoice_Type = I` and no prepayment/overpayment handling are confirmed.
- [ ] Default `Company_Code` value is confirmed.
- [x] Composite `createdAt` plus payment-`id` checkpoint is confirmed; backfill begins August 1.
- [x] Record-level validation failures alert, skip, and continue; transient app failures retry from Gravity memory on the next hourly run up to three times.
- [ ] Failure-email recipients are confirmed.
