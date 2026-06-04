# Gravity AI Fix Prompt: Use SuiteScript for NetSuite Search and Journal Entry Creation

Use this prompt in Gravity AI to fix the existing workflow.

````text
You are editing the existing Gravity workflow named "Shopify to NetSuite - Shopify Payout Reconciliation".

Fix only the NetSuite implementation approach. Do not rebuild the full workflow. Do not change Shopify payout fetching, checkpoint logic, accounting calculations, account mappings, batch summary, or alerting unless a downstream reference must be updated because the NetSuite step output shape changes.

Current problem:
- Step 6 "NetSuite: Search Existing JE by ExternalId" uses SuiteQL/SQL to search for an existing Journal Entry.
- NetSuite interactions for this workflow should use SuiteScript, not SuiteQL/SQL.
- Step 12 should remain a SuiteScript Journal Entry creation step, but harden it so the payload is validated and it uses SuiteScript record APIs consistently.

Required behavior:
- Replace Step 6 SuiteQL with a NetSuite "Execute Custom SuiteScript Code" step.
- Step 6 must search for an existing Journal Entry by `externalId` using SuiteScript search APIs.
- Step 7 must continue to branch based on whether Step 6 found an existing JE.
- Step 12 must create the Journal Entry using SuiteScript record APIs.
- Do not use SQL, SuiteQL, or raw query strings for NetSuite duplicate detection or Journal Entry creation.
- Do not use `legacyResourceId`; idempotency remains `externalId = shopify_payout_${payout.id}`.

NetSuite steps to fix:

1. Replace Step 6 "NetSuite: Search Existing JE by ExternalId"
   - Current action: SuiteQL Query.
   - New action: Execute Custom SuiteScript Code.
   - Input Data should be the Step 5 idempotency object, or at minimum the external ID string.
   - The input should look like:

   ```javascript
   return JSON.stringify({
     externalId: steps.fcnZYyTVE3Sm.externalId,
     payoutId: steps.fcnZYyTVE3Sm.payoutId
   });
   ```

   Adapt the step IDs to the actual Gravity step IDs in the workflow.

2. Use this SuiteScript logic for Step 6
   - This script searches NetSuite transactions using SuiteScript search APIs.
   - It returns a normalized object with `found`, `items`, and `existingJournalEntry`.
   - Keep the output shape friendly for Step 7.

   ```javascript
   (function() {
     var payload = (typeof inputData === 'string') ? JSON.parse(inputData) : (inputData || {});
     var externalId = payload.externalId;

     if (!externalId) {
       throw new Error('Missing externalId for Journal Entry duplicate search');
     }

     var results = [];

     var jeSearch = search.create({
       type: search.Type.TRANSACTION,
       filters: [
         ['type', 'anyof', 'Journal'],
         'AND',
         ['mainline', 'is', 'T'],
         'AND',
         ['externalidstring', 'is', externalId]
       ],
       columns: [
         search.createColumn({ name: 'internalid' }),
         search.createColumn({ name: 'externalid' }),
         search.createColumn({ name: 'trandate' }),
         search.createColumn({ name: 'memo' })
       ]
     });

     jeSearch.run().each(function(result) {
       results.push({
         internalId: result.getValue({ name: 'internalid' }),
         externalId: result.getValue({ name: 'externalid' }),
         tranDate: result.getValue({ name: 'trandate' }),
         memo: result.getValue({ name: 'memo' })
       });

       return results.length < 1;
     });

     return {
       found: results.length > 0,
       items: results,
       existingJournalEntry: results.length > 0 ? results[0] : null,
       payoutId: payload.payoutId || null,
       externalId: externalId
     };
   }());
   ```

   If the Gravity NetSuite custom SuiteScript step requires explicit module loading instead of injected `search`, keep the same logic but wrap it using the syntax supported by the action. The final behavior and returned object must stay the same.

3. Update Step 7 "If JE Already Exists"
   - It should no longer check SuiteQL `items` from a SQL result.
   - It should check the SuiteScript Step 6 output.
   - Preferred condition:
     - Field: Step 6 `found`
     - Operator: equals
     - Value: `true`
   - Alternative if Gravity cannot branch on booleans:
     - Field: Step 6 `items`
     - Operator: is not empty
   - THEN branch remains "skip".
   - ELSE branch remains "create JE".

4. Update Step 8 "Log: Skipped"
   - Read the existing JE from Step 6 SuiteScript output.
   - Include `existingJournalEntry.internalId` as `journalEntryId` if available.
   - Keep `resultStatus = "skipped_already_processed"`.

   Use this output mapping behavior:

   ```javascript
   const payout = inputData["TLNiug9cjVCa"];
   const idempotency = inputData["fcnZYyTVE3Sm"] || {};
   const nsSearch = inputData["STEP_6_SUITE_SCRIPT_OUTPUT"] || {};
   const existingJe = nsSearch.existingJournalEntry || (nsSearch.items || [])[0] || null;
   const storeConfigStep = inputData["MJ4MVcXzrpvq"] || [];
   const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};

   return [{
     store: storeConfig.storeName || "unknown",
     payoutId: payout?.id || idempotency.payoutId || nsSearch.payoutId || "unknown",
     externalId: idempotency.externalId || nsSearch.externalId || "unknown",
     issuedAt: payout?.issuedAt || null,
     issuedDate: payout?.issuedAt ? String(payout.issuedAt).split("T")[0] : null,
     status: payout?.status || null,
     transactionType: payout?.transactionType || payout?.type || null,
     currencyCode: payout?.currencyCode || payout?.net?.currencyCode || null,
     netAmount: Number(payout?.netAmount || payout?.net?.amount || 0),
     feeTotal: null,
     clearingAmount: null,
     journalEntryId: existingJe?.internalId || null,
     resultStatus: "skipped_already_processed",
     errorStep: null,
     errorMessage: null
   }];
   ```

   Replace `STEP_6_SUITE_SCRIPT_OUTPUT` with the real Gravity step ID.

5. Keep Step 11 "Build NetSuite JE Payload"
   - Step 11 may remain a Map step that creates the payload for SuiteScript.
   - Payload shape should be:

   ```javascript
   {
     externalId: "...",
     subsidiary: { id: "3" },
     currency: { id: "1" },
     tranDate: "YYYY-MM-DD",
     memo: "Shopify payout reconciliation YYYY-MM-DD",
     department: { id: "30" } or { id: "40" },
     approvalStatus: optional,
     line: [
       { account: { id: "1095" }, debit: 980, memo: "..." },
       { account: { id: "8616" }, debit: 20, memo: "...", department: { id: "810" } },
       { account: { id: "1099" }, credit: 1000, memo: "..." }
     ]
   }
   ```

6. Harden Step 12 "NetSuite: Create Journal Entry"
   - Keep it as "Execute Custom SuiteScript Code".
   - Do not replace it with a SQL/SuiteQL action.
   - Use SuiteScript `record.create`, `setValue`, `selectNewLine`, `setCurrentSublistValue`, `commitLine`, and `save`.
   - Validate the payload before creating the record.
   - Return a normalized object with:
     - `id`
     - `type`
     - `externalId`
     - `tranDate`
     - `memo`

   Use this SuiteScript logic as the basis, adapting only syntax required by the Gravity NetSuite action:

   ```javascript
   (function() {
     var payload = (typeof inputData === 'string') ? JSON.parse(inputData) : (inputData || {});

     function getId(value) {
       if (value && typeof value === 'object' && value.id !== undefined) return value.id;
       return value;
     }

     function requireValue(name, value) {
       if (value === undefined || value === null || value === '') {
         throw new Error('Missing required Journal Entry field: ' + name);
       }
     }

     requireValue('externalId', payload.externalId);
     requireValue('subsidiary', getId(payload.subsidiary));
     requireValue('currency', getId(payload.currency));
     requireValue('tranDate', payload.tranDate);
     requireValue('memo', payload.memo);

     var lines = payload.line || payload.lines || [];
     if (!Array.isArray(lines) || lines.length < 2) {
       throw new Error('Journal Entry payload must include at least two lines');
     }

     var totalDebits = 0;
     var totalCredits = 0;

     for (var i = 0; i < lines.length; i++) {
       var line = lines[i];
       requireValue('line[' + i + '].account', getId(line.account));

       var debit = Number(line.debit || 0);
       var credit = Number(line.credit || 0);

       if (debit < 0 || credit < 0) {
         throw new Error('Journal Entry line amounts cannot be negative');
       }

       if (debit > 0 && credit > 0) {
         throw new Error('Journal Entry line cannot have both debit and credit');
       }

       if (debit === 0 && credit === 0) {
         throw new Error('Journal Entry line must have either debit or credit');
       }

       totalDebits += debit;
       totalCredits += credit;
     }

     totalDebits = Math.round(totalDebits * 100) / 100;
     totalCredits = Math.round(totalCredits * 100) / 100;

     if (totalDebits !== totalCredits) {
       throw new Error('Journal Entry is unbalanced: debits ' + totalDebits + ', credits ' + totalCredits);
     }

     var jeRecord = record.create({
       type: record.Type.JOURNAL_ENTRY,
       isDynamic: true
     });

     jeRecord.setValue({ fieldId: 'externalid', value: payload.externalId });
     jeRecord.setValue({ fieldId: 'subsidiary', value: getId(payload.subsidiary) });
     jeRecord.setValue({ fieldId: 'currency', value: getId(payload.currency) });
     jeRecord.setValue({ fieldId: 'trandate', value: new Date(payload.tranDate) });
     jeRecord.setValue({ fieldId: 'memo', value: payload.memo });

     if (payload.department) {
       jeRecord.setValue({ fieldId: 'department', value: getId(payload.department) });
     }

     if (payload.approvalStatus !== undefined && payload.approvalStatus !== null && payload.approvalStatus !== '') {
       jeRecord.setValue({ fieldId: 'approvalstatus', value: String(payload.approvalStatus) });
     }

     for (var j = 0; j < lines.length; j++) {
       var currentLine = lines[j];

       jeRecord.selectNewLine({ sublistId: 'line' });
       jeRecord.setCurrentSublistValue({
         sublistId: 'line',
         fieldId: 'account',
         value: getId(currentLine.account)
       });

       if (Number(currentLine.debit || 0) > 0) {
         jeRecord.setCurrentSublistValue({
           sublistId: 'line',
           fieldId: 'debit',
           value: Number(currentLine.debit)
         });
       }

       if (Number(currentLine.credit || 0) > 0) {
         jeRecord.setCurrentSublistValue({
           sublistId: 'line',
           fieldId: 'credit',
           value: Number(currentLine.credit)
         });
       }

       if (currentLine.memo) {
         jeRecord.setCurrentSublistValue({
           sublistId: 'line',
           fieldId: 'memo',
           value: currentLine.memo
         });
       }

       if (currentLine.department) {
         jeRecord.setCurrentSublistValue({
           sublistId: 'line',
           fieldId: 'department',
           value: getId(currentLine.department)
         });
       }

       jeRecord.commitLine({ sublistId: 'line' });
     }

     var jeId = jeRecord.save({
       enableSourcing: true,
       ignoreMandatoryFields: false
     });

     return {
       id: String(jeId),
       type: 'journalentry',
       externalId: payload.externalId,
       tranDate: payload.tranDate,
       memo: payload.memo
     };
   }());
   ```

   If your Gravity NetSuite custom SuiteScript action requires the syntax from the provided working example, adapt the wrapper syntax only. Preserve the validation, field IDs, line behavior, and returned object.

7. Update Step 13 "Log Payout Result"
   - Read Step 6 duplicate search output from the new SuiteScript step.
   - Read Step 12 create output from the SuiteScript create step.
   - A created payout is detected by Step 12 `id`.
   - A skipped payout is detected by Step 8 `resultStatus = skipped_already_processed`.
   - If Step 12 returns or throws an error, log:
     - `resultStatus = "failed"`
     - `errorStep = "NetSuite: Create Journal Entry"`
     - `errorMessage = the SuiteScript error message`

Do not make these changes:
- Do not use SuiteQL.
- Do not use SQL strings.
- Do not create the Journal Entry through a generic REST insert action.
- Do not change Shopify payout filtering.
- Do not change the calculated accounting lines.
- Do not change these account mappings:
  - `1095` East West Receivables
  - `8616` Credit Card Fees with department `810`
  - `1099` Shopify Clearing
- Do not use `legacyResourceId`.

Acceptance checks after the fix:
- Step 6 action is "Execute Custom SuiteScript Code", not SuiteQL Query.
- Step 6 code contains `search.create`, not `SELECT`.
- Step 6 output contains `found`, `items`, `existingJournalEntry`, `externalId`, and `payoutId`.
- Step 7 branches from Step 6 `found === true` or Step 6 `items` not empty.
- Step 12 action is "Execute Custom SuiteScript Code".
- Step 12 code contains `record.create({ type: record.Type.JOURNAL_ENTRY`.
- Step 12 creates line sublist rows with `selectNewLine`, `setCurrentSublistValue`, and `commitLine`.
- No NetSuite step contains SuiteQL or SQL.
- Duplicate payout rerun skips creation.
- New payout creates a balanced Journal Entry and returns the JE internal ID.
````

