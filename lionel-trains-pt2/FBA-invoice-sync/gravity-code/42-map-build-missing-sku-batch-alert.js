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
const inventoryShortages = batch.batchId === batchId && batch.inventoryShortages && typeof batch.inventoryShortages === 'object'
  ? Object.values(batch.inventoryShortages)
  : [];

const sortedSkus = skus
  .filter(record => record && record.sku && Array.isArray(record.orders) && record.orders.length)
  .sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
const sortedInventoryShortages = inventoryShortages
  .filter(record => record && Array.isArray(record.orders) && record.orders.length)
  .sort((a, b) =>
    String(a.sku || a.netsuiteItemId || '').localeCompare(String(b.sku || b.netsuiteItemId || '')) ||
    String(a.locationId || '').localeCompare(String(b.locationId || ''))
  );

const orderIds = Array.from(new Set(
  [
    ...sortedSkus.flatMap(record =>
      record.orders.map(order => String(order.amazonOrderId || '').trim()).filter(Boolean)
    ),
    ...sortedInventoryShortages.flatMap(record =>
      record.orders.map(order => String(order.amazonOrderId || '').trim()).filter(Boolean)
    )
  ]
)).sort();

const bodyParts = [
  'Amazon FBA orders were skipped because NetSuite validation failed before invoice creation.',
  '',
  `Missing SKU count: ${sortedSkus.length}`,
  `Insufficient inventory item/location count: ${sortedInventoryShortages.length}`,
  `Affected order count: ${orderIds.length}`,
];

function formatSkuSearchAttempts(attempts) {
  if (!Array.isArray(attempts) || !attempts.length) return '';

  return attempts
    .map(attempt =>
      `${attempt.strategy || 'search'}=${attempt.sku || '(blank)'} (${attempt.resultCount || 0})`
    )
    .join(', ');
}

function inferSkuMatchStrategy(order) {
  const explicit = String(order.skuMatchStrategy || '').trim();
  if (explicit) return explicit;

  const attempts = Array.isArray(order.skuSearchAttempts) ? order.skuSearchAttempts : [];
  for (let i = attempts.length - 1; i >= 0; i--) {
    const strategy = String(attempts[i]?.strategy || '').trim();
    if (strategy) return strategy;
  }

  const amazonSku = String(order.amazonSku || '').trim();
  const netsuiteSearchSku = String(order.netsuiteSearchSku || '').trim();
  if (amazonSku && netsuiteSearchSku && amazonSku === netsuiteSearchSku) return 'exact';
  if (netsuiteSearchSku) return 'not_captured';
  return '';
}

function formatOrderSkuSearchAttempts(order, fallbackSku) {
  const searchAttempts = formatSkuSearchAttempts(order.skuSearchAttempts);
  if (searchAttempts) return searchAttempts;

  const sku = String(order.netsuiteSearchSku || fallbackSku || order.amazonSku || '').trim();
  if (!sku) return '';

  return `${inferSkuMatchStrategy(order) || 'not_captured'}=${sku} (0)`;
}

if (sortedSkus.length) {
  bodyParts.push('', 'Missing SKU details:');

  for (const record of sortedSkus) {
    bodyParts.push('', `SKU: ${record.sku}`);

    const amazonSkus = Array.isArray(record.amazonSkus)
      ? record.amazonSkus.filter(Boolean)
      : [];

    if (amazonSkus.length) {
      bodyParts.push(`Amazon SKU(s): ${amazonSkus.join(', ')}`);
    }

    const orders = record.orders.slice().sort((a, b) =>
      String(a.amazonOrderId || '').localeCompare(String(b.amazonOrderId || ''))
    );

    for (const order of orders) {
      const matchStrategy = inferSkuMatchStrategy(order);
      const searchAttempts = formatOrderSkuSearchAttempts(order, record.sku);
      bodyParts.push(
        [
          `- Order: ${order.amazonOrderId || '(unknown)'}`,
          `Qty: ${order.quantity || 0}`,
          `Amazon SKU: ${order.amazonSku || '(blank)'}`,
          `NetSuite Search SKU: ${order.netsuiteSearchSku || record.sku || '(blank)'}`,
          `Match Strategy: ${matchStrategy || '(blank)'}`,
          `Search Attempts: ${searchAttempts || '(blank)'}`,
          `Amazon Order Item ID: ${order.amazonOrderItemId || '(blank)'}`,
          `ASIN: ${order.asin || '(blank)'}`,
          `Purchase Date: ${order.purchaseDate || '(blank)'}`,
          `Title: ${order.title || '(blank)'}`
        ].join(' | ')
      );
    }
  }
}

if (sortedInventoryShortages.length) {
  bodyParts.push('', 'Insufficient NetSuite inventory details:');

  for (const record of sortedInventoryShortages) {
    bodyParts.push(
      '',
      [
        `SKU: ${record.sku || '(blank)'}`,
        `Amazon SKU: ${record.amazonSku || '(blank)'}`,
        `NetSuite Search SKU: ${record.netsuiteSearchSku || record.sku || '(blank)'}`,
        `NetSuite Item ID: ${record.netsuiteItemId || '(blank)'}`,
        `Location: ${record.locationId || '(blank)'}`,
        `Item Name: ${record.netsuiteItemName || '(blank)'}`
      ].join(' | ')
    );

    const orders = record.orders.slice().sort((a, b) =>
      String(a.amazonOrderId || '').localeCompare(String(b.amazonOrderId || ''))
    );

    for (const order of orders) {
      const matchStrategy = inferSkuMatchStrategy(order);
      const searchAttempts = formatOrderSkuSearchAttempts(order, record.netsuiteSearchSku || record.sku);
      bodyParts.push(
        [
          `- Order: ${order.amazonOrderId || '(unknown)'}`,
          `Amazon SKU: ${order.amazonSku || '(blank)'}`,
          `NetSuite Search SKU: ${order.netsuiteSearchSku || record.netsuiteSearchSku || record.sku || '(blank)'}`,
          `Match Strategy: ${matchStrategy || '(blank)'}`,
          `Search Attempts: ${searchAttempts || '(blank)'}`,
          `Required: ${order.requiredQuantity || 0}`,
          `Available: ${order.availableQuantity || 0}`,
          `Shortage: ${order.shortageQuantity || 0}`,
          `Purchase Date: ${order.purchaseDate || '(blank)'}`,
          `Source: ${order.source || '(blank)'}`
        ].join(' | ')
      );
    }
  }
}

bodyParts.push(
  '',
  'No NetSuite invoices were created for these orders. The orders remain in retry memory and will be retried after the missing NetSuite items, SKU mappings, or inventory quantities are corrected.'
);

const hasBatchValidationAlerts = sortedSkus.length > 0 || sortedInventoryShortages.length > 0;

return [{
  key,
  resetValue: {},
  hasMissingSkuAlerts: hasBatchValidationAlerts,
  hasBatchValidationAlerts,
  sendEmail: hasBatchValidationAlerts ? 'Yes' : 'No',
  to: config.recipients,
  subject: `[${input?.workflowArguments?.storeName}] Amazon FBA to NetSuite - FBA Invoice Sync - NetSuite validation batch alert (${orderIds.length} orders)`,
  body: bodyParts.join('\n')
}];
