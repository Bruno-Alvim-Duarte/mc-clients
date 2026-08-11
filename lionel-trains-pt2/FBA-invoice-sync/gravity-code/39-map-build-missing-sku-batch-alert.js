const config = input['map9QOY']?.[0] || {};
const key = config.missingSkuBatchAlertKey || 'lionel_fba_invoice_missing_sku_batch_alert';
const batchId = config.batchId || config.updatedBefore || '';

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

const memory = input.memory?.environment || input.memory || {};
const batch = parseObject(memory[key]);
const skus = batch.batchId === batchId && batch.skus && typeof batch.skus === 'object'
  ? Object.values(batch.skus)
  : [];

const sortedSkus = skus
  .filter(record => record && record.sku && Array.isArray(record.orders) && record.orders.length)
  .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));

const orderIds = Array.from(new Set(
  sortedSkus.flatMap(record =>
    record.orders.map(order => String(order.amazonOrderId || '').trim()).filter(Boolean)
  )
)).sort();

const bodyParts = [
  'Amazon FBA orders were skipped because their SKUs were not found as active NetSuite items.',
  '',
  `Missing SKU count: ${sortedSkus.length}`,
  `Affected order count: ${orderIds.length}`,
  '',
  'Missing SKU details:'
];

for (const record of sortedSkus) {
  bodyParts.push('', `SKU: ${record.sku}`);

  const orders = record.orders.slice().sort((a, b) =>
    String(a.amazonOrderId || '').localeCompare(String(b.amazonOrderId || ''))
  );

  for (const order of orders) {
    bodyParts.push(
      [
        `- Order: ${order.amazonOrderId || '(unknown)'}`,
        `Qty: ${order.quantity || 0}`,
        `Amazon Order Item ID: ${order.amazonOrderItemId || '(blank)'}`,
        `ASIN: ${order.asin || '(blank)'}`,
        `Purchase Date: ${order.purchaseDate || '(blank)'}`,
        `Title: ${order.title || '(blank)'}`
      ].join(' | ')
    );
  }
}

bodyParts.push(
  '',
  'No NetSuite invoices were created for these orders. The orders remain in retry memory and will be retried after the missing NetSuite items are created or the Amazon SKU mapping is corrected.'
);

return [{
  key,
  resetValue: {},
  hasMissingSkuAlerts: sortedSkus.length > 0,
  sendEmail: sortedSkus.length > 0 ? 'Yes' : 'No',
  to: config.recipients,
  subject: `[${input.workflowArguments.storeName}] Amazon FBA to NetSuite - FBA Invoice Sync - Missing NetSuite SKUs (${sortedSkus.length})`,
  body: bodyParts.join('\n')
}];
