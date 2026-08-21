## Turnover Readiness

Status: Not ready

Summary:
MC-21982 defines an hourly, create-only ServiceTitan-to-Viewpoint Spectrum payment sync. Payments created on or after August 1 are read in `createdAt` order and create a Spectrum Cash Receipt when they pass the required validation. The basic filter, validation behavior, customer mapping, and record-level failure handling are now defined. The workflow is still not build-ready because the `Reference_Number` mapping conflicts with the proposed payment-ID idempotency key, and receipt application, Spectrum lookup, checkpoint tie-breaker, and retry-queue details remain unresolved.

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
- Checkpoint: Use `createdAt` to filter, order, and checkpoint the hourly ServiceTitan query.
- Receipt validation: Before creating a receipt, validate the required receipt data, including customer, `checkNumber`, date, positive total, invoice application data, and `batch.number`. If validation fails, do not create a Spectrum receipt.
- Invalid/reversal-like payments: Payments that do not meet the required validation, including negative or zero-dollar payments, are not created in Spectrum.
- `Reference_Number`: Map ServiceTitan `checkNumber` to Spectrum `Reference_Number`.
- Customer mapping: ServiceTitan customer `externalData` is the approved Spectrum `Customer_Code`.
- Batch mapping: Treat `batch.number` as populated and valid for Spectrum `Batch_Code`; if it is blank, fail validation and do not create the receipt.
- Record-level exceptions: Skip the payment, send a failure email, and add the record to a retry queue.
- Backfill: Include payments created on or after August 1, then continue using the hourly workflow and its `createdAt` checkpoint.

## Blocking Questions

### Payment Eligibility and Lifecycle

1. Since the workflow reads only newly created payments, what is the approved accounting process if a payment is voided, refunded, reversed, or otherwise changed after its Spectrum Cash Receipt was created?
   Why it matters: The workflow will not query later changes, and Spectrum cannot import reversal/adjustment receipts through this service.
   Implementation impact: Document the manual or separate-integration reconciliation process; the create-only workflow must not try to alter the prior receipt.

### Matching and Duplicate Prevention

1. The approved field map says `checkNumber` → Spectrum `Reference_Number`, but the proposed duplicate-prevention decision says the ServiceTitan payment ID will be stored in that same field. Which value must actually be sent in `Reference_Number`, and where should the other value be retained?
   Why it matters: One Spectrum field cannot reliably contain both values, and this decision directly affects reconciliation and idempotency.
   Implementation impact: Use the ServiceTitan payment ID as the lookup/idempotency key only if Spectrum provides a separate searchable field or an approved mapping store. If `Reference_Number` is the only available key, decide whether it contains `checkNumber` or payment ID before build.

2. ServiceTitan customer `externalData` is confirmed as the Spectrum `Customer_Code`. Please confirm that a blank, stale, or ambiguous value should be treated as a validation failure: skip the payment, send an email, and place it in the retry queue.
   Why it matters: The customer match is required before a cash receipt can be safely created.
   Implementation impact: Gravity should not guess a customer code and should apply the agreed record-level exception path.

3. Is `Invoice_Number` sufficient to match a Spectrum invoice, or must it also be verified against the matched customer, company, invoice type, or another Spectrum key? What should happen when the invoice is not found, is closed, or has an insufficient remaining balance?
   Why it matters: Invoice numbers may not be globally unique and applying cash to the wrong or closed invoice is an AR reconciliation risk.
   Implementation impact: The workflow may need a Spectrum invoice lookup/validation step for every application and an all-or-nothing decision for the receipt.

### Receipt and Application Rules

1. Does each ServiceTitan payment always belong to one customer and map to exactly one Spectrum Cash Receipt, even when it contains multiple invoice applications? Please confirm the required `AddCash_Receipts` header/detail payload structure and whether one request can contain all application lines.
   Why it matters: The issue says “one request per payment/customer receipt” but does not define the API grouping contract.
   Implementation impact: This determines whether Gravity builds one aggregated payload per payment or creates separate receipt requests/lines.

2. Must the sum of all `appliedTo.appliedAmount` values equal `Transaction_Amount`? If not, how should an unapplied balance, partial payment, overpayment, or prepayment be represented, including the required `Invoice_Type` and any invoice number for that line?
   Why it matters: The issue says invoice applications cannot exceed the receipt total and distinguishes `I` from `P`, but does not define the valid treatment of the remaining balance.
   Implementation impact: The payload-validation map needs explicit balancing logic before the Spectrum write; an unapproved difference cannot be silently dropped.

3. Is `Invoice_Type` always `I` for existing ServiceTitan invoice applications, and which explicit business condition should cause `P` to be used? Please provide a sample approved payload for a prepayment/overpayment if it is in scope.
   Why it matters: Setting the wrong invoice type can apply funds incorrectly or cause a Spectrum API rejection.
   Implementation impact: Gravity needs a value-translation rule rather than an unconditional default.

4. Which Spectrum `Company_Code` should be used, and is it a fixed Stelco value or mapped from a ServiceTitan business unit, location, or other attribute?
   Why it matters: The field map labels it as integration configuration but supplies no actual value or selection rule.
   Implementation impact: The workflow cannot construct a complete, auditable receipt request without this value.


### Incremental Processing and Backfill

1. `createdAt` is confirmed as the filter, ascending sort field, and checkpoint. Can multiple payments have the same `createdAt`; if so, what tie-breaker or cursor should be retained with the timestamp?
   Why it matters: A timestamp-only checkpoint can skip or duplicate payments that share a timestamp.
   Implementation impact: Store a composite checkpoint (for example, `createdAt` plus payment ID) or use the API cursor, and advance it after each successfully processed or retry-queued payment.

2. What are the expected daily and peak payment volumes, and are there ServiceTitan or Spectrum request limits, batch limits, maintenance windows, or posting-period cutoffs to respect?
   Why it matters: The hourly cadence alone does not establish a safe page size or retry behavior.
   Implementation impact: Gravity should page payments, process them in a loop, and cap each run if needed to avoid timeouts or API throttling.

### Exceptions, Notifications, and Acceptance

1. A payment with missing required data, an unmatched customer/invoice, invalid batch, or an out-of-balance application total will be skipped, emailed, and placed in a retry queue. Where will this queue be stored, how often should it retry, what is the retry limit, and who owns the exception after the limit is reached?
   Why it matters: Some validation failures cannot self-correct, so a queue without ownership or expiry can hide unreconciled payments.
   Implementation impact: Gravity needs a retry-record schema and a separate retry path that preserves the payment ID, validation reason, attempt count, and last attempt timestamp.

2. Who should receive failure emails, and which failures require an email versus a log only?
   Why it matters: Failures need an owner to protect AR reconciliation and prevent silent missed payments.
   Implementation impact: Configure actionable app-step error logs and email notifications, including the ServiceTitan payment ID, customer code, invoice references, batch, and Spectrum response/error when available.

3. Which sandbox or production credentials will be used for testing, and can the client provide representative payments for: one invoice, multiple invoices, partial payment, overpayment/prepayment, missing reference, unmatched invoice, and a reversal/void?
   Why it matters: The mapping and error rules require real examples to validate the Spectrum payload and reconciliation result.
   Implementation impact: These cases form the minimum test and go-live acceptance set.

## Follow-Up Questions

### Reconciliation and Ownership

1. After a Spectrum cash receipt is created, what reconciliation evidence should be retained or reported (for example, ServiceTitan payment ID, Spectrum receipt ID, batch code, and application totals), and who reviews exceptions?
   Why it matters: Cash receipt integrations need a practical audit trail beyond the workflow's success status.

2. Are ServiceTitan amounts and dates already in the same currency, timezone, and accounting-date convention required by Spectrum? If not, which system owns the conversion and posting-date rule?
   Why it matters: The field map passes values directly but does not confirm financial/date normalization.

## Suggested Assumptions To Confirm

- If no different instruction is provided, assume one positive ServiceTitan payment creates one Spectrum Cash Receipt with all valid invoice applications in a single request.
- If no different instruction is provided, assume the ServiceTitan payment ID is retained in the retry queue and reconciliation logs, but is not sent in `Reference_Number` unless the `checkNumber` conflict is resolved.
- If no different instruction is provided, assume payment-specific validation and lookup failures are logged, emailed, queued for retry, and skipped so unrelated payments can continue; authentication, source-query, and Spectrum-wide configuration failures stop the run.
- If no different instruction is provided, assume the hourly workflow uses a scheduled, paginated `createdAt` read and a composite checkpoint in Gravity memory after successful processing or retry-queue placement.

## Build-Readiness Checklist

- [x] Payment eligibility filters and `createdAt` checkpoint are confirmed.
- [ ] Post-creation change/void reconciliation process is confirmed.
- [ ] `Reference_Number` mapping and duplicate-prevention key are reconciled.
- [ ] Customer and invoice matching rules are confirmed.
- [ ] Receipt header/detail payload, balancing, and prepayment rules are approved.
- [ ] `Company_Code` and `Reference_Number` mapping are confirmed.
- [ ] Pagination/composite checkpoint tie-breaker is confirmed; backfill begins August 1.
- [x] Record-level validation failures are skipped, emailed, and queued for retry.
- [ ] Retry-queue storage, retry limit, ownership, and notification recipients are confirmed.
- [ ] Test credentials, representative data, reconciliation evidence, and go-live approver are available.
