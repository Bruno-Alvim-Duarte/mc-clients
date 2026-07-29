const config = input['map9QOY']?.[0] || {};
const source = input['mapL4FH']?.[0] || {};
const amazonOrderId = String(source.amazonOrderId || source.AmazonOrderId || '').trim();

const current = (() => {
  const value = input.memory?.['lionel_fba_invoice_retry_orders'];
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) { return []; }
})();

const withoutCurrent = current.filter(record =>
  String(record.amazonOrderId || record.orderId || '').trim() !== amazonOrderId
);

if (amazonOrderId) {
  withoutCurrent.push({
    amazonOrderId,
    reason: source.validationErrors || [],
    lastAttemptAt: input.system?.nowIso || new Date().toISOString()
  });
}

return [{
  key: config.retryQueueKey || 'lionel_fba_invoice_retry_orders',
  value: withoutCurrent
}];