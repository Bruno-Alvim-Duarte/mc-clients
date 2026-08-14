const config = input['map9QOY']?.[0] || {};
const payload = input['mapL4FH']?.[0] || {};

const key = config.missingSkuBatchAlertKey || 'lionel_fba_invoice_missing_sku_batch_alert';
const batchId = config.batchId || config.updatedBefore || input.system?.nowIso || new Date().toISOString();
const missingSkuDetails = payload.missingSkuDetails || [];
const inventoryShortageDetails = payload.inventoryShortageDetails || [];

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
const existing = parseObject(memory[key]);
const batch = existing.batchId === batchId
  ? existing
  : {
      batchId,
      workflowName: config.workflowName || 'Amazon FBA to NetSuite - FBA Invoice Sync',
      startedAt: input.system?.nowIso || new Date().toISOString(),
      skus: {},
      inventoryShortages: {},
      orderIds: []
    };

if (!batch.skus || typeof batch.skus !== 'object' || Array.isArray(batch.skus)) {
  batch.skus = {};
}

if (!batch.inventoryShortages || typeof batch.inventoryShortages !== 'object' || Array.isArray(batch.inventoryShortages)) {
  batch.inventoryShortages = {};
}

if (!Array.isArray(batch.orderIds)) {
  batch.orderIds = [];
}

const seenOrderIds = new Set(batch.orderIds.map(id => String(id || '').trim()).filter(Boolean));

for (const detail of missingSkuDetails) {
  const sku = String(detail.sku || '').trim();
  const amazonOrderId = String(detail.amazonOrderId || payload.amazonOrderId || '').trim();
  if (!sku || !amazonOrderId) continue;

  if (!batch.skus[sku]) {
    batch.skus[sku] = {
      sku,
      amazonSkus: [],
      orders: []
    };
  }

  if (!Array.isArray(batch.skus[sku].amazonSkus)) {
    batch.skus[sku].amazonSkus = [];
  }

  const amazonSku = String(detail.amazonSku || '').trim();
  if (amazonSku && batch.skus[sku].amazonSkus.indexOf(amazonSku) === -1) {
    batch.skus[sku].amazonSkus.push(amazonSku);
  }

  const orderKey = [
    amazonOrderId,
    detail.amazonOrderItemId || '',
    detail.quantity || 0
  ].join('|');

  const alreadyExists = batch.skus[sku].orders.some(order =>
    [
      order.amazonOrderId,
      order.amazonOrderItemId || '',
      order.quantity || 0
    ].join('|') === orderKey
  );

  if (!alreadyExists) {
    batch.skus[sku].orders.push({
      amazonOrderId,
      amazonOrderItemId: detail.amazonOrderItemId || '',
      amazonSku,
      netsuiteSearchSku: detail.netsuiteSearchSku || sku,
      skuMatchStrategy: detail.skuMatchStrategy || '',
      skuSearchAttempts: detail.skuSearchAttempts || [],
      title: detail.title || '',
      asin: detail.asin || '',
      quantity: Number(detail.quantity || 0) || 0,
      marketplaceId: detail.marketplaceId || payload.marketplaceId || '',
      purchaseDate: detail.purchaseDate || payload.originalAmazonPurchaseDate || '',
      lastUpdateDate: detail.lastUpdateDate || ''
    });
  }

  if (!seenOrderIds.has(amazonOrderId)) {
    batch.orderIds.push(amazonOrderId);
    seenOrderIds.add(amazonOrderId);
  }
}

for (const detail of inventoryShortageDetails) {
  const sku = String(detail.sku || '').trim();
  const netsuiteItemId = String(detail.netsuiteItemId || '').trim();
  const locationId = String(detail.locationId || payload.inventoryLocationId || '').trim();
  const amazonOrderId = String(detail.amazonOrderId || payload.amazonOrderId || '').trim();
  if ((!sku && !netsuiteItemId) || !amazonOrderId) continue;

  const shortageKey = [
    sku || '(missing sku)',
    netsuiteItemId || '(missing item)',
    locationId || '(missing location)'
  ].join('|');

  if (!batch.inventoryShortages[shortageKey]) {
    batch.inventoryShortages[shortageKey] = {
      sku,
      amazonSku: detail.amazonSku || '',
      netsuiteSearchSku: detail.netsuiteSearchSku || sku,
      netsuiteItemId,
      netsuiteItemName: detail.netsuiteItemName || '',
      locationId,
      orders: []
    };
  }

  const orderKey = [
    amazonOrderId,
    detail.requiredQuantity || 0,
    detail.availableQuantity || 0,
    detail.shortageQuantity || 0
  ].join('|');

  const alreadyExists = batch.inventoryShortages[shortageKey].orders.some(order =>
    [
      order.amazonOrderId,
      order.requiredQuantity || 0,
      order.availableQuantity || 0,
      order.shortageQuantity || 0
    ].join('|') === orderKey
  );

  if (!alreadyExists) {
    batch.inventoryShortages[shortageKey].orders.push({
      amazonOrderId,
      amazonSku: detail.amazonSku || '',
      netsuiteSearchSku: detail.netsuiteSearchSku || sku,
      skuMatchStrategy: detail.skuMatchStrategy || '',
      skuSearchAttempts: detail.skuSearchAttempts || [],
      requiredQuantity: Number(detail.requiredQuantity || 0) || 0,
      availableQuantity: Number(detail.availableQuantity || 0) || 0,
      shortageQuantity: Number(detail.shortageQuantity || 0) || 0,
      marketplaceId: detail.marketplaceId || payload.marketplaceId || '',
      purchaseDate: detail.purchaseDate || payload.originalAmazonPurchaseDate || '',
      lastUpdateDate: detail.lastUpdateDate || '',
      source: detail.source || ''
    });
  }

  if (!seenOrderIds.has(amazonOrderId)) {
    batch.orderIds.push(amazonOrderId);
    seenOrderIds.add(amazonOrderId);
  }
}

batch.updatedAt = input.system?.nowIso || new Date().toISOString();

return [{
  key,
  value: batch,
  hasMissingSkuDetails: missingSkuDetails.length > 0,
  hasInventoryShortageDetails: inventoryShortageDetails.length > 0,
  hasBatchAlertDetails: missingSkuDetails.length > 0 || inventoryShortageDetails.length > 0
}];
