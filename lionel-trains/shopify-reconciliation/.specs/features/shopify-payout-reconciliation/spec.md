# Shopify Payout Reconciliation Specification

## Problem Statement

The Shopify to NetSuite integration needs a recurring payout-level reconciliation workflow in Gravity. Shopify order flows are expected to post Cash Sale accounting into `Shopify Clearing #1099`; this workflow clears that accumulated balance when Shopify Payments payouts are issued by creating one NetSuite `Journal Entry` per eligible payout.

The workflow must be deterministic, idempotent, and accounting-oriented. It should reconcile the payout net amount, Shopify Payments fees, and the clearing account without attempting order-level matching inside the payout.

## Goals

- [ ] Create exactly one NetSuite `Journal Entry` for each eligible Shopify payout.
- [ ] Reconcile payout net deposits, Shopify Payments fees, and Shopify clearing balance.
- [ ] Prevent duplicate journal entries across reruns using a stable `externalId`.
- [ ] Process failures per payout so one bad payout does not block the full batch.
- [ ] Produce enough logging and alerting for accounting and operations review.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Order-level payout reconciliation | Confirmed scope is aggregate payout-level reconciliation. |
| Changes to the order/Cash Sale workflow | This workflow depends on the order flow but does not modify it. |
| Automatic posting into the next open accounting period | Closed periods should fail and alert so accounting can decide the correction. |
| Final approval-status policy | Client alignment is still pending; use provisional pending approval behavior. |
| Recreating or correcting existing journal entries | Idempotency requires skipping already processed payouts. Corrections are handled outside this v1 workflow. |

---

## User Stories

### P1: Reconcile Eligible Shopify Payouts

**User Story**: As an accounting operator, I want eligible Shopify payouts converted into NetSuite journal entries so that Shopify clearing is reduced when payouts are issued.

**Why P1**: This is the core workflow outcome and the minimum useful vertical slice.

**Acceptance Criteria**:

1. WHEN the workflow runs for `Auto World Store` or `Big Country Toys` THEN the system SHALL fetch Shopify payouts for the active Gravity environment.
2. WHEN a payout has status `PAID` and has not already been processed THEN the system SHALL create one NetSuite `Journal Entry` for that payout.
3. WHEN a payout does not have status `PAID` THEN the system SHALL not create a `Journal Entry`.
4. WHEN a payout is processed THEN the system SHALL set the JE date to the payout `issuedAt` date.
5. WHEN a payout is processed THEN the system SHALL set the memo to `Shopify payout reconciliation YYYY-MM-DD`.

**Independent Test**: Run the workflow against one paid sandbox payout and confirm a single NetSuite JE is created with the expected date, memo, header fields, and accounting lines.

---

### P1: Prevent Duplicate Journal Entries

**User Story**: As an accounting operator, I want reruns to skip payouts that already have journal entries so that the workflow can be safely retried.

**Why P1**: Idempotency is required for a recurring financial workflow.

**Acceptance Criteria**:

1. WHEN processing a payout THEN the system SHALL search NetSuite for an existing JE by `externalId`.
2. WHEN generating the idempotency key THEN the system SHALL use `externalId = shopify_payout_[payout.id]`.
3. WHEN an existing JE is found THEN the system SHALL skip creation and log `skipped_already_processed`.
4. WHEN no existing JE is found THEN the system SHALL continue with normalization, calculation, and creation.

**Independent Test**: Run the same payout twice and confirm the second run does not create a second JE.

---

### P1: Calculate Balanced Accounting Lines

**User Story**: As an accounting operator, I want payout values mapped into balanced debit and credit lines so that NetSuite journal entries are valid and reconcilable.

**Why P1**: The workflow must produce correct accounting entries before it can be trusted in production.

**Acceptance Criteria**:

1. WHEN calculating fees THEN the system SHALL sum eligible `summary` fields whose names end with `Fee` or `Fees`.
2. WHEN calculating fees THEN the system SHALL include `advanceFees` when present.
3. WHEN calculating fees THEN the system SHALL exclude `refundsFeeGross`.
4. WHEN building JE lines THEN the system SHALL use `East West Receivables #1095` for the payout net amount.
5. WHEN building JE lines THEN the system SHALL use `Credit Card Fees #8616` with department `#810` for fees.
6. WHEN building JE lines THEN the system SHALL use `Shopify Clearing #1099` for the clearing offset.
7. WHEN a signed amount is positive THEN the system SHALL send the absolute amount as a debit line.
8. WHEN a signed amount is negative THEN the system SHALL send the absolute amount as a credit line.
9. WHEN a line amount is zero THEN the system SHALL omit that line.
10. WHEN total debits do not equal total credits after rounding to cents THEN the system SHALL not create the JE and SHALL log a failure.

**Independent Test**: Validate one simple deposit, one deposit with multiple eligible fees, and one withdrawal sample if available.

---

### P1: Build NetSuite Journal Entry Payload

**User Story**: As an integration maintainer, I want a predictable NetSuite payload so that the native connector or fallback implementation can create the JE consistently.

**Why P1**: NetSuite field mapping must be stable before the workflow can be validated.

**Acceptance Criteria**:

1. WHEN creating a JE THEN the system SHALL set `subsidiary` to internal ID `3`.
2. WHEN creating a JE THEN the system SHALL set `currency` to internal ID `1`.
3. WHEN processing `Auto World Store` THEN the system SHALL set `division` to `30`.
4. WHEN processing `Big Country Toys` THEN the system SHALL set `division` to `40`.
5. WHEN approval status is required by NetSuite or the connector THEN the system SHALL use provisional pending approval behavior until the client confirms the final policy.
6. WHEN the native NetSuite connector supports the required header fields, line items, department, and `externalId` THEN the workflow SHALL use the native connector.
7. WHEN the native NetSuite connector cannot support required fields reliably THEN implementation SHALL use a SuiteScript fallback.

**Independent Test**: Create a sandbox JE and confirm the header fields, line fields, and `externalId` match the spec.

---

### P1: Handle Payout Errors Without Blocking the Batch

**User Story**: As an operations user, I want failed payouts isolated and visible so that the workflow can continue processing other payouts and I can address failures later.

**Why P1**: Financial integrations must be resilient to malformed data, closed periods, and connector failures.

**Acceptance Criteria**:

1. WHEN one payout fails THEN the system SHALL continue processing the next payout.
2. WHEN a payout is missing `issuedAt` THEN the system SHALL fail that payout and log the error.
3. WHEN a payout is missing a net amount THEN the system SHALL fail that payout and log the error.
4. WHEN NetSuite rejects creation due to a closed accounting period THEN the system SHALL fail that payout and include it in the batch alert.
5. WHEN a connector permission or API error occurs THEN the system SHALL log the failed step, payout identifier, and error message.
6. WHEN the run completes THEN the system SHALL produce one batch summary alert with created, skipped, and failed counts.

**Independent Test**: Run a batch containing one valid payout and one invalid payout; confirm the valid payout is created and the invalid payout is logged in the batch summary.

---

### P2: Incremental Checkpointing

**User Story**: As an integration maintainer, I want payout searches to be incremental so that recurring runs avoid unnecessary reprocessing while still being safe around date ties.

**Why P2**: Idempotency protects correctness, but checkpointing improves operational efficiency and reduces connector load.

**Acceptance Criteria**:

1. WHEN a run completes successfully for processed decisions THEN the system SHALL persist `lastIssuedAt`.
2. WHEN a run completes successfully for processed decisions THEN the system SHALL persist `lastPayoutId`.
3. WHEN searching for payouts THEN the system SHALL use the checkpoint to define the next fetch window.
4. WHEN multiple payouts share the same issue date THEN the system SHALL use payout ID as a tie-breaker to avoid missing payouts.

**Independent Test**: Run two batches with overlapping issue dates and confirm no eligible payout is missed or duplicated.

---

### P2: Structured Observability

**User Story**: As an accounting or operations user, I want structured logs for each payout so that reconciliation runs can be audited and failures can be investigated.

**Why P2**: Logs are needed for support, auditability, and go-live confidence.

**Acceptance Criteria**:

1. WHEN a payout is processed THEN the system SHALL log `store`, `payoutId`, `externalId`, `issuedAt`, `issuedDate`, `status`, and `transactionType`.
2. WHEN a payout is calculated THEN the system SHALL log `currencyCode`, `netAmount`, `feeTotal`, and `clearingAmount`.
3. WHEN a JE is created THEN the system SHALL log the NetSuite `journalEntryId`.
4. WHEN a payout is skipped or fails THEN the system SHALL log `resultStatus`, `errorStep`, and `errorMessage` where applicable.
5. WHEN the run completes THEN the system SHALL send a batch summary alert rather than one alert per failed payout.

**Independent Test**: Inspect one successful run and one failed run and confirm the expected fields are present.

---

## Edge Cases

- WHEN Shopify returns a payout without `issuedAt` THEN the system SHALL fail the payout before JE payload construction.
- WHEN Shopify returns a payout without a valid net amount THEN the system SHALL fail the payout before accounting calculation.
- WHEN Shopify returns a non-`PAID` payout THEN the system SHALL not create a JE.
- WHEN calculated fees include `refundsFeeGross` in the summary THEN the system SHALL exclude that field from fee total.
- WHEN a payout is a withdrawal with negative net amount THEN the system SHALL assign debit and credit sides based on signed amounts.
- WHEN debits and credits differ after cent rounding THEN the system SHALL block NetSuite creation.
- WHEN NetSuite returns a closed-period error THEN the system SHALL fail and alert rather than changing the transaction date.
- WHEN a payout fails in a batch THEN the system SHALL continue the loop for remaining payouts.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| SPR-01 | P1: Reconcile Eligible Shopify Payouts | Design | Pending |
| SPR-02 | P1: Reconcile Eligible Shopify Payouts | Design | Pending |
| SPR-03 | P1: Prevent Duplicate Journal Entries | Design | Pending |
| SPR-04 | P1: Prevent Duplicate Journal Entries | Design | Pending |
| SPR-05 | P1: Calculate Balanced Accounting Lines | Design | Pending |
| SPR-06 | P1: Calculate Balanced Accounting Lines | Design | Pending |
| SPR-07 | P1: Calculate Balanced Accounting Lines | Design | Pending |
| SPR-08 | P1: Build NetSuite Journal Entry Payload | Design | Pending |
| SPR-09 | P1: Handle Payout Errors Without Blocking the Batch | Design | Pending |
| SPR-10 | P1: Handle Payout Errors Without Blocking the Batch | Design | Pending |
| SPR-11 | P2: Incremental Checkpointing | Design | Pending |
| SPR-12 | P2: Structured Observability | Design | Pending |

**Coverage**: 12 total, 12 mapped to stories, 0 unmapped.

---

## Success Criteria

- [ ] A paid Shopify payout creates exactly one balanced NetSuite `Journal Entry`.
- [ ] A rerun of the same payout creates no duplicate JE.
- [ ] Deposit accounting matches: debit `1095`, debit `8616 department 810`, credit `1099`.
- [ ] Withdrawal accounting uses sign-based debit/credit sides and no negative JE line values.
- [ ] The workflow blocks unbalanced payloads before NetSuite creation.
- [ ] A closed-period NetSuite error fails and alerts without changing the JE date.
- [ ] One invalid payout does not stop the rest of the batch.
- [ ] Batch summary alert reports created, skipped, and failed payout counts.

## Open Decisions

| Decision | Current Default | Reason |
| --- | --- | --- |
| Final NetSuite `approvalStatus` | Pending approval | Client alignment is still open. |
| Additional required NetSuite fields such as `location` or `class` | None unless sandbox connector requires them | Not confirmed in source document. |
| Withdrawal production enablement | Validate with real sample before sign-off | Source document explicitly calls out withdrawal sample as pending. |
