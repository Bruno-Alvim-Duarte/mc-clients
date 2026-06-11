# Seal Company - Acumatica 2025 R2 Upgrade Concerns

Date: 2026-06-04

Current Seal Acumatica version: 2024 R2

Target Acumatica version: 2025 R2

Primary integration surface: Acumatica custom web service endpoint `MindCloudIntegration`, endpoint version `1.0.0`, plus Acumatica push notifications/webhooks into Gravity workflows.

Primary source references:

- Acumatica 2025 R2 release page: https://www.acumatica.com/cloud-erp-software/2025-r2/
- Acumatica 2025 R2 release notes PDF: https://acumatica-builds.s3.amazonaws.com/builds/25.2/ReleaseNotes/AcumaticaERP_2025R2_ReleaseNotes.pdf
- Acumatica community note on 2025 R2 endpoint version: https://community.acumatica.com/isv-solutions-116/2025-acumatica-endpoint-version-29243

## Executive Summary

Modern UI by itself should not break Seal's API-only DAC custom fields. The larger risks are:

- The custom endpoint `MindCloudIntegration` must still expose the same entities and custom fields after upgrade.
- Acumatica push notification payloads must keep the same `Inserted` and `Deleted` shape and field aliases used by the Gravity workflows.
- Date-only REST behavior in 2025 R2 must not shift dates sent to HubSpot.
- Customization packages must be validated against 2025 R2.
- Business event/push notification behavior must be regression tested because Seal uses push events as primary triggers for orders, quotes, and opportunities.

Since Seal is on 2024 R2, Acumatica supports a direct upgrade to 2025 R2, but the upgraded instance should receive the latest 2025 R2 patch after upgrade.

Reference: Acumatica 2025 R2 release notes, `Installation and Upgrade Notes > Performing the Upgrade`.

## Workflow Inventory Reviewed

| Workflow | Direction | Trigger | Local reference |
|---|---|---|---|
| Acumatica to HubSpot - Sync Customers, Locations and Contacts | Acumatica to HubSpot | Schedule | [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml) |
| Acumatica to HubSpot - Sync Orders | Acumatica to HubSpot | Acumatica webhook | [workflow.yaml](Sync-Orders/workflow.yaml) |
| Acumatica to Hubspot - Sync Quotes | Acumatica to HubSpot | Acumatica webhook | [workflow.yaml](Sync-Quotes/workflow.yaml) |
| Acumatica to HubSpot - Sync Opportunities | Acumatica to HubSpot | Acumatica webhook | [workflow.yaml](Sync%20Opportunities/workflow.yaml) |
| HubSpot to Acumatica - Opportunity Creation | HubSpot to Acumatica | HubSpot webhook | [workflow.yaml](Opportunity-Creation/workflow.yaml) |

## Concerns And Required Checks

### 1. Custom Web Service Endpoint `MindCloudIntegration`

Severity: High

Seal is not using the Acumatica system Default endpoint directly in the Gravity Acumatica steps. The workflows use:

- Web Service Endpoint: `MindCloudIntegration`
- Endpoint Version: `1.0.0`

Local references:

- Customer sync fetches customers through `MindCloudIntegration`: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L53-L67)
- Customer sync fetches `CustomerLocation`: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L271-L287)
- Customer sync fetches `Contact`: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L418-L429)
- Opportunity sync fetches `Opportunity`: [workflow.yaml](Sync%20Opportunities/workflow.yaml#L154-L166)
- Opportunity creation writes `Contact`, `Customer`, and `Opportunity`: [workflow.yaml](Opportunity-Creation/workflow.yaml#L384-L427)

Concern:

Acumatica 2025 R2 introduces the new system endpoint `Default/25.200.001`, but Seal depends on a custom endpoint. Custom endpoints usually survive upgrades, but field mappings, custom fields, entity actions, and nested expand paths must be validated after upgrade.

Required checks:

- Open `Web Service Endpoints (SM207060)` in the 2025 R2 sandbox.
- Validate `MindCloudIntegration` version `1.0.0` is present.
- Validate these entities still exist and return the same field names:
  - `Customer`
  - `CustomerLocation`
  - `Contact`
  - `Opportunity`
- Validate expands still work:
  - `MainContact`
  - `MainContact/Address`
  - `LocationContact`
  - `LocationContact/Address`
- Run schema/export comparison between 2024 R2 sandbox and 2025 R2 sandbox.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: Enhanced Capabilities with the New Endpoint Version`.
- Acumatica 2025 R2 release notes, `Installation and Upgrade Notes`, which warns that 2025 R2 changes may affect customizations and integrations.

### 2. DAC Custom Fields Used Through The API

Severity: High

Seal uses custom DAC fields to cross-reference HubSpot records:

- `UsrHSDealID` on `Opportunity`
- `UsrHSCompanyID` on `Customer`
- `UsrHSContactID` on `Contact`

Local references:

- `UsrHSDealID` is written in HubSpot-to-Acumatica opportunity creation: [workflow.yaml](Opportunity-Creation/workflow.yaml#L313-L317)
- `UsrHSDealID` is read from Acumatica opportunity fallback search: [workflow.yaml](Sync%20Opportunities/workflow.yaml#L172-L179)
- `UsrHSContactID` is written when creating/updating Acumatica contacts: [workflow.yaml](Opportunity-Creation/workflow.yaml#L363-L377)
- `UsrHSCompanyID` is written when creating/updating Acumatica customers: [workflow.yaml](Opportunity-Creation/workflow.yaml#L505-L516)

Concern:

Modern UI should not break DAC custom fields if they are API-only. The risk is that the customization package may not publish cleanly in 2025 R2, or the custom fields may not remain exposed in `MindCloudIntegration`.

Required checks:

- Validate the customization project publishes cleanly in 2025 R2.
- Confirm the custom fields exist in the DAC/database after upgrade.
- Confirm each field is exposed in the custom endpoint:
  - `Opportunity.UsrHSDealID`
  - `Customer.UsrHSCompanyID`
  - `Contact.UsrHSContactID`
- Test write and readback through the Gravity Acumatica connector or direct REST.

Reference:

- Acumatica 2025 R2 release notes, `Customization: The Modern UI Editor`.
- Acumatica 2025 R2 release notes, `Developer Documentation: Simplify Updating of Customization Projects with AI Tools`.
- Acumatica 2025 R2 release notes, `Installation and Upgrade Notes`.

### 3. Modern UI Impact On Customization Projects

Severity: Medium

Concern:

Modern UI is the new default user interface in 2025 R2. This does not directly change REST payloads, but it can affect:

- Custom fields that must appear on screens.
- JavaScript customizations that depend on Classic UI DOM/control IDs.
- Screen personalizations that users rely on.
- Screen configuration permissions and deployment.

Seal-specific assessment:

- API-only DAC fields should be low risk.
- Any custom field that users must view/edit on Acumatica screens must be tested in Modern UI.
- Any JavaScript customization in Seal's Acumatica customization packages must be reviewed separately.

Required checks:

- In 2025 R2 sandbox, open forms where Seal custom fields are used.
- Confirm users can see/edit fields where required.
- Confirm no JavaScript customization depends on Classic UI selectors.
- Confirm screen personalizations and custom screen configuration can be deployed.

Reference:

- Acumatica 2025 R2 release notes, `Platform: Experience the New Default Interface`.
- Acumatica 2025 R2 release notes, `Customization: Including Your Screen Personalizations in Customization Projects`.
- Acumatica 2025 R2 release notes, `Customization: The Modern UI Editor`.

### 4. Push Notification Payload Shape

Severity: High

Seal's Acumatica-to-HubSpot workflows assume Acumatica push notifications arrive with `body.Inserted[0]`.

Local references:

- Orders extract `body.Inserted[0]`: [workflow.yaml](Sync-Orders/workflow.yaml#L18-L28)
- Quotes extract `body.Inserted[0]`: [workflow.yaml](Sync-Quotes/workflow.yaml#L18-L29)
- Opportunities extract `body.Inserted[0]`: [workflow.yaml](Sync%20Opportunities/workflow.yaml#L18-L37)

Concern:

If the underlying Generic Inquiry, push notification, or business event changes its field aliases, event shape, or `Inserted`/`Deleted` structure after upgrade, the workflows may:

- Skip records.
- Fail to find HubSpot records.
- Create duplicate records.
- Fail loop prevention.

Required checks:

- In 2025 R2 sandbox, fire each Acumatica push notification and capture raw Gravity webhook payload.
- Compare payload field names against workflow expectations:
  - Order: `OrderNbr`, `Date`, `LineTotal`, `OpportunityID`, `Customer`, `Contact`, `Owner`
  - Quote: `OpportunityID`, `QuoteNbr`, `Status`, `Date`, `ExpirationDate`, `DetailTotal`, `Owner`, `Description`, `Primary`
  - Opportunity: `OpportunityID`, `BusinessAccount`, `Contact`, `Owner`, `Stage`, `DetailTotal`, `EstimatedCloseDate`, `DateCreated`, `LastModifiedDate`, `CROpportunity_noteID`, `Description`, `Owner_2`
- Confirm update events still include both `Inserted` and `Deleted` when expected.

Reference:

- Acumatica 2025 R2 release notes, `Platform: Business Events`.

### 5. Opportunity Loop Prevention Depends On `Deleted` Payload And Ignored Fields

Severity: High

The opportunity sync avoids loops by comparing `Inserted` and `Deleted` records and ignoring fields such as `LastModifiedDate`, `NoteID`, and `UsrHSDealID`.

Local reference:

- Loop detection logic: [workflow.yaml](Sync%20Opportunities/workflow.yaml#L55-L104)

Concern:

If 2025 R2 push notifications include additional changed system fields, the comparison may decide that a HubSpot ID-only update is not a loop echo. That could cause unnecessary HubSpot updates or repeated sync loops.

Required checks:

- Capture an Acumatica update where only `UsrHSDealID` changes.
- Confirm the workflow ends as loop echo and does not update HubSpot.
- Add any new system-only changed fields from 2025 R2 payloads to the ignore list if needed.

Reference:

- Acumatica 2025 R2 release notes, `Platform: Business Events`.

### 6. Date-Only Field Behavior In REST API

Severity: Medium

Acumatica 2025 R2 changes REST behavior for date-only fields: date-only fields return only the date without time and timezone, and values are stored as `yyyy-MM-dd`.

Seal maps date fields into HubSpot using JavaScript `new Date(...)`.

Local references:

- Order date conversion: [workflow.yaml](Sync-Orders/workflow.yaml#L77-L89)
- Quote date conversion: [workflow.yaml](Sync-Quotes/workflow.yaml#L103-L150)
- Opportunity date conversion to HubSpot: [workflow.yaml](Sync%20Opportunities/workflow.yaml#L391-L445)
- HubSpot close date conversion to Acumatica `Estimation`: [workflow.yaml](Opportunity-Creation/workflow.yaml#L284-L312)

Concern:

If Acumatica sends `yyyy-MM-dd` instead of a datetime string, JavaScript date parsing should still work, but timezone normalization can shift the effective date depending on runtime behavior and HubSpot's expected timestamp format.

Required checks:

- Test order `Date`.
- Test quote `Date` and `ExpirationDate`.
- Test opportunity `EstimatedCloseDate` and `DateCreated`.
- Confirm HubSpot date fields show the same calendar day as Acumatica.
- Confirm Acumatica opportunity `Estimation` accepts the HubSpot-converted ISO value.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: REST API Enhancements > Fields That Contain Only Dates`.

### 7. REST API Error Behavior For String Length/Input Masks

Severity: Medium

Acumatica 2025 R2 now returns HTTP `422` when strings submitted by REST do not match length or input mask.

Local references:

- HubSpot-to-Acumatica contact create/update payload: [workflow.yaml](Opportunity-Creation/workflow.yaml#L363-L383)
- HubSpot-to-Acumatica customer create/update payload: [workflow.yaml](Opportunity-Creation/workflow.yaml#L488-L516)
- HubSpot-to-Acumatica opportunity create/update payload: [workflow.yaml](Opportunity-Creation/workflow.yaml#L304-L318)

Concern:

HubSpot data can exceed Acumatica field lengths or not match masks. In 2025 R2, these failures may become stricter and return `422`.

Required checks:

- Test long company names, contact names, phone numbers, job titles, and website/domain values.
- Ensure Gravity failure handling catches Acumatica `422` responses clearly.
- Add truncation/validation in map steps if needed.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: REST API Enhancements > Error for Incorrect Strings`.

### 8. Business Account Locale Field Replacement

Severity: Low

Acumatica 2025 R2 replaced `BusinessAccount.MainContact.LanguageOrLocale` with `BusinessAccount.LocaleName`.

Seal-specific assessment:

No reviewed Seal workflow references `LanguageOrLocale`, so direct impact appears low.

Concern:

If the custom endpoint or hidden connector mapping includes `LanguageOrLocale`, it must be updated.

Required checks:

- Search/export `MindCloudIntegration` for `LanguageOrLocale`.
- If present, replace with `LocaleName` or remove if unused.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: Enhanced Capabilities with the New Endpoint Version > Locale Information of Business Accounts`.

### 9. Address Details Added In 25R2

Severity: Low to Medium

Acumatica 2025 R2 adds ISO 20022-style address fields to address-containing entities:

- `Department`
- `SubDepartment`
- `StreetName`
- `BuildingNumber`
- `BuildingName`
- `Floor`
- `UnitNumber`
- `PostBox`
- `Room`
- `TownLocationName`
- `DistrictName`

Seal currently maps standard address fields:

- `AddressLine1`
- `City`
- `State`
- `PostalCode`
- `Country`

Local references:

- Customer main contact address mapping to HubSpot: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L243-L255)
- Customer location address mapping to HubSpot: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L339-L361)
- HubSpot company address mapping to Acumatica customer: [workflow.yaml](Opportunity-Creation/workflow.yaml#L488-L502)

Concern:

The new address fields should not break existing standard fields, but expanded payloads should be validated.

Required checks:

- Confirm `MainContact/Address` still returns `addressLine1`, `city`, `state`, `postalCode`, and `country`.
- Confirm `LocationContact/Address` still returns the same fields.
- Confirm HubSpot-to-Acumatica customer writes still accept `AddressLine1`, `City`, `State`, `PostalCode`, and `Country`.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: Enhanced Capabilities with the New Endpoint Version > Address Details`.

### 10. Customer Sync Incremental Filter And Memory

Severity: Medium

Customer sync uses a memory-backed incremental filter:

```text
LastModifiedDateTime gt datetimeoffset'<LastSyncedDate>'
```

Local reference:

- Date filter construction: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L31-L52)
- Memory step exists for `LastSyncedDate`: [workflow.yaml](Sync-Customers-Locations-and-Contacts/workflow.yaml#L786-L788)

Concern:

After upgrade, confirm `LastModifiedDateTime` still exists in the custom endpoint and accepts the same `datetimeoffset` filter. Also confirm the workflow is actually persisting the intended sync timestamp after successful runs.

Required checks:

- Test with no memory value.
- Test with an existing `LastSyncedDate`.
- Confirm Acumatica returns only modified customers.
- Confirm no records are missed around the upgrade cutover.
- Consider setting a conservative pre-upgrade checkpoint and replay window during cutover.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: REST API Enhancements`.

### 11. Owner Mapping And Owner Field Aliases

Severity: Medium

Seal hardcodes Acumatica owner IDs/names to HubSpot owner IDs in multiple workflows.

Local references:

- Order owner mapping: [workflow.yaml](Sync-Orders/workflow.yaml#L235-L275)
- Quote owner mapping: [workflow.yaml](Sync-Quotes/workflow.yaml#L114-L155)
- Acumatica opportunity owner name mapping: [workflow.yaml](Sync%20Opportunities/workflow.yaml#L360-L424)
- HubSpot owner to Acumatica owner mapping: [workflow.yaml](Opportunity-Creation/workflow.yaml#L245-L294)

Concern:

This is not a known 2025 R2 breaking change, but it is brittle. The Acumatica opportunity webhook uses `Owner_2` as owner description. If the GI alias changes, HubSpot owner assignment will fail.

Required checks:

- Confirm opportunity push payload still includes `Owner` and `Owner_2`.
- Confirm order and quote payloads still include owner values in the expected ID format.
- Confirm all active Seal sales owners are still represented in the hardcoded mappings.

Reference:

- Local workflow dependency.
- Acumatica 2025 R2 release notes, `Platform: Business Events`.

### 12. Quote Primary Flag

Severity: Medium

Quote sync only updates HubSpot if `Primary` is true.

Local reference:

- Quote payload validation and primary flag: [workflow.yaml](Sync-Quotes/workflow.yaml#L18-L61)

Concern:

If Acumatica changes the data type or value representation of `Primary` in the push notification payload, primary quote updates may be skipped.

Required checks:

- Capture primary and non-primary quote webhooks in 2025 R2.
- Confirm `Primary` is boolean `true` or adjust condition logic.

Reference:

- Acumatica 2025 R2 release notes, `Platform: Business Events`.

### 13. Direct Order Matching Appears Incomplete

Severity: Medium

The order sync has a HubSpot search step for existing direct orders with an incomplete-looking filter value:

```yaml
value: "[{"
```

Local reference:

- Existing direct order search: [workflow.yaml](Sync-Orders/workflow.yaml#L174-L179)

Concern:

This is not caused by Acumatica 2025 R2, but upgrade regression testing may expose it. Direct orders without opportunity IDs may create duplicates if the existing direct-order search is invalid.

Required checks:

- Review and fix the direct order search filter before or during upgrade testing.
- Test an order without `OpportunityID`.

Reference:

- Local workflow dependency.

### 14. HubSpot-To-Acumatica Lock Handling

Severity: Medium

Opportunity Creation uses workflow memory `lockedKeys` to prevent concurrent/self-triggered processing.

Local references:

- Lock check: [workflow.yaml](Opportunity-Creation/workflow.yaml#L61-L85)
- Lock acquire: [workflow.yaml](Opportunity-Creation/workflow.yaml#L112-L132)
- Lock release: [workflow.yaml](Opportunity-Creation/workflow.yaml#L582-L610)

Concern:

If an Acumatica write fails after acquiring a lock and before release, the lock can remain in memory and block future runs for that HubSpot deal.

Required checks:

- Test Acumatica write failure path in 2025 R2.
- Confirm lock release happens after failures or define manual reset procedure.
- Add failure logging/email around Acumatica create/update steps if missing.

Reference:

- Local workflow dependency.
- Acumatica 2025 R2 release notes, `Web Services: REST API Enhancements > Error for Incorrect Strings`.

### 15. Long-Running REST Operations

Severity: Low to Medium

Acumatica 2025 R2 changes behavior while long-running operations are active for a form/session: other REST requests to the same form in the same session may fail until the operation completes.

Seal-specific assessment:

Seal workflows perform ordinary customer/contact/opportunity writes and searches. This is likely low risk unless connector sessions are reused while long-running Acumatica operations are active.

Required checks:

- During load testing, watch for failures when multiple writes happen close together.
- Confirm Gravity connector retries are adequate.

Reference:

- Acumatica 2025 R2 release notes, `Web Services: REST API Enhancements > Handling of Long-Running Operations`.

### 16. Business Event Synchronous Subscriber Processing

Severity: Low

Acumatica 2025 R2 adds synchronous processing capabilities for some business event subscriber behavior, but this is not automatically applied to existing business events that send emails.

Seal-specific assessment:

Seal uses webhook/push events rather than Acumatica email sending for the reviewed workflows.

Required checks:

- Confirm existing push notification subscribers remain asynchronous/operational.
- Confirm no business event configuration was unintentionally changed during upgrade.

Reference:

- Acumatica 2025 R2 release notes, `Platform: Business Events > Upgrade Notes`.

### 17. Snapshot And Tenant Copy Behavior With Custom Tables/UDFs

Severity: Medium

Acumatica 2025 R2 changes snapshot behavior:

- Related `KvExt` tables for UDF/multilanguage fields are excluded when their DAC table is excluded.
- Customization project files are included even in snapshot modes that exclude attachments.
- New `ITablesExcludingProvider` allows customization code to exclude tables from tenant copy/snapshot.

Concern:

If Seal's Acumatica customization package includes custom tables or UDF-heavy data, sandbox copy/restore behavior should be validated before relying on snapshots for upgrade testing.

Required checks:

- Create a 2025 R2 sandbox snapshot.
- Restore it to test environment.
- Confirm custom fields and customization project files are present.
- Confirm no custom table unique-key issues occur during tenant copy.

Reference:

- Acumatica 2025 R2 release notes, `System Administration: Smarter, Safer Snapshots`.
- Acumatica 2025 R2 release notes, `Platform API: Excluding Specific Database Tables When Copying a Tenant`.

### 18. Report Scheduling Removal

Severity: Low for reviewed Gravity workflows, potentially High for Seal operations

Acumatica 2025 R2 removes `Send Reports (SM205060)`.

Seal-specific assessment:

The reviewed Gravity workflows do not use Acumatica scheduled report sending. However, Seal operations may have month-end, invoice, statement, or sales reports scheduled in Acumatica.

Required checks:

- Search Acumatica for schedules created through `Send Reports (SM205060)`.
- Migrate schedules before/after upgrade per Acumatica KB guidance.

Reference:

- Acumatica 2025 R2 release notes, `Installation and Upgrade Notes > Optional: Migrating Schedules for Sending Reports`.

### 19. Authorize.Net Removed

Severity: Unknown for Seal; High if used

Acumatica 2025 R2 removes the Authorize.Net plug-in.

Seal-specific assessment:

No reviewed Gravity workflow uses Acumatica payment processing. This still needs a business/system check.

Required checks:

- Confirm whether Seal uses Authorize.Net in Acumatica.
- If yes, plan migration to Acumatica Payments or another supported provider.
- Confirm tokenized customer card data migration with Acumatica partner.

Reference:

- Acumatica 2025 R2 release notes, `Installation and Upgrade Notes > Switching to the Acumatica ERP Payments Plug-In`.

### 20. RabbitMQ Migration

Severity: Low to Medium

Acumatica 2025 R2 will transfer queues from Microsoft Message Queuing to RabbitMQ during upgrade, and RabbitMQ is becoming the sole supported broker.

Seal-specific assessment:

This is infrastructure-level, but push notifications/business events depend on queue processing.

Required checks:

- Confirm RabbitMQ is installed/configured after upgrade.
- Confirm system queue monitor is healthy.
- Confirm push notification events are delivered to Gravity after upgrade.

Reference:

- Acumatica 2025 R2 release notes, `Installation and Upgrade Notes > Switching From Microsoft Message Queuing to RabbitMQ Broker`.
- Acumatica 2025 R2 release notes, `System Administration: Master Your Cluster Queue Management`.

## Regression Test Plan

Run these tests in a 2025 R2 sandbox before production upgrade.

### Test 1. Custom Endpoint Schema

- Export or inspect `MindCloudIntegration` in 2024 R2 and 2025 R2.
- Confirm entities and fields used by Seal are present.
- Confirm custom fields are present.

### Test 2. Customer Sync

- Modify one customer in Acumatica.
- Run `Acumatica to HubSpot - Sync Customers, Locations and Contacts`.
- Confirm:
  - Parent company updated/created.
  - Child locations updated/created.
  - Contacts updated/created.
  - `LastModifiedDateTime` filter behaves correctly.
  - `MainContact/Address` and `LocationContact/Address` expands return expected fields.

### Test 3. Opportunity Sync From Acumatica

- Create or update one Acumatica opportunity.
- Confirm webhook payload contains expected fields.
- Confirm HubSpot deal is found by `acumatica_opportunity_id`.
- Confirm fallback by `UsrHSDealID` still works.
- Confirm loop echo detection works when only `UsrHSDealID` changes.

### Test 4. Opportunity Creation From HubSpot

- Create/update a HubSpot deal with a matching company/contact.
- Confirm Acumatica contact/customer/opportunity writes succeed.
- Confirm `UsrHSDealID`, `UsrHSContactID`, and `UsrHSCompanyID` write and read back.
- Confirm HubSpot receives the Acumatica opportunity/contact IDs.

### Test 5. Quote Sync

- Create/update a primary quote in Acumatica.
- Confirm webhook payload includes `Primary`, `OpportunityID`, `QuoteNbr`, `Date`, `ExpirationDate`, `DetailTotal`, `Owner`, and `Description`.
- Confirm HubSpot quote fields update.
- Repeat with non-primary quote and confirm workflow skips correctly.

### Test 6. Order Sync

- Create order with `OpportunityID`.
- Confirm HubSpot opportunity-linked deal updates.
- Create order without `OpportunityID`.
- Confirm direct-order search works and no duplicate deal is created.

### Test 7. Error Handling

- Submit intentionally oversized field values from HubSpot to Acumatica in sandbox.
- Confirm Gravity logs and emails clearly show Acumatica `422` errors.
- Confirm lock memory is released or manually recoverable after failures.

## Cutover Recommendations

1. Freeze Acumatica customization changes before sandbox upgrade.
2. Export `MindCloudIntegration` endpoint schema from 2024 R2.
3. Upgrade sandbox to 2025 R2 and install latest 2025 R2 patch.
4. Publish and validate customization projects.
5. Compare custom endpoint schema before/after upgrade.
6. Run the regression tests above.
7. Capture real webhook payloads for order, quote, and opportunity events.
8. Pause production Gravity workflows during production upgrade.
9. After production upgrade, run a small controlled sync before enabling all workflows.
10. Monitor Gravity logs and Acumatica queue monitor after go-live.
