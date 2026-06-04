# Gravity AI Build Prompt: Shopify Payout Reconciliation

Use this prompt in Gravity AI to build the workflow.

````text
You are building a Gravity workflow named "Shopify Payout Reconciliation".

Build a recurring, deterministic, idempotent payout-level reconciliation workflow that reads Shopify payouts and creates NetSuite Journal Entries. The workflow reconciles Shopify payout net amount, Shopify Payments fees, and Shopify Clearing. It must not reconcile individual orders inside a payout.

Important: do not use `legacyResourceId` anywhere. This field will not be available. Use Shopify payout `id` for idempotency and checkpoint tie-breaking.

Source-of-truth behavior:
- Create exactly one NetSuite Journal Entry per eligible Shopify payout.
- Eligible payout status is `PAID`.
- Idempotency key is `externalId = shopify_payout_[payout.id]`.
- JE date is the payout `issuedAt` date.
- JE memo is `Shopify payout reconciliation YYYY-MM-DD`.
- Closed NetSuite accounting periods must fail and alert. Do not move the JE to the next open period.
- Failure for one payout must not stop the rest of the batch.
- Send one batch summary alert at the end with created, skipped, and failed counts.

Build the workflow with this structure:

1. Scheduler Trigger
   - Use manual or daily cadence for validation.
   - Use hourly cadence for production once validated.

2. Resolve Store Config from Gravity Environment
   - The workflow must support:
     - Auto World Store: division `30`
     - Big Country Toys: division `40`
   - Fixed NetSuite header values:
     - subsidiary internalId `3`
     - currency internalId `1`
   - Approval status is not fully aligned with the client yet. If the connector requires it, use pending approval behavior. If the connector can omit it safely, omit it and leave a note.

3. Shopify Step: Search/Get Payouts
   - Use native Shopify connector/API step.
   - Fetch payouts from the current checkpoint window.
   - Required payout fields:
     - `id`
     - `issuedAt`
     - `status`
     - `transactionType` or equivalent if available
     - `net.amount`
     - `summary`
     - `currencyCode` if available
   - Filter to status `PAID` if the connector supports it.
   - Use pagination if the connector supports it.
   - Do not depend only on date for incremental processing; checkpoint should include `lastIssuedAt` and `lastPayoutId`.

4. Loop: For Each Payout
   - Each payout must be isolated.
   - Any payout-level failure should be logged and added to the final batch summary, then the loop should continue.

5. Map Step: Build Idempotency Key
   - Input: current payout.
   - Output:
     - `payoutId = payout.id`
     - `externalId = shopify_payout_${payout.id}`
   - Do not use memo or date for idempotency.
   - Do not use `legacyResourceId`.

6. NetSuite Step: Search Existing Journal Entry
   - Use native NetSuite connector/API step.
   - Search by `externalId`.
   - If a Journal Entry exists:
     - log result as `skipped_already_processed`
     - do not create another JE
     - continue to next payout

7. Map Step: Normalize Shopify Payout
   Use this JavaScript logic as the basis:

   ```javascript
   const payout = input.payout;
   const storeConfig = input.storeConfig;

   if (!payout?.id) {
     throw new Error("Missing Shopify payout id");
   }

   if (!payout?.issuedAt) {
     throw new Error(`Missing issuedAt for payout ${payout.id}`);
   }

   const issuedDate = String(payout.issuedAt).split("T")[0];
   const netAmountRaw = payout.net?.amount ?? payout.netAmount;

   if (netAmountRaw === undefined || netAmountRaw === null || netAmountRaw === "") {
     throw new Error(`Missing net amount for payout ${payout.id}`);
   }

   return {
     payoutId: payout.id,
     externalId: `shopify_payout_${payout.id}`,
     issuedAt: payout.issuedAt,
     issuedDate,
     memo: `Shopify payout reconciliation ${issuedDate}`,
     status: payout.status || null,
     transactionType: payout.transactionType || payout.type || null,
     currencyCode: payout.currencyCode || null,
     netAmount: Number(netAmountRaw),
     summary: payout.summary || {},
     storeConfig
   };
   ```

8. Map Step: Calculate Accounting Values
   Requirements:
   - Include all `summary` fields whose key ends with `Fee` or `Fees`.
   - Include `advanceFees`.
   - Exclude `refundsFeeGross`.
   - Convert signed amounts into debit/credit sides.
   - Never send negative debit or credit values.
   - Omit zero-amount lines.
   - Block JE creation if debits and credits do not balance after rounding to cents.

   Use this JavaScript logic as the basis:

   ```javascript
   const summary = input.summary || {};

   const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100;

   const feeTotal = Object.entries(summary)
     .filter(([key]) => (key.endsWith("Fee") || key.endsWith("Fees")) && key !== "refundsFeeGross")
     .reduce((sum, [, value]) => {
       return sum + Number(value?.amount ?? value ?? 0);
     }, 0);

   const netAmount = Number(input.netAmount || 0);
   const clearingSignedAmount = -(netAmount + feeTotal);

   function toJournalLine(account, signedAmount, memo, extra = {}) {
     const amount = roundMoney(Math.abs(Number(signedAmount || 0)));
     if (amount === 0) return null;

     if (signedAmount >= 0) {
       return { account, debit: amount, memo, ...extra };
     }

     return { account, credit: amount, memo, ...extra };
   }

   const lines = [
     toJournalLine("1095", netAmount, input.memo),
     toJournalLine("8616", feeTotal, input.memo, { department: "810" }),
     toJournalLine("1099", clearingSignedAmount, input.memo)
   ].filter(Boolean);

   const totalDebits = roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
   const totalCredits = roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
   const isBalanced = totalDebits === totalCredits;

   if (!isBalanced) {
     throw new Error(
       `Unbalanced journal entry for payout ${input.payoutId}: debits ${totalDebits}, credits ${totalCredits}`
     );
   }

   return {
     ...input,
     feeTotal: roundMoney(feeTotal),
     clearingAmount: roundMoney(Math.abs(clearingSignedAmount)),
     clearingSignedAmount: roundMoney(clearingSignedAmount),
     lines,
     totalDebits,
     totalCredits,
     isBalanced
   };
   ```

9. Map Step: Build NetSuite Journal Entry Payload
   Requirements:
   - Header:
     - `externalId`: from payout id
     - `subsidiary`: `3`
     - `currency`: `1`
     - `division`: from environment store config
     - `tranDate`: payout issued date
     - `memo`: payout memo
   - Lines:
     - `1095`: East West Receivables, net payout amount
     - `8616`: Credit Card Fees, department `810`, fee amount
     - `1099`: Shopify Clearing, clearing offset

   Use this JavaScript logic as the basis, adjusting only field names to match the NetSuite connector schema:

   ```javascript
   if (!input.isBalanced) {
     throw new Error(`Unbalanced journal entry for payout ${input.payoutId}`);
   }

   const payload = {
     externalId: input.externalId,
     subsidiary: "3",
     currency: "1",
     division: input.storeConfig.division,
     tranDate: input.issuedDate,
     memo: input.memo,
     lines: input.lines
   };

   if (input.storeConfig.approvalStatus) {
     payload.approvalStatus = input.storeConfig.approvalStatus;
   }

   return payload;
   ```

10. NetSuite Step: Create Journal Entry
    - Use native NetSuite connector first.
    - Create the Journal Entry from the payload.
    - Preserve `externalId`.
    - Preserve line-level department `810` on the fee line.
    - If native connector cannot support externalId, line items, department, or required header fields, stop and report that a SuiteScript fallback is required.

11. Logging
    Log one structured result per payout with:
    - `store`
    - `payoutId`
    - `externalId`
    - `issuedAt`
    - `issuedDate`
    - `status`
    - `transactionType`
    - `currencyCode`
    - `netAmount`
    - `feeTotal`
    - `clearingAmount`
    - `journalEntryId` when created
    - `resultStatus`
    - `errorStep`
    - `errorMessage`

12. Batch Summary Alert
    At the end of the run, send one summary with:
    - total payouts fetched
    - total eligible payouts
    - created count
    - skipped count
    - failed count
    - failed payout ids with error messages

13. Checkpoint
    Persist checkpoint after processing decisions are recorded:
    - `lastIssuedAt`
    - `lastPayoutId`
    Use payout id as the tie-breaker when multiple payouts share the same issue date.

Validation scenarios to test before production:

1. Deposit simple
   - `netAmount > 0`
   - one eligible fee
   - expected lines:
     - Debit `1095` for net amount
     - Debit `8616` department `810` for fee total
     - Credit `1099` for net amount plus fees

2. Deposit with multiple fees
   - include multiple fields ending in `Fee` or `Fees`
   - include `advanceFees`
   - exclude `refundsFeeGross`
   - JE must balance

3. Withdrawal
   - `netAmount < 0`
   - debit/credit side determined by sign
   - no negative debit or credit values
   - validate with a real Shopify payout sample before production sign-off

4. Duplicate payout
   - existing JE found by `externalId = shopify_payout_[payout.id]`
   - workflow skips creation

5. Invalid payout
   - missing `issuedAt` or missing net amount
   - payout fails locally
   - batch continues

6. Closed NetSuite period
   - NetSuite rejects transaction date
   - payout fails and appears in batch summary
   - transaction date is not changed

Do not build:
- order-level reconciliation
- Cash Sale/order workflow changes
- next-open-period posting
- duplicate JE correction/recreation
- any logic that depends on `legacyResourceId`
````
