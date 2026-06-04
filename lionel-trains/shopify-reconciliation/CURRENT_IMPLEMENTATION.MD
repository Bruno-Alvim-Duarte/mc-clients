📋 Shopify to NetSuite — Shopify Payout Reconciliation
Workflow Name: Shopify to NetSuite - Shopify Payout Reconciliation Total Steps: 17 Purpose: Automatically fetches Shopify payouts daily, checks for duplicates in NetSuite, calculates accounting values (fees, clearing amounts), creates Journal Entries in NetSuite, and logs a batch summary.

🔁 Workflow Flow Diagram
Trigger (Schedule)
  └─ Step 1: Resolve Store Config
      └─ Step 2: Shopify: Fetch Payouts (GraphQL)
          └─ Step 3: Extract & Filter PAID Payouts
              └─ Step 4: Loop: For Each Payout
                  ├─ Step 5: Build Idempotency Key
                  │   └─ Step 6: NetSuite: Search Existing JE by ExternalId
                  │       └─ Step 7: If JE Already Exists → Skip
                  │           ├─ THEN → Step 8: Log: Skipped (Already Processed)
                  │           └─ ELSE → Step 9: Normalize Shopify Payout
                  │               └─ Step 10: Calculate Accounting Values
                  │                   └─ Step 11: Build NetSuite JE Payload
                  │                       └─ Step 12: NetSuite: Create Journal Entry
                  │                           └─ Step 13: Log Payout Result
              └─ Step 14: Build Batch Summary
                  └─ Step 15: Alert: Batch Summary
                      └─ Step 16: Update Checkpoint
⏰ Trigger — Schedule: Daily Payout Reconciliation
Type: Schedule (Fixed)
Schedule: Daily at 9:00 AM
Timezone: America/New_York
Days: Monday through Friday (weekdays only)
Step 1 — Resolve Store Config
App: Map (JavaScript)
Inputs: None (self-contained)
Purpose: Defines the store configuration and checkpoint state for the workflow run. Supports multi-store configurations with distinct NetSuite divisions.
Supported Stores:

Auto World Store — Division 30, Subsidiary 3, Currency 1
Big Country Toys — Division 40, Subsidiary 3, Currency 1
Default store: Big Country Toys

Checkpoint: Provides lastIssuedAt and lastPayoutId for incremental processing. Currently initialized to null (processes all available payouts on first run; in production, would be read from persistent storage).

const storeName = "Big Country Toys";

const storeConfigs = {
  "Auto World Store": {
    storeName: "Auto World Store",
    division: "30",
    subsidiary: "3",
    currency: "1",
  },
  "Big Country Toys": {
    storeName: "Big Country Toys",
    division: "40",
    subsidiary: "3",
    currency: "1",
  }
};

const storeConfig = storeConfigs[storeName];

if (!storeConfig) {
  throw new Error(`Unknown store: "${storeName}". Supported stores: ${Object.keys(storeConfigs).join(", ")}`);
}

const checkpoint = {
  lastIssuedAt: null,
  lastPayoutId: null
};

return [{
  storeConfig,
  checkpoint
}];
Output: { storeConfig: {...}, checkpoint: {...} }

Step 2 — Shopify: Fetch Payouts (GraphQL)
App: Shopify
Action: Execute GraphQL Query (wcjwgfzwbzca)
Credential: Connected Shopify account
Purpose: Fetches the last 50 payouts from Shopify Payments via the Admin GraphQL API, including financial summary breakdowns.
GraphQL Query:

query {
  shopifyPaymentsAccount {
    payouts(first: 50) {
      edges {
        node {
          id
          issuedAt
          status
          net {
            amount
            currencyCode
          }
          summary {
            adjustmentsFee { amount }
            adjustmentsGross { amount }
            chargesFee { amount }
            chargesGross { amount }
            refundsFee { amount }
            refundsFeeGross { amount }
            reservedFundsFee { amount }
            reservedFundsGross { amount }
            retriedPayoutsFee { amount }
            retriedPayoutsGross { amount }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
}
Fields retrieved per payout:

id, issuedAt, status
net.amount, net.currencyCode
Summary breakdown: adjustments, charges, refunds, reserved funds, retried payouts (fee + gross amounts)
Pagination: hasNextPage, endCursor
Step 3 — Extract & Filter PAID Payouts
App: Map (JavaScript)
Inputs: Step 1 (Resolve Store Config), Step 2 (Shopify GraphQL response)
Purpose: Parses the GraphQL response, filters to only PAID status payouts, applies checkpoint-based incremental filtering, and flattens the summary amounts.
Logic:

Extracts payout nodes from edges[].node
Filters to status === "PAID" only
Applies checkpoint window: only processes payouts issued after lastIssuedAt (with id as tie-breaker)
Flattens nested { amount: "..." } objects into plain numeric values
Attaches storeConfig to each payout
const shopifyRaw = inputData["2WOPwJmOYYYc"] || [];
const storeConfigStep = inputData["MJ4MVcXzrpvq"] || [];
const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};
const checkpoint = (storeConfigStep[0] || {}).checkpoint || {};

const graphqlResult = shopifyRaw[0] || {};
const edges = graphqlResult?.shopifyPaymentsAccount?.payouts?.edges || [];
const pageInfo = graphqlResult?.shopifyPaymentsAccount?.payouts?.pageInfo || {};

const allPayouts = edges.map(edge => edge.node).filter(Boolean);
const paidPayouts = allPayouts.filter(p => p.status === "PAID");

const lastIssuedAt = checkpoint.lastIssuedAt || null;
const lastPayoutId = checkpoint.lastPayoutId || null;

const eligiblePayouts = paidPayouts.filter(p => {
  if (!lastIssuedAt) return true;
  const payoutDate = p.issuedAt;
  if (payoutDate > lastIssuedAt) return true;
  if (payoutDate === lastIssuedAt && p.id > lastPayoutId) return true;
  return false;
});

const flattenedPayouts = eligiblePayouts.map(p => {
  const summary = p.summary || {};
  const flatSummary = {};
  for (const [key, val] of Object.entries(summary)) {
    flatSummary[key] = val?.amount !== undefined ? val.amount : val;
  }
  return {
    id: p.id,
    issuedAt: p.issuedAt,
    status: p.status,
    netAmount: p.net?.amount || "0",
    currencyCode: p.net?.currencyCode || null,
    summary: flatSummary,
    storeConfig
  };
});

return [{
  totalFetched: allPayouts.length,
  totalPaid: paidPayouts.length,
  totalEligible: flattenedPayouts.length,
  hasNextPage: pageInfo.hasNextPage || false,
  endCursor: pageInfo.endCursor || null,
  payouts: flattenedPayouts
}];
Output: { totalFetched, totalPaid, totalEligible, hasNextPage, endCursor, payouts: [...] }

Step 4 — Loop: For Each Payout
App: Iterate (Loop)
Source: Step 3 (Extract & Filter PAID Payouts)
Data Key: payouts
Purpose: Iterates over each eligible payout object for individual processing.
Error Handling:

On Failure: continue (moves to the next payout)
Log Level: error
Log Message: "Payout iteration failed — continuing to next item."
Step 5 — Build Idempotency Key (inside loop)
App: Map (JavaScript)
Inputs: Step 4 (current payout from iterator)
Purpose: Generates a unique externalId for duplicate detection in NetSuite. Format: shopify_payout_{payoutId}.
const payout = inputData["TLNiug9cjVCa"];

if (!payout || !payout.id) {
  throw new Error("Missing payout or payout.id in current iteration item");
}

const payoutId = payout.id;
const externalId = `shopify_payout_${payoutId}`;

return [{
  payoutId,
  externalId
}];
Output: { payoutId, externalId }

Step 6 — NetSuite: Search Existing JE by ExternalId (inside loop)
App: NetSuite
Action: SuiteQL Query (imobrqhlcbck)
Credential: Connected NetSuite account
Purpose: Searches NetSuite for an existing Journal Entry that matches the externalId built in Step 5. Used for idempotency — prevents duplicate JE creation.
SuiteQL Query (dynamic):

const externalId = steps.fcnZYyTVE3Sm.externalId;
return `SELECT transaction.id AS internalid, transaction.externalid, transaction.trandate, transaction.memo FROM transaction WHERE transaction.type = 'Journal' AND transaction.externalid = '${externalId}'`;
Columns returned: id (internalid)

Step 7 — If JE Already Exists → Skip (inside loop)
App: If / Else (Conditional)
Purpose: Checks if the NetSuite search from Step 6 returned any results. If a matching Journal Entry already exists, the payout is skipped.
Condition:

Field: Step 6 → items
Operator: is not empty
Conjunction: AND
Branches:

THEN (items not empty): → JE already exists → go to Step 8 (Log: Skipped)
ELSE (items empty): → No existing JE → proceed to create one (Steps 9–12)
Step 8 — Log: Skipped (Already Processed) (THEN branch — inside loop)
App: Map (JavaScript)
Inputs: Step 4 (iterator), Step 5 (idempotency key), Step 1 (store config)
Purpose: Logs a structured "skipped" result when the payout already has a Journal Entry in NetSuite.
const payout = inputData["TLNiug9cjVCa"];
const idempotency = inputData["fcnZYyTVE3Sm"] || {};
const storeConfigStep = inputData["MJ4MVcXzrpvq"] || [];
const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};

return [{
  store: storeConfig.storeName || "unknown",
  payoutId: payout?.id || idempotency.payoutId || "unknown",
  externalId: idempotency.externalId || "unknown",
  issuedAt: payout?.issuedAt || null,
  issuedDate: payout?.issuedAt ? String(payout.issuedAt).split("T")[0] : null,
  status: payout?.status || null,
  transactionType: payout?.transactionType || payout?.type || null,
  currencyCode: payout?.currencyCode || payout?.net?.currencyCode || null,
  netAmount: Number(payout?.netAmount || payout?.net?.amount || 0),
  feeTotal: null,
  clearingAmount: null,
  journalEntryId: null,
  resultStatus: "skipped_already_processed",
  errorStep: null,
  errorMessage: null
}];
Output: Structured log entry with resultStatus: "skipped_already_processed"

Step 9 — Normalize Shopify Payout (ELSE branch — inside loop)
App: Map (JavaScript)
Inputs: Step 4 (iterator), Step 1 (store config)
Purpose: Validates required fields (id, issuedAt, netAmount) and normalizes the payout data structure for downstream accounting calculations.
const payout = inputData["TLNiug9cjVCa"];
const storeConfigStep = inputData["MJ4MVcXzrpvq"] || [];
const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};

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

return [{
  payoutId: payout.id,
  externalId: `shopify_payout_${payout.id}`,
  issuedAt: payout.issuedAt,
  issuedDate,
  memo: `Shopify payout reconciliation ${issuedDate}`,
  status: payout.status || null,
  transactionType: payout.transactionType || payout.type || null,
  currencyCode: payout.currencyCode || payout.net?.currencyCode || null,
  netAmount: Number(netAmountRaw),
  summary: payout.summary || {},
  storeConfig
}];
Output: { payoutId, externalId, issuedAt, issuedDate, memo, status, transactionType, currencyCode, netAmount, summary, storeConfig }

Step 10 — Calculate Accounting Values
App: Map (JavaScript)
Inputs: Step 9 (Normalize Shopify Payout)
Purpose: Computes fee totals, clearing amounts, and balanced journal entry lines with proper debit/credit assignments.
Accounting Rules:

Fee fields included: All summary keys ending in Fee or Fees, plus advanceFees
Excluded: refundsFeeGross
Clearing Amount: -(netAmount + feeTotal)
Signed amounts converted to debit (positive) or credit (negative)
Zero-amount lines omitted
Balance validation: Throws error if totalDebits ≠ totalCredits
Journal Lines (accounts):

Account 1095 — East West Receivables (net payout amount)
Account 8616 — Credit Card Fees (fee total, Department 810)
Account 1099 — Shopify Clearing (clearing amount)
const input = (inputData["QYJlUejIPv2R"] || [])[0] || {};
const summary = input.summary || {};

const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100;

// Sum all fee fields: keys ending in "Fee" or "Fees" (except refundsFeeGross), plus advanceFees
const feeTotal = Object.entries(summary)
  .filter(([key]) => {
    if (key === "refundsFeeGross") return false;
    if (key.endsWith("Fee") || key.endsWith("Fees")) return true;
    if (key === "advanceFees") return true;
    return false;
  })
  .reduce((sum, [, value]) => {
    return sum + Number(value?.amount !== undefined ? value.amount : (value ?? 0));
  }, 0);

const netAmount = Number(input.netAmount || 0);
const clearingSignedAmount = -(netAmount + feeTotal);

function toJournalLine(account, signedAmount, memo, extra) {
  const amount = roundMoney(Math.abs(Number(signedAmount || 0)));
  if (amount === 0) return null;

  if (signedAmount >= 0) {
    return { account, debit: amount, memo, ...(extra || {}) };
  }
  return { account, credit: amount, memo, ...(extra || {}) };
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

return [{
  ...input,
  feeTotal: roundMoney(feeTotal),
  clearingAmount: roundMoney(Math.abs(clearingSignedAmount)),
  clearingSignedAmount: roundMoney(clearingSignedAmount),
  lines,
  totalDebits,
  totalCredits,
  isBalanced
}];
Output: All fields from Step 9 plus { feeTotal, clearingAmount, clearingSignedAmount, lines[], totalDebits, totalCredits, isBalanced }

Step 11 — Build NetSuite JE Payload (ELSE branch — inside loop)
App: Map (JavaScript)
Inputs: Step 10 (Calculate Accounting Values)
Purpose: Constructs the final NetSuite Journal Entry record payload in the format expected by the SuiteScript execution step.
JE Header Fields:

externalId — idempotency key (shopify_payout_{id})
subsidiary — { id: "3" }
currency — { id: "1" }
tranDate — payout issuedDate (YYYY-MM-DD)
memo — "Shopify payout reconciliation {date}"
department — from storeConfig.division (e.g., { id: "40" })
approvalStatus — only included if defined in store config
JE Line Format: Each line contains { account: { id }, debit/credit, memo, department? } — zero-amount lines are already filtered out upstream.

const input = (inputData["Jbf5YoU3vtmX"] || [])[0] || {};

if (!input.isBalanced) {
  throw new Error(`Unbalanced journal entry for payout ${input.payoutId}`);
}

const nsLines = input.lines.map((line, idx) => {
  const nsLine = {
    account: { id: line.account },
    memo: line.memo
  };

  if (line.debit !== undefined && line.debit > 0) {
    nsLine.debit = line.debit;
  }
  if (line.credit !== undefined && line.credit > 0) {
    nsLine.credit = line.credit;
  }
  if (line.department) {
    nsLine.department = { id: line.department };
  }

  return nsLine;
});

const payload = {
  externalId: input.externalId,
  subsidiary: { id: "3" },
  currency: { id: "1" },
  tranDate: input.issuedDate,
  memo: input.memo,
  line: nsLines
};

if (input.storeConfig && input.storeConfig.division) {
  payload.department = { id: input.storeConfig.division };
}

if (input.storeConfig && input.storeConfig.approvalStatus) {
  payload.approvalStatus = input.storeConfig.approvalStatus;
}

return [{
  payoutId: input.payoutId,
  externalId: input.externalId,
  issuedAt: input.issuedAt,
  issuedDate: input.issuedDate,
  memo: input.memo,
  status: input.status,
  transactionType: input.transactionType,
  currencyCode: input.currencyCode,
  netAmount: input.netAmount,
  feeTotal: input.feeTotal,
  clearingAmount: input.clearingAmount,
  totalDebits: input.totalDebits,
  totalCredits: input.totalCredits,
  storeConfig: input.storeConfig,
  payload
}];
Output: All metadata fields plus payload — the complete NetSuite JE record ready for submission.

Step 12 — NetSuite: Create Journal Entry (ELSE branch — inside loop)
App: NetSuite
Action: Execute Custom SuiteScript Code (qddujikckdwv)
Credential: Connected NetSuite account
Record Type: JournalEntry
Purpose: Creates the actual Journal Entry in NetSuite using a full SuiteScript that dynamically builds the record from the payload.
Input Data (eval):

return JSON.stringify(steps.Gdx4DwyyNOvA.payload);
SuiteScript Logic:

Parses the JSON payload from Step 11
Creates a dynamic JournalEntry record
Sets header fields: externalid, subsidiary, currency, trandate, memo, department, approvalstatus
Loops through payload.line[] to add sublist lines with: account, debit/credit, memo, department
Saves the record with enableSourcing: true and ignoreMandatoryFields: false
Returns { id: <journalEntryId>, type: "journalentry" }
Full SuiteScript:

(function() {
  var rawPayload = inputData;
  var payload = (typeof rawPayload === 'string') ? JSON.parse(rawPayload) : rawPayload;

  var jeRecord = record.create({
    type: record.Type.JOURNAL_ENTRY,
    isDynamic: true
  });

  // Header fields
  if (payload.externalId) {
    jeRecord.setValue({ fieldId: 'externalid', value: payload.externalId });
  }
  jeRecord.setValue({
    fieldId: 'subsidiary',
    value: payload.subsidiary && payload.subsidiary.id ? payload.subsidiary.id : payload.subsidiary
  });
  jeRecord.setValue({
    fieldId: 'currency',
    value: payload.currency && payload.currency.id ? payload.currency.id : payload.currency
  });
  if (payload.tranDate) {
    jeRecord.setValue({ fieldId: 'trandate', value: new Date(payload.tranDate) });
  }
  if (payload.memo) {
    jeRecord.setValue({ fieldId: 'memo', value: payload.memo });
  }
  if (payload.department) {
    jeRecord.setValue({
      fieldId: 'department',
      value: payload.department && payload.department.id ? payload.department.id : payload.department
    });
  }
  if (payload.approvalStatus !== undefined && payload.approvalStatus !== null) {
    jeRecord.setValue({ fieldId: 'approvalstatus', value: String(payload.approvalStatus) });
  }

  // Line items
  var lines = payload.line || [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    jeRecord.selectNewLine({ sublistId: 'line' });

    if (line.account !== undefined) {
      jeRecord.setCurrentSublistValue({
        sublistId: 'line', fieldId: 'account',
        value: line.account && line.account.id ? line.account.id : line.account
      });
    }
    if (line.debit !== undefined && line.debit !== null && line.debit !== '') {
      jeRecord.setCurrentSublistValue({
        sublistId: 'line', fieldId: 'debit', value: parseFloat(line.debit)
      });
    }
    if (line.credit !== undefined && line.credit !== null && line.credit !== '') {
      jeRecord.setCurrentSublistValue({
        sublistId: 'line', fieldId: 'credit', value: parseFloat(line.credit)
      });
    }
    if (line.memo) {
      jeRecord.setCurrentSublistValue({
        sublistId: 'line', fieldId: 'memo', value: line.memo
      });
    }
    if (line.department) {
      jeRecord.setCurrentSublistValue({
        sublistId: 'line', fieldId: 'department',
        value: line.department && line.department.id ? line.department.id : line.department
      });
    }
    jeRecord.commitLine({ sublistId: 'line' });
  }

  var jeId = jeRecord.save({ enableSourcing: true, ignoreMandatoryFields: false });
  return { id: jeId, type: 'journalentry' };
}());
Output: { id: <NetSuite JE internal ID>, type: "journalentry" }

Step 13 — Log Payout Result (inside loop — after If/Else)
App: Map (JavaScript)
Inputs: Step 1 (store config), Step 11 (JE payload), Step 10 (accounting), Step 12 (NS create result), Step 6 (NS search result), Step 8 (skip log)
Purpose: Produces one structured log entry per payout capturing the final outcome — created, skipped_already_processed, or failed.
Result Status Logic:

If Step 8 (skip log) has resultStatus === "skipped_already_processed" → skipped
Else if Step 12 result has id → created (captures the JE ID)
Else if Step 12 result has error → failed (captures the error details)
const storeConfig = (inputData["MJ4MVcXzrpvq"] || [])[0] || {};
const accounting = (inputData["Jbf5YoU3vtmX"] || [])[0] || {};
const jePayload = (inputData["Gdx4DwyyNOvA"] || [])[0] || {};
const nsCreateResult = (inputData["kzD742DDet8q"] || [])[0] || {};
const nsSearchResult = (inputData["cMuEwtrDSu2D"] || [])[0] || {};
const skipLog = (inputData["JKjLxmXEezvM"] || [])[0] || {};

let resultStatus = "unknown";
let journalEntryId = null;
let errorStep = null;
let errorMessage = null;

if (skipLog && skipLog.resultStatus === "skipped_already_processed") {
  resultStatus = "skipped_already_processed";
  journalEntryId = skipLog.existingJeId || null;
} 
else if (nsCreateResult && nsCreateResult.id) {
  resultStatus = "created";
  journalEntryId = String(nsCreateResult.id);
}
else if (nsCreateResult && nsCreateResult.error) {
  resultStatus = "failed";
  errorStep = "NetSuite: Create Journal Entry";
  errorMessage = nsCreateResult.error || nsCreateResult.message || "Unknown NetSuite error";
}

const logEntry = {
  store: storeConfig.store || storeConfig.storeName || "unknown",
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

return [logEntry];
Output: Full structured log entry with all payout metadata and result status.

Step 14 — Build Batch Summary (after loop)
App: Map (JavaScript)
Inputs: Step 3 (eligible payouts), Step 13 (all log results from loop)
Purpose: Aggregates all individual payout results into a single batch summary for alerting and monitoring.
Computed Metrics:

createdCount — JEs successfully created
skippedCount — payouts already processed
failedCount — payouts that errored
failedPayouts[] — detail array of failures
hasFailures — boolean flag
summaryMessage — formatted multi-line text report
const eligiblePayouts = inputData["taoKGGuPBEND"] || [];
const logResults = inputData["YT2rtjdkGfnh"] || [];

const totalFetched = eligiblePayouts.length;
const totalEligible = eligiblePayouts.length;

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
  totalEligiblePayouts
please continue
Sure, continuing from Step 14:

Step 14 — Build Batch Summary (continued)
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
Output: { runTimestamp, totalPayoutsFetched, totalEligiblePayouts, createdCount, skippedCount, failedCount, failedPayouts[], hasFailures, summaryMessage }

Example summaryMessage output:

Shopify Payout Reconciliation Summary (2025-01-15T14:00:00.000Z)
Total payouts fetched: 12
Total eligible payouts: 12
Created: 8
Skipped (already processed): 3
Failed: 1

Failed payout details:
  - Payout gid://shopify/... (shopify_payout_gid://...): [NetSuite: Create Journal Entry] Some error
Step 15 — Alert: Batch Summary (after loop)
App: Flow Control
Action: Emit Log
Purpose: Emits the batch summary message as an info-level workflow log for monitoring and alerting.
Configuration:

Emit Log: true
Log Type: info
Log Message: {{Step 14 → summaryMessage}} (the formatted multi-line summary from Build Batch Summary)
Step 16 — Update Checkpoint (after loop)
App: Map (JavaScript)
Inputs: Step 3 (eligible payouts), Step 13 (all log results from loop)
Purpose: Determines the latest successfully processed payout and outputs a new checkpoint for the next workflow run. This prevents reprocessing the same payouts.
Logic:

Filters log results to only created or skipped_already_processed statuses
If no payouts were successfully processed → returns checkpointUpdated: false
Otherwise, finds the latest payout by issuedAt (using payoutId as string tie-breaker)
Returns the new checkpoint values
const logResults = inputData["YT2rtjdkGfnh"] || [];
const eligiblePayouts = inputData["taoKGGuPBEND"] || [];

const processedLogs = logResults.filter(
  log => log.resultStatus === "created" || log.resultStatus === "skipped_already_processed"
);

if (processedLogs.length === 0) {
  return [{
    checkpointUpdated: false,
    reason: "No payouts were successfully processed in this run",
    lastIssuedAt: null,
    lastPayoutId: null
  }];
}

let latestLog = processedLogs[0];

for (const log of processedLogs) {
  const currentDate = log.issuedAt || "";
  const latestDate = latestLog.issuedAt || "";

  if (currentDate > latestDate) {
    latestLog = log;
  } else if (currentDate === latestDate) {
    const currentId = String(log.payoutId || "");
    const latestId = String(latestLog.payoutId || "");
    if (currentId > latestId) {
      latestLog = log;
    }
  }
}

return [{
  checkpointUpdated: true,
  lastIssuedAt: latestLog.issuedAt,
  lastPayoutId: latestLog.payoutId,
  totalProcessed: processedLogs.length,
  timestamp: new Date().toISOString()
}];
Output (if updated): { checkpointUpdated: true, lastIssuedAt, lastPayoutId, totalProcessed, timestamp } Output (if not updated): { checkpointUpdated: false, reason, lastIssuedAt: null, lastPayoutId: null }

🗂️ Summary — Key Design Patterns
1. Idempotency Every payout generates a unique externalId (shopify_payout_{id}). Before creating a Journal Entry, the workflow queries NetSuite via SuiteQL to check if one already exists. Duplicates are safely skipped.

2. Incremental Processing (Checkpoint) Step 1 initializes a checkpoint (lastIssuedAt + lastPayoutId). Step 3 uses it to filter out already-processed payouts. Step 16 advances the checkpoint after a successful run. Note: checkpoint persistence to an external store is marked as a production TODO.

3. Balanced Journal Validation Step 10 enforces that totalDebits === totalCredits before allowing JE creation. Unbalanced entries throw an error, halting processing for that specific payout.

4. Fault Tolerance The iterate loop (Step 4) is configured with onFailure: "continue", ensuring that a failure on one payout doesn't block processing of the remaining payouts. Step 13 captures individual outcomes (created/skipped/failed) and Step 14 aggregates them into a batch report.

5. Multi-Store Support Step 1 supports multiple Shopify stores (Auto World Store, Big Country Toys) with distinct NetSuite division mappings. Currently hardcoded to "Big Country Toys" with a note to source from environment variables in production.

