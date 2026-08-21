## Turnover Readiness

Status: Not ready

Summary:
MC-21984 describes an hourly ServiceTitan-to-Viewpoint Spectrum customer sync that should create or update Spectrum customer records and write the resulting customer code back to ServiceTitan. The retry, source-name, polling, limited backfill, and default record-error decisions are now defined. The workflow is still not build-ready because core mapping values, contact scope, update ownership, exact checkpoint tie-breaking, retry-queue mechanics, and notification recipients remain open.

## Confirmed Understanding

- Source system: ServiceTitan (tenant ID `5056159653` is shown in the project context).
- Destination system: Viewpoint Spectrum.
- Source record: ServiceTitan customer; contacts are also named in the issue but not mapped.
- Destination record: Spectrum Customer through `AddCustomer`; the Spectrum contact operation is not identified.
- Direction: One-way, ServiceTitan to Spectrum, with a write-back of the Spectrum `Customer_Code` to ServiceTitan `externalData`.
- Trigger/cadence: Scheduled polling every hour for newly created or modified customers.
- Incremental scope: Poll ServiceTitan every hour, ordered by `updatedOn` ascending. Store the last successfully processed customer's `updatedOn` in Gravity memory and read from that checkpoint in the next run.
- Backfill scope: Run a small initial backfill from August 1 for test data, then use the incremental workflow.

## Confirmed Decisions

- Name mapping: Send the ServiceTitan `name` value to Spectrum `Name` exactly as received; do not concatenate or otherwise transform it.
- Partial write-back failure: If Spectrum customer creation succeeds but the ServiceTitan `externalData` update fails, retry the `externalData` update. If the retry does not succeed, send a failure email and add the record to a retry queue. A queued retry should first recover the existing Spectrum customer by customer code and retry only the ServiceTitan write-back; it must not call `AddCustomer` again.
- Record-level errors: For an error inside the customer loop, log the error, skip that customer, and continue processing the remaining customers. Failure-email recipients are still to be confirmed.

## Blocking Questions

### Customer and Contact Scope

1. What exact ServiceTitan customer records are in scope, and should each customer’s contacts be synchronized as separate Spectrum Contact records? If yes, which Spectrum API operation should be used and which ServiceTitan contact fields map to it?
   Why it matters: The issue promises both Customer and Contact synchronization, but provides only a customer `AddCustomer` payload and field map.
   Implementation impact: This determines whether the workflow has one record path or a customer path plus a nested/child-contact create-or-update path.

2. After a Spectrum customer exists, which fields may the integration update, and should manually changed Spectrum values ever be overwritten by ServiceTitan?
   Why it matters: The stated behavior is “creates or updates,” but the update ownership rules are not defined.
   Implementation impact: This defines the Spectrum lookup/update branch and prevents unintended overwrites.

### Matching and Idempotency

1. Is ServiceTitan `externalData` the approved, stable cross-system key for every customer? Please confirm whether it is exclusively owned by this integration and whether any existing values must be preserved.
   Why it matters: The issue proposes using `externalData` as the Spectrum `Customer_Code`, but does not establish that it is unique, present, and safe to overwrite.
   Implementation impact: Gravity needs one stable key for the Spectrum lookup, create-or-update decision, and post-create write-back.

2. When `externalData` is blank, what is the approved deterministic customer-code algorithm, including normalization, truncation, and collision handling for customers with the same or similar names?
   Why it matters: “First name + last name,” uppercase, no commas/symbols, and a 10-character limit can still produce duplicate codes.
   Implementation impact: The map step must generate a reproducible code and the workflow needs a defined outcome when Spectrum already has that code for another customer.

### Field Mapping and Required Defaults

1. Please provide the approved mapping from each ServiceTitan `paymentTermId` to Spectrum `Terms_Code`, including the fallback for a missing or unmapped value.
   Why it matters: `Terms_Code` is required by Spectrum and no mapping is supplied.
   Implementation impact: An unmapped term must be handled before the `AddCustomer` call; the workflow cannot safely invent a default.

2. Which Spectrum `Company_Code` should be used for Stelco, and is it one fixed value or a mapping based on a ServiceTitan attribute?
   Why it matters: `Company_Code` is required and the issue identifies neither a value nor a source field.
   Implementation impact: This is a required payload value and blocks customer creation.

3. What is the approved `Sales_Tax_Code` mapping by location/state, including which address to use when billing and service locations differ and what to do for an unsupported, blank, or tax-exempt state?
   Why it matters: The issue says to map by location but does not provide the mapping or define the relevant location.
   Implementation impact: Gravity needs a maintained lookup/translation and a defined skip-or-fail behavior for unmapped values.

4. The mapping is confirmed as ServiceTitan `name` → Spectrum `Name` without transformation. What should happen when that value exceeds Spectrum's documented 30-character maximum or another destination field limit: reject/skip the record, allow the API to reject it, or apply an approved transformation?
   Why it matters: Passing the name exactly as received does not define how the workflow should handle values Spectrum cannot accept.
   Implementation impact: The map and error paths need an explicit validation or rejection behavior; they should not silently truncate the name.

5. What are the defaults or mappings for any Spectrum-required `AddCustomer` fields not listed in the issue, and can the client provide sample source customers plus accepted Spectrum payloads for validation?
   Why it matters: Required destination fields and business defaults must be known before testing can demonstrate correctness.
   Implementation impact: This completes the payload contract and makes mapping approval testable.

### Incremental Processing and Backfill

1. The workflow will query customers in ascending `updatedOn` order and store the last successfully processed `updatedOn` in Gravity memory. Please confirm the tie-breaker for customers that share the same timestamp; the recommended approach is to sort by ServiceTitan customer ID ascending and store a composite checkpoint of `updatedOn` plus customer ID.
   Why it matters: A timestamp-only checkpoint can skip or duplicate records when multiple customers share the same `updatedOn` value.
   Implementation impact: Gravity should query and paginate by the composite ordering, then advance the checkpoint only after the applicable customer completes successfully or is intentionally placed in the retry queue.

2. The initial backfill is limited to records from August 1 for testing. Please confirm the end boundary (for example, through the go-live timestamp) and whether this test backfill should run separately before the hourly schedule is enabled.
   Why it matters: A clear boundary keeps the test backfill small and prevents overlap with the incremental checkpoint.
   Implementation impact: This determines the one-time filter and the point at which the ongoing workflow takes ownership.

### Exceptions, Notifications, and Acceptance

1. Record-level errors inside the customer loop will be logged, skipped, and processing will continue. Which failures are systemic or duplicate-risk failures that must stop the run, and who should receive the failure emails?
   Why it matters: Continuing after a configuration, authentication, or duplicate-risk failure could make the remaining results unsafe; failure email recipients are not yet defined.
   Implementation impact: Customer-specific app failures should use `Continue Loop` with an error log and retry-queue behavior where applicable. Critical app failures should use `Stop Workflow` and an actionable failure email.

2. What are the expected daily and peak customer-change volumes, and are there ServiceTitan or Spectrum rate limits, batch limits, or maintenance windows to respect?
   Why it matters: The hourly cadence alone does not establish a safe page size or retry plan.
   Implementation impact: This informs pagination size, run duration, retry behavior, and whether each run must cap the number of records.

3. Which test environment/credentials and representative records are available, and who will approve the customer-code, term, tax, and company-code mappings before go-live?
   Why it matters: The mapping is client-specific and needs an agreed validation path.
   Implementation impact: Defines the test plan and release approval gate.

## Follow-Up Questions

### Related Project Context

1. The project notes list three Service cost centers — `1002` (NC Service Sales), `2002` (SC Service Sales), and `3002` (GA Service Sales). Do any of these affect customer `Company_Code`, `Sales_Tax_Code`, or customer selection for this workflow?
   Why it matters: The notes come from broader ServiceTitan/Spectrum project context and may or may not apply to customer synchronization.

2. The project description contains a generic Viewpoint Vista template alongside this Spectrum issue. Which shared requirements are explicitly valid for Spectrum, and which should be disregarded?
   Why it matters: Reusing Vista-specific assumptions could produce invalid Spectrum behavior.

## Suggested Assumptions To Confirm

- If no different instruction is provided, assume the integration should look up a Spectrum customer by the previously stored `externalData`/`Customer_Code` before any create or update action.
- If no different instruction is provided, assume the retry queue retains the ServiceTitan customer ID, Spectrum customer code, failure reason, retry count, and the last retry timestamp.
- If no different instruction is provided, assume customer-specific validation failures are logged with the ServiceTitan customer identifier and routed for review without processing unrelated customers; ambiguous duplicate matches are not auto-resolved.

## Build-Readiness Checklist

- [ ] Source filters, pagination, and the composite incremental checkpoint are confirmed.
- [ ] Idempotency and the cross-system matching key are confirmed.
- [ ] Customer/contact scope and create/update ownership are confirmed.
- [ ] Field mapping, required defaults, and value translations are approved.
- [ ] Pagination and checkpoint strategy are confirmed.
- [ ] Backfill end boundary and transition to the hourly workflow are confirmed.
- [ ] Retry-queue storage, retry limit, logs, and failure-email recipients are confirmed.
- [ ] Test data, credentials, and mapping approval are available.
