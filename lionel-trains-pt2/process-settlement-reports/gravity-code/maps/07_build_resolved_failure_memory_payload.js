// Gravity map step: Remove a resolved settlement from the environment-scoped failure array.
//
// Expected input:
// - input.mapBuildRuntimeConfig[0] or input.mapF0FK[0]
// - Memory/KV get output for the environment-scoped failure array
// - input.mapBuildJournalEntryPayload[0]
// - optional input.netsuiteCreateJournalEntry[0]
// - optional input.netsuiteAttachSettlementCsv[0]

const runtimeConfig = (input.mapF0FK || [])[0] || {};
const jePayload = (input.mapWLLK || [])[0] || {};
const settlement = (input.mapXTUO || [])[0] || {};
const createResult = (input.netsuiteExecuteCustomCodeYDBY || [])[0] || {};
const attachResult = (input.netsuiteExecuteCustomCode29SZ || [])[0] || {};
const existingFailureState =
  (input.keyValueStorageK6FZ || [])[0] 

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

function getFailureListKey(config) {
  const key = config.memory && config.memory.failureListKey;
  if (!key) {
    throw new Error("Missing runtimeConfig.memory.failureListKey while building resolved failure memory payload");
  }
  return key;
}

const key = getFailureListKey(runtimeConfig);
const existingFailures = extractFailureArray(existingFailureState);
const value = existingFailures.filter(item => String(item.settlementId || "") !== String(settlementId));

return [{
  key,
  value,
  resolvedSettlementId: settlementId,
  removedCount: existingFailures.length - value.length,
  failureCount: value.length
}];
