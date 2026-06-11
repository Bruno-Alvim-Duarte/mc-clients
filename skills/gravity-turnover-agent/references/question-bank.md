# Gravity Turnover Question Bank

Use this bank to select relevant turnover questions. Do not ask every question by default. Prefer questions that expose missing implementation decisions.

## Source Read Filters

- What exact source records should be read?
- Which filters should be applied before processing records?
- Should records be filtered by subsidiary, division, location, status, tag, date, or another business attribute?
- Is there a cutoff date for going-forward processing?
- Should already-synced records be excluded through a tag, external ID, custom field, status, or lookup?
- Are there records that must never be processed even if they match the main criteria?

Implementation impact: filters determine the source query, batch size, checkpoint behavior, and risk of processing unintended records.

## Idempotency And Duplicate Prevention

- What value should uniquely identify the same record across systems?
- Before creating a destination record, how should the workflow search for an existing one?
- Should the workflow store the source ID in an external ID, custom field, memo, tag, mapping table, or another stable field?
- If an existing destination record is found, should the workflow update it, skip it, or fail for review?
- If two possible matches are found, should the workflow stop, skip, or notify a human?

Implementation impact: duplicate prevention defines the lookup/search step before creates and the create/update/skip branch.

## Field Mapping

- What is the approved field mapping from source to destination?
- Are there fields that need parsing, normalization, formatting, exchange-rate conversion, timezone conversion, or value translation?
- Which fields are required by the destination system?
- Which fields should never be overwritten after the destination record exists?
- Are there default values when the source field is empty?
- Are any destination fields derived from multiple source fields?
- Do we have sample source and destination records to validate the mapping?

Implementation impact: unclear mapping blocks payload construction and makes testing subjective.

## Pagination And Checkpoints

- Will the source query return more than one page of records?
- What page size should be used, if the API allows it?
- Which field should be used as the checkpoint: `createdAt`, `updatedAt`, issued date, internal ID, cursor, or another stable ordering value?
- Can multiple records share the same checkpoint timestamp?
- If records share the same timestamp, what tie-breaker should be used?
- Should the checkpoint update after each record, after each page, or only after the full batch succeeds?

Implementation impact: checkpoint decisions determine whether the workflow can resume safely without skipping or duplicating records.

## Backfill And Retroactive Processing

- Should historical records be processed, or only records created/updated after go-live?
- If backfill is required, what date range or record list should be included?
- Should backfill use the same workflow as incremental sync or a separate temporary workflow/run?
- Should backfill mark records as synced the same way as incremental processing?
- How should the workflow behave if historical data is incomplete or no longer matches current master data?

Implementation impact: backfill often needs different filters, checkpoint state, volume assumptions, and failure handling.

## Line Items And Item Matching

- If orders or transactions are created, how should line items be matched in the destination system?
- Is SKU the matching key, or should the workflow use item ID, UPC, variant ID, vendor SKU, or a custom field?
- What should happen when one or more items cannot be matched?
- Should the workflow create a partial order with matched items, skip the entire order, or fail before creating anything?
- Are discounts, shipping lines, tax lines, gift cards, refunds, and adjustments represented as items, accounts, or separate fields?
- Are item quantities, units of measure, locations, lots, bins, or serial numbers required?

Implementation impact: item matching determines whether record creation is all-or-nothing and prevents financially incorrect transactions.

## NetSuite Journal Entries

- What accounts should be used for each value type?
- Which lines are debit and which lines are credit?
- What subsidiary, currency, department, class, and location should be set?
- Should the Journal Entry use an external ID based on the source payout, settlement, order, or transaction?
- Are exchange rates required, and which system is the source of truth for the rate?
- Should the workflow create one Journal Entry per source record, per payout, per day, or per settlement batch?
- What memo, line memo, approval status, and posting period rules should apply?

Implementation impact: Journal Entry requirements must balance and must match accounting policy before implementation.

## Trigger, Cadence, And Volume

- Should the workflow run on a schedule, webhook, manual trigger, or another trigger?
- What is the maximum acceptable delay between source change and destination update?
- How many records are expected per day and at peak?
- Are there API rate limits, maintenance windows, or blackout periods?
- Should large batches be capped per run to avoid timeouts?

Implementation impact: cadence and volume determine batch size, pagination, retries, and whether schedule-only processing is acceptable.

## Create, Update, Delete, And Conflict Behavior

- Should the workflow create only, update only, or create and update?
- Should deletes/cancellations/voids be synced?
- If the destination record was manually changed, should the workflow overwrite it?
- Which system is the source of truth for each field?
- What should happen when the source and destination disagree?
- Are there statuses where records become locked and should no longer be updated?

Implementation impact: these answers define branching and prevent accidental overwrites.

## Nested Records And Child Objects

- Are addresses, contacts, fulfillment lines, payment lines, tax details, attachments, or subrecords involved?
- Should child records be created, updated, replaced, or appended?
- How should removed child records be handled?
- Does one source record map to multiple destination records?

Implementation impact: nested records often require separate lookup and mutation steps.

## Error Handling, Logs, And Notifications

- Which failures should stop the workflow?
- Which record-level failures can be skipped while the batch continues?
- Who should receive failure emails?
- What identifiers should appear in logs and failure emails?
- Should success logs be created for created, updated, skipped, or matched records?
- What retry behavior is acceptable before notifying a human?

Implementation impact: Gravity app steps should have explicit failure behavior, useful logs, and actionable failure emails.

## Access, Safety, And Test Data

- Which sandbox or production credentials should be used during build and testing?
- Can the integrator create test records in each system?
- Are there sample records that represent real edge cases?
- Are there sensitive fields that should not appear in logs or emails?
- Who must approve the final mapping and test results before go-live?

Implementation impact: access and test-data constraints affect validation and deployment timing.
