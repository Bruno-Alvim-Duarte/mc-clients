## Turnover Readiness

Status: Not ready

Summary:
MC-21984 describes an hourly ServiceTitan-to-Viewpoint Spectrum customer sync that should create or update Spectrum customer records and write the resulting customer code back to ServiceTitan. The retry, source-name, polling, checkpoint, limited backfill, and default record-error decisions are now defined. The workflow is still not build-ready because core mapping values, contact scope, retry-queue mechanics, and notification recipients remain open.

## Confirmed Understanding

- Source system: ServiceTitan (tenant ID `5056159653` is shown in the project context).
- Destination system: Viewpoint Spectrum.
- Source record: ServiceTitan customer; contacts are also named in the issue but not mapped.
- Destination record: Spectrum Customer through `AddCustomer`, which supports `Contact_1`, `Contact_2`, and `Contact_3` on the customer record.
- Direction: One-way, ServiceTitan to Spectrum, with a write-back of the Spectrum `Customer_Code` to ServiceTitan `externalData`.
- Trigger/cadence: Scheduled polling every hour for newly created or modified customers.
- Incremental scope: Poll ServiceTitan every hour, ordered by `updatedOn` ascending and then Customer ID ascending. Store the last successfully processed composite checkpoint (`updatedOn` and Customer ID) in Gravity memory and read from that checkpoint in the next run.
- Backfill scope: Run the limited test backfill for customers updated on or after August 1, then use the incremental workflow.

## Confirmed Decisions

- Name mapping: Send the ServiceTitan `name` value to Spectrum `Name` without concatenation or other business transformation. If it exceeds Spectrum's 30-character limit, truncate it to the first 30 characters before sending.
- Incremental checkpoint: Use ServiceTitan Customer ID as the tie-breaker for records with the same `updatedOn` value. Store both `updatedOn` and Customer ID in Gravity memory.
- Backfill: Use August 1 as the backfill cutoff date; no separate end boundary is required.
- Partial write-back failure: If Spectrum customer creation succeeds but the ServiceTitan `externalData` update fails, retry the `externalData` update. If the retry does not succeed, send a failure email and add the record to a retry queue. A queued retry should first recover the existing Spectrum customer by customer code and retry only the ServiceTitan write-back; it must not call `AddCustomer` again.
- Record-level errors: For an error inside the customer loop, log the error, skip that customer, and continue processing the remaining customers. Failure-email recipients are still to be confirmed.

## Blocking Questions

### Customer and Contact Scope

1. What exact ServiceTitan customer records are in scope, and which ServiceTitan contact values should populate Spectrum `Contact_1`, `Contact_2`, and `Contact_3` in the `AddCustomer` payload? Please confirm the contact ordering, the primary contact, and the behavior when a customer has more than three contacts.
   Why it matters: Spectrum's `AddCustomer` service models contacts as three fields on the customer record, with `Contact_1` defined as the primary contact. The issue promises contact synchronization but supplies no contact mapping.
   Implementation impact: This remains a single customer payload path; the map step needs contact selection, ordering, validation, and an explicit overflow rule rather than a separate Contact-record workflow.

2. Recommended ownership model: ServiceTitan should overwrite only the fields explicitly mapped for this integration — `Name`, address fields, `Phone`, `Fax_Phone`, `Terms_Code`, `Sales_Tax_Code`, and `Statement_Flag`; contact fields should be added only after their mapping is approved. Treat `Customer_Code` as the immutable lookup key, keep `Company_Code` fixed, and do not update `Date_Created` or Spectrum fields with no ServiceTitan mapping (for example, credit limit, price levels, finance-charge settings, salesperson, markup code, and UDFs). Manually maintained Spectrum values should therefore be preserved unless they are in the approved ServiceTitan-owned mapping.
   Why it matters: Spectrum documents these customer fields as updateable, but it does not define which application owns each business value. This model limits overwrites to data that the issue explicitly makes ServiceTitan responsible for.
   Implementation impact: Build the update payload from the approved mapped fields only, always supplying `Company_Code` and the existing `Customer_Code` as identifiers. Validate in test that omitted optional fields remain unchanged in Spectrum before production, because the documentation does not explicitly define partial-update/blank-value behavior.

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
- If no different instruction is provided, assume ServiceTitan is the source of truth only for the explicitly mapped customer fields; unmapped or Spectrum-managed fields are not sent on update.
- If no different instruction is provided, assume the retry queue retains the ServiceTitan customer ID, Spectrum customer code, failure reason, retry count, and the last retry timestamp.
- If no different instruction is provided, assume customer-specific validation failures are logged with the ServiceTitan customer identifier and routed for review without processing unrelated customers; ambiguous duplicate matches are not auto-resolved.

## Build-Readiness Checklist

- [x] Composite incremental checkpoint is confirmed (`updatedOn`, then Customer ID).
- [ ] Idempotency and the cross-system matching key are confirmed.
- [ ] Customer/contact scope and create/update ownership are confirmed.
- [ ] Field mapping, required defaults, and value translations are approved.
- [ ] Pagination behavior is confirmed.
- [x] Backfill cutoff date is confirmed (August 1).
- [ ] Retry-queue storage, retry limit, logs, and failure-email recipients are confirmed.
- [ ] Test data, credentials, and mapping approval are available.
