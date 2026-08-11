const config = input['map9QOY']?.[0] || {};
const orders = input['map7D02'] || [];
const memoryState = input['map3HMU']?.[0] || {};
const previousCheckpoint = memoryState.checkpoint || {};

// Read the retry queue from memory (updated during the loop by Steps 26/30)
const retryQueue = (() => {
  const memory = input.memory?.environment || input.memory || {};
  const value = memory['lionel_fba_invoice_retry_orders'];
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
})();

// Build set of order IDs currently in the retry queue
const retryOrderIds = new Set(
  retryQueue.map(r => String(r.amazonOrderId || r.orderId || '').trim()).filter(Boolean)
);

// Build set of batch order IDs
const batchOrderIds = orders.map(o =>
  String(o.AmazonOrderId || o.amazonOrderId || '').trim()
).filter(Boolean);

// Count how many batch orders are NOT in the retry queue
// (i.e., orders that were successfully processed or skipped as existing)
const nonRetryCount = batchOrderIds.filter(id => !retryOrderIds.has(id)).length;

// If no orders in the batch, or every batch order ended up in the retry queue,
// do NOT advance the checkpoint — preserve the previous one so the same window
// is re-processed on the next run.
const allFailed = batchOrderIds.length > 0 && nonRetryCount === 0;

const dates = orders
  .map(o => o.LastUpdateDate || o.lastUpdateDate)
  .filter(Boolean)
  .sort();

const nextCheckpoint = dates.length ? dates[dates.length - 1] : config.updatedAfter;

const effectiveCheckpoint = allFailed
  ? (previousCheckpoint.lastUpdatedAfter || config.updatedAfter)
  : nextCheckpoint;

return [{
  key: config.checkpointKey,
  value: {
    lastUpdatedAfter: effectiveCheckpoint,
    lastOrderCount: orders.length,
    allFailed,
    advancedCheckpoint: !allFailed,
    updatedAt: input.system?.nowIso || new Date().toISOString()
  }
}];
