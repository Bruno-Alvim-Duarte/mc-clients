// Gravity map step: Mark a prior settlement failure as resolved after successful retry.
// Use this when Gravity cannot delete a memory/KV key directly.
//
// Expected input:
// - input.mapBuildRuntimeConfig[0]
// - input.mapBuildJournalEntryPayload[0]
// - optional input.netsuiteCreateJournalEntry[0]
// - optional input.netsuiteAttachSettlementCsv[0]

const runtimeConfig = (input.mapBuildRuntimeConfig || [])[0] || {};
const jePayload = (input.mapBuildJournalEntryPayload || [])[0] || {};
const createResult = (input.netsuiteCreateJournalEntry || [])[0] || {};
const attachResult = (input.netsuiteAttachSettlementCsv || [])[0] || {};

const settlementId = jePayload.settlementId || createResult.settlementId || attachResult.settlementId;

if (!settlementId) {
  throw new Error("Missing settlementId while building resolved failure memory payload");
}

const failureKeyPrefix = (runtimeConfig.memory && runtimeConfig.memory.failureKeyPrefix) || "amazon_settlement_failure_";

return [{
  key: `${failureKeyPrefix}${settlementId}`,
  value: {
    workflowName: runtimeConfig.workflowName || "Amazon Settlement Reports to NetSuite Journal Entries",
    status: "resolved",
    settlementId,
    reportId: jePayload.reportId || null,
    reportDocumentId: jePayload.reportDocumentId || null,
    externalId: jePayload.externalId || null,
    journalEntryId:
      attachResult.journalEntryId ||
      createResult.journalEntryId ||
      createResult.id ||
      null,
    fileId: attachResult.fileId || null,
    resolvedAt: new Date().toISOString()
  }
}];
