const triggerInfo = input['mapLQYA']?.[0] || {};
const memoryResult = input['keyValueStorage1B39']?.[0] || {};
const workflowArguments = input.workflowArguments || {};

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

  if (Array.isArray(value)) return value;

  if (value && typeof value === 'object') {
    if (Array.isArray(value.records)) return value.records;
    if (Array.isArray(value.queue)) return value.queue;
    if (Array.isArray(value.items)) return value.items;
  }

  return [];
}

function retryBodyFromRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.webhookBody && typeof record.webhookBody === 'object') return record.webhookBody;
  if (record.rawBody && typeof record.rawBody === 'object') return record.rawBody;
  if (record.body && typeof record.body === 'object') return record.body;
  return record;
}

const retryWebhookUrl = triggerInfo.retryWebhookUrl || workflowArguments.retryWebhookUrl || workflowArguments.webhookUrl || '';
const retryQueueKey = triggerInfo.retryQueueKey || workflowArguments.retryQueueKey || 'big_country_order_update_retry_queue';
const queuedRecords = parseQueue(readMemoryValue(memoryResult))
  .map((record, index) => ({
    retryQueueKey,
    retryWebhookUrl,
    retryIndex: index,
    webhookBody: retryBodyFromRecord(record),
  }))
  .filter(record => record.webhookBody && typeof record.webhookBody === 'object');

return queuedRecords.map(record => ({
  ...record,
  queuedRecordCount: queuedRecords.length,
}));
