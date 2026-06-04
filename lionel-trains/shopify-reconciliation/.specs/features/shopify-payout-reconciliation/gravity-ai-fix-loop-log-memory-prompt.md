# Gravity AI Fix Prompt: Accumulate Loop Logs With Workflow Memory

Use this prompt in Gravity AI to fix the existing workflow.

````text
You are editing the existing Gravity workflow named "Shopify to NetSuite - Shopify Payout Reconciliation".

Fix only the payout log aggregation problem between Step 15 and Step 16. Do not rebuild the full workflow. Do not change Shopify payout fetching, NetSuite duplicate lookup, NetSuite Journal Entry creation, accounting calculations, account mappings, checkpoint logic, or alerting destination unless a downstream reference must be updated because the log aggregation shape changes.

Current problem:
- Step 15 "Log Payout Result" runs inside the payout loop.
- Step 16 "Build Batch Summary" runs outside the payout loop.
- Step 16 currently reads Step 15 output directly, so it only sees the last loop iteration's log result.
- The batch summary therefore undercounts created, skipped, and failed payouts.

Required behavior:
- Use workflow memory to accumulate one log record per payout across loop iterations.
- Reset the memory key before the loop starts.
- In Step 15, read the current memory value, append the current payout log, and output the updated array.
- Immediately after Step 15, add a Set Memory step that stores the updated array.
- In Step 16, read the accumulated logs from memory and build the batch summary from that array.

Memory syntax rules:
- Use a Set Memory step to write memory.
- Memory is key-value.
- Set Memory automatically stores values as strings. Do not call `JSON.stringify` when setting memory.
- Any map step can read memory with `input.memory?.key`.
- When reading a value from memory in a map step, use `JSON.parse`.

Memory key:

```text
shopifyPayoutReconciliationLogs
```

Implementation steps:

1. Add a new Set Memory step before the payout loop
   - Place this after the payout extraction step and before "Loop: For Each Payout".
   - Name it: "Reset Payout Result Logs"
   - Key:

   ```text
   shopifyPayoutReconciliationLogs
   ```

   - Value:

   ```javascript
   []
   ```

   - Do not stringify this value.
   - This reset is required so a new workflow run does not reuse logs from a previous run.

2. Replace Step 15 "Log Payout Result" with this map logic
   - Keep it inside the loop.
   - It should still create the current payout log entry.
   - It should also read existing logs from memory and append the current log.
   - It should return the current log fields plus `accumulatedLogs`.

   Use this JavaScript as the basis, adapting only Gravity step IDs if needed:

   ```javascript
   // Log Payout Result
   // Produces one structured result per payout and appends it to workflow memory.

   const MEMORY_KEY = "shopifyPayoutReconciliationLogs";

   function readMemoryArray(key) {
     const raw = input.memory?.[key];

     if (!raw) return [];
     if (Array.isArray(raw)) return raw;

     try {
       const parsed = JSON.parse(raw);
       return Array.isArray(parsed) ? parsed : [];
     } catch (error) {
       return [];
     }
   }

   const storeConfig = ((input["mapRPVQ"] || [])[0] || {}).storeConfig || {};
   const accounting = (input["mapVTMX"] || [])[0] || {};
   const jePayload = (input["mapNOVA"] || [])[0] || {};
   const nsCreateResult = (input["netsuiteExecuteCustomCodeET8Q"] || [])[0] || {};
   const nsSearch = (input["netsuiteExecuteCustomCodeSU2D"] || [])[0] || {};
   const skipLog = (input["mapEZVM"] || [])[0] || {};

   let resultStatus = "unknown";
   let journalEntryId = null;
   let errorStep = null;
   let errorMessage = null;

   if (skipLog && skipLog.resultStatus === "skipped_already_processed") {
     resultStatus = "skipped_already_processed";
     journalEntryId =
       skipLog.journalEntryId ||
       (nsSearch.existingJournalEntry ? nsSearch.existingJournalEntry.internalId : null) ||
       null;
   } else if (nsCreateResult && (nsCreateResult.id || nsCreateResult.journalEntryId)) {
     resultStatus = "created";
     journalEntryId = String(nsCreateResult.id || nsCreateResult.journalEntryId);
   } else if (nsCreateResult && (nsCreateResult.error || nsCreateResult.message)) {
     resultStatus = "failed";
     errorStep = "NetSuite: Create Journal Entry";
     errorMessage = nsCreateResult.error || nsCreateResult.message || "Unknown NetSuite error";
   }

   const logEntry = {
     store: storeConfig.storeName || "unknown",
     payoutId: accounting.payoutId || jePayload.payoutId || null,
     externalId: accounting.externalId || jePayload.externalId || null,
     issuedAt: accounting.issuedAt || null,
     issuedDate: accounting.issuedDate || null,
     status: accounting.status || null,
     transactionType: accounting.transactionType || null,
     currencyCode: accounting.currencyCode || null,
     netAmount: accounting.netAmount !== undefined ? accounting.netAmount : null,
     feeTotal: accounting.feeTotal !== undefined ? accounting.feeTotal : null,
     clearingAmount: accounting.clearingAmount !== undefined ? accounting.clearingAmount : null,
     journalEntryId,
     resultStatus,
     errorStep,
     errorMessage,
     timestamp: new Date().toISOString()
   };

   const existingLogs = readMemoryArray(MEMORY_KEY);
   const accumulatedLogs = existingLogs.concat([logEntry]);

   return [{
     ...logEntry,
     accumulatedLogs
   }];
   ```

3. Add a new Set Memory step immediately after Step 15
   - Place it inside the loop, immediately after "Log Payout Result".
   - Name it: "Store Accumulated Payout Logs"
   - Key:

   ```text
   shopifyPayoutReconciliationLogs
   ```

   - Value:

   ```javascript
   Step 15 accumulatedLogs
   ```

   - Use the actual Gravity expression for the Step 15 `accumulatedLogs` output.
   - Store only `accumulatedLogs`, not the whole Step 15 object.
   - Do not call `JSON.stringify`; Set Memory handles storage serialization.

4. Replace Step 16 "Build Batch Summary" with this map logic
   - Step 16 must read the full accumulated logs from memory.
   - It must not use Step 15 direct output as the source of truth.
   - Keep Step 3/extraction metadata only for fetched/eligible counts if available.

   Use this JavaScript as the basis, adapting Step 3 ID if needed:

   ```javascript
   // Build Batch Summary
   // Aggregates all payout log results from workflow memory.

   const MEMORY_KEY = "shopifyPayoutReconciliationLogs";

   function readMemoryArray(key) {
     const raw = input.memory?.[key];

     if (!raw) return [];
     if (Array.isArray(raw)) return raw;

     try {
       const parsed = JSON.parse(raw);
       return Array.isArray(parsed) ? parsed : [];
     } catch (error) {
       return [];
     }
   }

   const extractionStep = (input["mapBEND"] || [])[0] || {};
   const logResults = readMemoryArray(MEMORY_KEY);

   const totalFetched =
     extractionStep.totalFetched !== undefined
       ? extractionStep.totalFetched
       : (extractionStep.payouts || []).length || logResults.length;

   const totalEligible =
     extractionStep.totalEligible !== undefined
       ? extractionStep.totalEligible
       : (extractionStep.payouts || []).length || logResults.length;

   let createdCount = 0;
   let skippedCount = 0;
   let failedCount = 0;
   const failedPayouts = [];

   for (const log of logResults) {
     if (log.resultStatus === "created") {
       createdCount++;
     } else if (log.resultStatus === "skipped_already_processed") {
       skippedCount++;
     } else if (log.resultStatus === "failed") {
       failedCount++;
       failedPayouts.push({
         payoutId: log.payoutId,
         externalId: log.externalId,
         errorStep: log.errorStep,
         errorMessage: log.errorMessage
       });
     } else {
       failedCount++;
       failedPayouts.push({
         payoutId: log.payoutId,
         externalId: log.externalId,
         errorStep: log.errorStep || "Unknown",
         errorMessage: log.errorMessage || "Unknown result status: " + log.resultStatus
       });
     }
   }

   const runTimestamp = new Date().toISOString();

   const summary = {
     runTimestamp,
     totalPayoutsFetched: totalFetched,
     totalEligiblePayouts: totalEligible,
     createdCount,
     skippedCount,
     failedCount,
     failedPayouts,
     hasFailures: failedCount > 0,
     summaryMessage: [
       `Shopify Payout Reconciliation Summary (${runTimestamp})`,
       `Total payouts fetched: ${totalFetched}`,
       `Total eligible payouts: ${totalEligible}`,
       `Created: ${createdCount}`,
       `Skipped (already processed): ${skippedCount}`,
       `Failed: ${failedCount}`,
       failedPayouts.length > 0
         ? `\nFailed payout details:\n` + failedPayouts.map(f =>
             `  - Payout ${f.payoutId} (${f.externalId}): [${f.errorStep}] ${f.errorMessage}`
           ).join("\n")
         : ""
     ].filter(Boolean).join("\n")
   };

   return [summary];
   ```

5. Keep these downstream behaviors
   - Step 17 alert should still read Step 16 `summaryMessage`.
   - Checkpoint update should still run after the summary/alert behavior.
   - The workflow should continue processing payout loop iterations independently.

Do not make these changes:
- Do not move Step 16 into the loop.
- Do not rely on Step 15 direct output for batch summary.
- Do not stringify values before Set Memory.
- Do not change Shopify payout GraphQL.
- Do not change NetSuite SuiteScript search or creation.
- Do not change accounting mappings or JE payload rules.

Acceptance checks after the fix:
- A Set Memory reset step exists before the loop with key `shopifyPayoutReconciliationLogs` and value `[]`.
- Step 15 reads `input.memory?.shopifyPayoutReconciliationLogs`.
- Step 15 parses memory with `JSON.parse`.
- Step 15 returns `accumulatedLogs`.
- A Set Memory step exists immediately after Step 15 inside the loop.
- The Set Memory step stores Step 15 `accumulatedLogs` to `shopifyPayoutReconciliationLogs`.
- Step 16 reads `input.memory?.shopifyPayoutReconciliationLogs`.
- Step 16 parses memory with `JSON.parse`.
- Step 16 builds counts from the memory array, not from direct Step 15 output.
- A test batch with 3 payouts produces a summary whose created/skipped/failed counts add up to 3.
````

