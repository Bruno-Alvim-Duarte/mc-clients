const memory = input.memory || {};
const checkpointKey = 'lionel_fba_invoice_sync_checkpoint';
const retryQueueKey = 'lionel_fba_invoice_retry_orders';
const retryFetchedOrdersKey = 'lionel_fba_invoice_retry_fetched_orders';

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

function parseObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) { return {}; }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

const checkpoint = parseObject(memory[checkpointKey]);
const retryOrders = parseArray(memory[retryQueueKey])
  .map(record => ({
    ...record,
    amazonOrderId: String(record.amazonOrderId || record.orderId || '').trim()
  }))
  .filter(record => record.amazonOrderId);

const retryFetchedOrders = parseArray(memory[retryFetchedOrdersKey])
  .map(order => ({
    ...order,
    AmazonOrderId: String(order.AmazonOrderId || order.amazonOrderId || order.id || '').trim(),
    isRetry: true
  }))
  .filter(order => order.AmazonOrderId);

return [{
  checkpoint,
  retryOrders,
  retryFetchedOrders,
  retryOrderIds: Array.from(new Set(retryOrders.map(r => r.amazonOrderId))),
  keys: {
    checkpointKey,
    retryQueueKey,
    retryFetchedOrdersKey
  }
}];