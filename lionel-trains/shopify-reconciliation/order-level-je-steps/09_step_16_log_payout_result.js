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
  payoutId: accounting.payoutId || jePayload.payoutId || skipLog.payoutId || null,
  externalId: accounting.externalId || jePayload.externalId || skipLog.externalId || null,
  issuedAt: accounting.issuedAt || skipLog.issuedAt || null,
  issuedDate: accounting.issuedDate || skipLog.issuedDate || null,
  status: accounting.status || skipLog.status || null,
  transactionType: accounting.transactionType || skipLog.transactionType || null,
  currencyCode: accounting.currencyCode || skipLog.currencyCode || null,
  netAmount: accounting.netAmount !== undefined ? accounting.netAmount : skipLog.netAmount !== undefined ? skipLog.netAmount : null,
  grossTotal: accounting.grossTotal !== undefined ? accounting.grossTotal : null,
  feeTotal: accounting.feeTotal !== undefined ? accounting.feeTotal : null,
  clearingAmount: accounting.clearingAmount !== undefined ? accounting.clearingAmount : null,
  balanceTransactionCount: accounting.balanceTransactionCount || jePayload.balanceTransactionCount || 0,
  orderCount: accounting.orderCount || jePayload.orderCount || 0,
  nonOrderAdjustmentCount: accounting.nonOrderAdjustmentCount || jePayload.nonOrderAdjustmentCount || 0,
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
