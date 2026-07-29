const config = input['map9QOY']?.[0] || {};
const order = input['mapL4FH']?.[0] || {};
const amazonOrderId = String(order.amazonOrderId || order.AmazonOrderId || '').trim();

const current = (() => {
  const value = input.memory?.['lionel_fba_invoice_retry_orders'];
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
})();

return [{
  key: config.retryQueueKey || 'lionel_fba_invoice_retry_orders',
  value: current.filter(record =>
    String(record.amazonOrderId || record.orderId || '').trim() !== amazonOrderId
  )
}];