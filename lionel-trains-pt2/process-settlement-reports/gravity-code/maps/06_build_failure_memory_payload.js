// Gravity map step: Add or replace one retryable settlement failure in the shared failure array.
// Expected input:
// - input.mapBuildRuntimeConfig[0] or input.mapF0FK[0]
// - optional Memory/KV get output for the shared failure array
// - input.iterateSettlementReport[0] or input.iterateEV9J[0]
// - optional input.mapParseSettlementReportTsv[0] or input.mapXTUO[0]
// - optional input.mapBuildJournalEntryPayload[0]
// - optional input.netsuiteCreateJournalEntry[0]
// - optional input.netsuiteAttachSettlementCsv[0]
//
// Replace step keys with actual Gravity keys after Cloudy creates the workflow.

const runtimeConfig = (input.mapF0FK || input.mapBuildRuntimeConfig || [])[0] || {};
const currentReport = (input.iterateEV9J || input.iterateSettlementReport || [])[0] || {};
const settlement = (input.mapXTUO || input.mapParseSettlementReportTsv || [])[0] || {};
const jePayload = (input.mapWLLK || [])[0] || {};
const createResult = (input.netsuiteExecuteCustomCodeYDBY || [])[0] || {};
const attachResult = (input.netsuiteExecuteCustomCode29SZ || [])[0] || {};
const existingFailureState =
  (input.keyValueStorageALAT?.value || [])
const workflowArguments = input.workflowArguments || {};
const failurePhase = workflowArguments.failurePhase || "unknown";
const errorMessage =
  workflowArguments.errorMessage ||
  attachResult.message ||
  createResult.message ||
  (settlement.errors || []).join("; ") ||
  "Unknown settlement processing failure";

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

function extractFailureArray(memoryResult) {
  const candidates = [
    memoryResult,
    memoryResult.value,
    memoryResult.data,
    memoryResult.body,
    memoryResult.result,
    memoryResult.failures
  ];

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.value)) return parsed.value;
    if (parsed && Array.isArray(parsed.failures)) return parsed.failures;
  }

  return [];
}

const settlementId = settlement.settlementId || jePayload.settlementId || currentReport.settlementId || currentReport.reportId || "unknown";
const key = (runtimeConfig.memory && runtimeConfig.memory.failureListKey) || "amazon_settlement_failures";
const existingFailures = extractFailureArray(existingFailureState);
const failureEntry = {
  workflowName: runtimeConfig.workflowName || "Amazon Settlement Reports to NetSuite Journal Entries",
  status: "failed",
  failurePhase,
  errorMessage,
  settlementId,
  reportId: settlement.reportId || jePayload.reportId || currentReport.reportId || null,
  reportDocumentId: settlement.reportDocumentId || jePayload.reportDocumentId || currentReport.reportDocumentId || null,
  externalId: settlement.externalId || jePayload.externalId || null,
  journalEntryId:
    createResult.journalEntryId ||
    createResult.id ||
    attachResult.journalEntryId ||
    null,
  tranId: createResult.tranId || createResult.journalEntryNumber || null,
  failedAt: new Date().toISOString(),
  retryHint:
    failurePhase === "attach_csv"
      ? "Journal Entry may already exist. Retry CSV attachment against journalEntryId before creating another JE."
      : "Retry from report document download and parse."
};

const value = [
  ...existingFailures.filter(item => String(item.settlementId || "") !== String(settlementId)),
  failureEntry
];

return [{
  key,
  value,
  failure: failureEntry,
  failureCount: value.length
}];
