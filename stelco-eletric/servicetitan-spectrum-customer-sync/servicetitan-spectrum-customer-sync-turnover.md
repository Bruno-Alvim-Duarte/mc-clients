## Turnover Readiness

Status: Not ready

Summary:
MC-21984 describes an hourly ServiceTitan-to-Viewpoint Spectrum customer sync that should create or update Spectrum customer records and write the resulting customer code back to ServiceTitan. The external-data ownership, contact handling, loop-level exception handling, retry mechanics, and operational assumptions are now defined. The workflow is still not build-ready because the customer-code collision policy, payment-term mapping, actual default company code, Spectrum tax code for `In-House Sales`, update ownership, and final notification recipients remain open.

## Confirmed Understanding

- Source system: ServiceTitan (tenant ID `5056159653` is shown in the project context).
- Destination system: Viewpoint Spectrum.
- Source record: ServiceTitan customer, including contacts mapped to Spectrum's three contact fields.
- Destination record: Spectrum Customer through `AddCustomer`, which supports `Contact_1`, `Contact_2`, and `Contact_3` on the customer record.
- Direction: One-way, ServiceTitan to Spectrum, with a write-back of the Spectrum `Customer_Code` to ServiceTitan `externalData`.
- Trigger/cadence: Scheduled polling every hour for newly created or modified customers.
- Incremental scope: Poll ServiceTitan every hour, ordered by `updatedOn` ascending and then Customer ID ascending. Store the last successfully processed composite checkpoint (`updatedOn` and Customer ID) in Gravity memory and read from that checkpoint in the next run.
- Backfill scope: Run the limited test backfill for customers updated on or after August 1, then use the incremental workflow.

## Confirmed Decisions

- Name mapping: Send the ServiceTitan `name` value to Spectrum `Name` without concatenation or other business transformation. If it exceeds Spectrum's 30-character limit, truncate it to the first 30 characters before sending.
- Incremental checkpoint: Use ServiceTitan Customer ID as the tie-breaker for records with the same `updatedOn` value. Store both `updatedOn` and Customer ID in Gravity memory.
- Backfill: Use August 1 as the backfill cutoff date; no separate end boundary is required.
- Partial write-back failure: If Spectrum customer creation succeeds but the ServiceTitan `externalData` update fails, queue only that write-back in Gravity memory. Retry it on subsequent hourly runs up to three times, always recovering the existing Spectrum customer by code first; never call `AddCustomer` again. After the third failure, send an alert and retain the exception in logs for manual correction.
- Record-level errors: For an error inside the customer loop, send an alert, log the error, skip that customer, and continue processing the remaining customers.
- Customer-code source (technical decision): Use the `externalData` entry associated with this integration's own ServiceTitan application GUID, held in integration configuration, as the Spectrum `Customer_Code`. This entry is integration-owned and may be read and written by the workflow. If its value is blank, the stated fallback is first name plus last name. The current manual customer-code construction is not known.
- Customer-code documentation validation: Spectrum [`AddCustomer`](https://help.trimble.com/doc/spectrum/spectrum/api-web-services/list-of-web-services/accounts-receivable-services/add-customer) requires a unique, uppercase, symbol-free `Customer_Code` of at most 10 characters. ServiceTitan documents [`externalData`](https://developer.servicetitan.io/docs/apis/tenant-crm-v2/endpoints/Customers_Get) as a list of key/value entries associated with an application GUID; its published customer schema does not document a 10-character limit for its value. The reported 10-character constraint is therefore confirmed for the Spectrum target code, not for ServiceTitan `externalData`.
- Contact handling: Populate all expected ServiceTitan contacts across Spectrum `Contact_1`, `Contact_2`, and `Contact_3` in the source-returned order. No contact is treated as primary and the order has no business significance.
- Company-code approach (requirements confirmation): One fixed Spectrum `Company_Code` will be used for all customers; its actual value is still unknown. Spectrum documents `Company_Code` as a required, valid, three-character value for [`AddCustomer`](https://help.trimble.com/doc/spectrum/spectrum/api-web-services/list-of-web-services/accounts-receivable-services/add-customer).
- Sales-tax approach: ServiceTitan tax-zone IDs are system-specific and must not be sent directly to Spectrum. Map the ServiceTitan tax zone named `In-House Sales` to its equivalent Spectrum `Sales_Tax_Code`; Spectrum requires this code to exist in Sales Tax Code Maintenance and allows up to 15 characters in [`AddCustomer`](https://help.trimble.com/doc/spectrum/spectrum/api-web-services/list-of-web-services/accounts-receivable-services/add-customer).
- Operating assumptions: Use scheduled, paginated reads with a page size of 50. No client volume, rate-limit, or reconciliation-retention requirement is needed; Gravity run logs are the operational audit trail.
- Retry queue: Use Gravity memory only. Queue transient app/write-back failures, retry them on the next hourly run up to three times, and alert after the last attempt. Validation and mapping failures are alerted and skipped; they are not retried automatically.
- Access and test data: No sandbox access and no test records are currently available; this is not a client decision required for the build.
- Failure-email contact: The only known contact is `aturner@stelco-electric.com`; Matheus could not confirm that this is the complete recipient list.

## Blocking Questions

### Customer Update Ownership

1. Recommended ownership model: ServiceTitan should overwrite only the fields explicitly mapped for this integration — `Name`, address fields, `Phone`, `Fax_Phone`, `Terms_Code`, `Sales_Tax_Code`, and `Statement_Flag`; contact fields are mapped in the source-returned order. Treat `Customer_Code` as the immutable lookup key, keep `Company_Code` fixed, and do not update `Date_Created` or Spectrum fields with no ServiceTitan mapping (for example, credit limit, price levels, finance-charge settings, salesperson, markup code, and UDFs). Manually maintained Spectrum values should therefore be preserved unless they are in the approved ServiceTitan-owned mapping.
   Why it matters: Spectrum documents these customer fields as updateable, but it does not define which application owns each business value. This model limits overwrites to data that the issue explicitly makes ServiceTitan responsible for.
   Implementation impact: Build the update payload from the approved mapped fields only, always supplying `Company_Code` and the existing `Customer_Code` as identifiers. Validate in test that omitted optional fields remain unchanged in Spectrum before production, because the documentation does not explicitly define partial-update/blank-value behavior.

### Matching and Idempotency

1. Please approve the exact first-name-plus-last-name fallback algorithm: source name fields, whitespace/punctuation removal, uppercase normalization, 10-character treatment, and collision behavior. Is a derived version of the ServiceTitan Customer ID approved as the collision suffix/key when needed?
   Why it matters: The stated fallback can collide, while Spectrum requires a unique 10-character uppercase/symbol-free code. ServiceTitan Customer ID is an `int64`, so it cannot be assumed to fit directly in the target field without evidence.
   Implementation impact: The map step must generate a reproducible code and stop/notify on a collision unless an approved collision-safe rule exists.

### Field Mapping and Required Defaults

1. Please provide the approved mapping from each ServiceTitan `paymentTermId` and term name to the corresponding Spectrum `Terms_Code` and description, including the fallback for a missing or unmapped value.
   Why it matters: `Terms_Code` is required by Spectrum and no mapping is supplied.
   Implementation impact: An unmapped term must be handled before the `AddCustomer` call; the workflow cannot safely invent a default.

2. What is the single default Spectrum `Company_Code` for all Stelco customers?
   Why it matters: The fixed-default approach is confirmed, but `AddCustomer` requires the actual valid three-character value.
   Implementation impact: Store the approved value as integration configuration; do not derive it from a ServiceTitan attribute.

3. What is the Spectrum tax-zone ID/code (`Sales_Tax_Code`) for the tax zone equivalent to ServiceTitan's `In-House Sales` tax zone?
   Why it matters: The ServiceTitan tax-zone ID is system-specific and cannot be used as the Spectrum code.
   Implementation impact: Store the supplied Spectrum code in the approved tax mapping and use it for customer creation/update.

### Exceptions, Notifications, and Acceptance

1. Should `aturner@stelco-electric.com` receive every failure email or only specific exception types? Please identify any additional recipients.
   Why it matters: Record-level failures will alert and continue, so the recipient list needs a clear owner.
   Implementation impact: Configure the approved recipients on app-step failure emails.


## Follow-Up Questions

### Related Project Context

1. The project description contains a generic Viewpoint Vista template alongside this Spectrum issue. Which shared requirements are explicitly valid for Spectrum, and which should be disregarded?
   Why it matters: Reusing Vista-specific assumptions could produce invalid Spectrum behavior.

## Suggested Assumptions To Confirm

- If no different instruction is provided, assume ServiceTitan is the source of truth only for the explicitly mapped customer fields; unmapped or Spectrum-managed fields are not sent on update.
- Customer-specific validation failures are alerted, logged, skipped, and not retried automatically; ambiguous duplicate matches are not auto-resolved.
- Service cost centers `1002`, `2002`, and `3002` do not affect customer selection, `Company_Code`, or `Sales_Tax_Code` in this workflow.

## Build-Readiness Checklist

- [x] Composite incremental checkpoint is confirmed (`updatedOn`, then Customer ID).
- [x] The integration-owned `externalData` entry is the cross-system key; fallback collision handling remains open.
- [x] Customer contact handling is confirmed; update-field ownership remains open.
- [ ] Field mapping, required defaults, and value translations are approved (tax-code intent is confirmed; customer-code, terms, and actual company code remain open).
- [x] Scheduled paginated processing uses a 50-record page size and the composite checkpoint.
- [x] Backfill cutoff date is confirmed (August 1).
- [x] Retry queue uses Gravity memory; transient failures retry hourly up to three times. Failure-email recipients remain open.
