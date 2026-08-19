const normalizedWebhook = input['mapLR5J']?.[0] || {};
const memoryResult = input['keyValueStorageUEAK']?.[0] || {};
const plan = input['mapAX8Y']?.[0] || {};
const applyResult = input['netsuiteExecuteCustomCodePOSP']?.[0] || null;
const workflowArguments = input.workflowArguments || {};
const RETRYABLE_PLAN_REASONS = new Set([
  'netsuite_lookup_failed',
  'sales_order_not_found',
]);

function readMemoryValue(result) {
  if (Array.isArray(result)) return result;
  if (!result || typeof result !== 'object') return [];
  if (result.value !== undefined) return result.value;
  if (result.data !== undefined) return result.data;
  if (result.body !== undefined) return result.body;
  return result;
}

function parseQueue(value) {
  if (!value) return [];

  if (typeof value === 'string') {
    try {
      return parseQueue(JSON.parse(value));
    } catch (error) {
      return [];
    }
  }

  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object');

  if (value && typeof value === 'object') {
    if (Array.isArray(value.records)) return value.records;
    if (Array.isArray(value.queue)) return value.queue;
    if (Array.isArray(value.items)) return value.items;
  }

  return [];
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

const retryQueueKey =
  workflowArguments.retryQueueKey ||
  normalizedWebhook.retry?.queueKey ||
  'big_country_order_update_retry_queue';

const webhookBody =
  normalizedWebhook.retry?.webhookBody ||
  normalizedWebhook.rawBody ||
  null;

const currentQueue = parseQueue(readMemoryValue(memoryResult));
const updateFailed = !!applyResult && applyResult.success === false;
const retryablePlanFailure = !applyResult && RETRYABLE_PLAN_REASONS.has(plan.reason);
const shouldWrite = (updateFailed || retryablePlanFailure) &&
  !!webhookBody &&
  typeof webhookBody === 'object' &&
  Object.keys(webhookBody).length > 0;
const currentFingerprints = new Set(currentQueue.map(stableStringify));
const webhookFingerprint = shouldWrite ? stableStringify(webhookBody) : null;
const appended = shouldWrite && !currentFingerprints.has(webhookFingerprint);
const nextQueue = appended ? currentQueue.concat([webhookBody]) : currentQueue;

return [{
  shouldWrite,
  appended,
  key: retryQueueKey,
  value: nextQueue,
  retryQueueLength: nextQueue.length,
  retryReason: updateFailed ? 'netsuite_update_failed' : plan.reason || null,
  skippedReason: shouldWrite ? null : 'not_retryable_or_missing_webhook_body',
}];
