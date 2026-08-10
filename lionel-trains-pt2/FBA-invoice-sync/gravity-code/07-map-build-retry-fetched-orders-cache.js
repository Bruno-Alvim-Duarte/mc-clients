const config = input['map9QOY']?.[0] || {};
const retryRecord = input['iterateUR9J']?.[0] || {};
const raw = input['amazonSellerGetOrderGSDY'] || [];

const existing = (() => {
  const memory = input.memory?.environment || input.memory || {};
  const value = memory['lionel_fba_invoice_retry_fetched_orders'];
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
})();

const order = raw.find(Boolean) || {};
const amazonOrderId = String(order.AmazonOrderId || order.amazonOrderId || retryRecord.amazonOrderId || '').trim();

const next = existing.filter(item =>
  String(item.AmazonOrderId || item.amazonOrderId || '').trim() !== amazonOrderId
);

if (amazonOrderId) {
  next.push({
    ...order,
    AmazonOrderId: amazonOrderId,
    isRetry: true,
    retryReason: retryRecord.reason || retryRecord.validationErrors || null,
    retryLastAttemptAt: retryRecord.lastAttemptAt || null
  });
}

return [{
  key: config.retryFetchedOrdersKey || 'lionel_fba_invoice_retry_fetched_orders',
  value: next
}];
