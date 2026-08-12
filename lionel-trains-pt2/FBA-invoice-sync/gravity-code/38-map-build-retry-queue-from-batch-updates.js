const config = input['map9QOY']?.[0] || {};
const groupedRetryQueueUpdates = input['groupResultsJBQV'] || [];

function parseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  return [];
}

function retryOrderId(record) {
  return String(record?.amazonOrderId || record?.orderId || record?.AmazonOrderId || '').trim();
}

function collectRetryUpdates(value, collected = []) {
  if (!value) return collected;

  if (typeof value === 'string') {
    collectRetryUpdates(parseArray(value), collected);
    return collected;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectRetryUpdates(item, collected);
    return collected;
  }

  if (typeof value !== 'object') return collected;

  if (value.retryQueueUpdateType && retryOrderId(value)) {
    collected.push(value);
    return collected;
  }

  for (const nested of Object.values(value)) {
    collectRetryUpdates(nested, collected);
  }

  return collected;
}

const key = config.retryQueueKey || 'lionel_fba_invoice_retry_orders';
const memory = input.memory?.environment || input.memory || {};
const current = parseArray(memory[key]);
const byOrderId = new Map();

for (const record of current) {
  const amazonOrderId = retryOrderId(record);
  if (!amazonOrderId) continue;

  byOrderId.set(amazonOrderId, {
    ...record,
    amazonOrderId
  });
}

const updates = collectRetryUpdates(groupedRetryQueueUpdates);
const latestUpdateByOrderId = new Map();

for (const update of updates) {
  const amazonOrderId = retryOrderId(update);
  if (!amazonOrderId) continue;

  latestUpdateByOrderId.set(amazonOrderId, {
    ...update,
    amazonOrderId
  });
}

for (const update of latestUpdateByOrderId.values()) {
  if (update.retryQueueUpdateType === 'remove') {
    byOrderId.delete(update.amazonOrderId);
    continue;
  }

  if (update.retryQueueUpdateType === 'add') {
    byOrderId.delete(update.amazonOrderId);
    byOrderId.set(update.amazonOrderId, {
      amazonOrderId: update.amazonOrderId,
      reason: Array.isArray(update.reason) ? update.reason : [String(update.reason || 'Retry requested')],
      lastAttemptAt: update.lastAttemptAt || input.system?.nowIso || new Date().toISOString(),
      retrySource: update.source || 'batch_update'
    });
  }
}

return [{
  key,
  value: Array.from(byOrderId.values()),
  updateCount: updates.length,
  uniqueUpdatedOrderCount: latestUpdateByOrderId.size
}];
