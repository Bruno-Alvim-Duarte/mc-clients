// Gravity map step: Remove a resolved settlement from the shared failure array.
//
// Expected input:
// - input.mapBuildRuntimeConfig[0] or input.mapF0FK[0]
// - Memory/KV get output for the shared failure array
// - input.mapBuildJournalEntryPayload[0]
// - optional input.netsuiteCreateJournalEntry[0]
// - optional input.netsuiteAttachSettlementCsv[0]

const runtimeConfig = (input.mapF0FK || [])[0] || {};
const jePayload = (input.mapWLLK || [])[0] || {};
const settlement = (input.mapXTUO || [])[0] || {};
const createResult = (input.netsuiteExecuteCustomCodeYDBY || [])[0] || {};
const attachResult = (input.netsuiteExecuteCustomCode29SZ || [])[0] || {};
const existingFailureState =
  (input.memoryGetFailureState || [])[0] ||
  (input.keyValueGetFailureState || [])[0] ||
  (input.getFailureState || [])[0] ||
  (input.memoryKvGetFailureState || [])[0] ||
  (input.getFailedSettlements || [])[0] ||
  {};

const settlementId =
  jePayload.settlementId ||
  settlement.settlementId ||
  createResult.settlementId ||
  attachResult.settlementId;

if (!settlementId) {
  throw new Error("Missing settlementId while building resolved failure memory payload");
}

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

const key = (runtimeConfig.memory && runtimeConfig.memory.failureListKey) || "amazon_settlement_failures";
const existingFailures = extractFailureArray(existingFailureState);
const value = existingFailures.filter(item => String(item.settlementId || "") !== String(settlementId));

return [{
  key,
  value,
  resolvedSettlementId: settlementId,
  removedCount: existingFailures.length - value.length,
  failureCount: value.length
}];
