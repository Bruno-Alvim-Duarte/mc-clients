// Gravity map step: Build a failure memory payload for retryable settlement failures.
// Expected input:
// - input.mapBuildRuntimeConfig[0]
// - input.iterateSettlementReport[0]
// - optional input.mapParseSettlementReportTsv[0]
// - optional input.mapBuildJournalEntryPayload[0]
// - optional input.netsuiteCreateJournalEntry[0]
// - optional input.netsuiteAttachSettlementCsv[0]
//
// Replace step keys with actual Gravity keys after Cloudy creates the workflow.

const runtimeConfig = (input.mapBuildRuntimeConfig || [])[0] || {};
const currentReport = (input.iterateSettlementReport || [])[0] || {};
const settlement = (input.mapParseSettlementReportTsv || [])[0] || {};
const jePayload = (input.mapBuildJournalEntryPayload || [])[0] || {};
const createResult = (input.netsuiteCreateJournalEntry || [])[0] || {};
const attachResult = (input.netsuiteAttachSettlementCsv || [])[0] || {};

const workflowArguments = input.workflowArguments || {};
const failurePhase = workflowArguments.failurePhase || "unknown";
const errorMessage =
  workflowArguments.errorMessage ||
  attachResult.message ||
  createResult.message ||
  (settlement.errors || []).join("; ") ||
  "Unknown settlement processing failure";

const settlementId = settlement.settlementId || jePayload.settlementId || currentReport.settlementId || currentReport.reportId || "unknown";
const failureKeyPrefix = (runtimeConfig.memory && runtimeConfig.memory.failureKeyPrefix) || "amazon_settlement_failure_";
const key = `${failureKeyPrefix}${settlementId}`;

return [{
  key,
  value: {
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
  }
}];
