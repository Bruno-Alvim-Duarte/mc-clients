const shopifyOrder = input['mapCPX5']?.[0] || {};
const netsuiteLookup = input['netsuiteExecuteCustomCodePYKM']?.[0] || {};
const workflowArguments = input.workflowArguments || {};

// NetSuite orderstatus returns the compact Sales Order status code in this
// Gravity/SuiteScript context, not the full search statusref value.
// A = Pending Approval: safe to update.
// B = Pending Fulfillment: safe to update.
const ALLOWED_STATUS_REFS = new Set(['A', 'B']);

// C = Cancelled: already cancelled, do not process again.
// D = Partially Fulfilled: fulfillment has started, stop and alert.
// E = Pending Billing / Partially Fulfilled: fulfillment has started, stop and alert.
// F = Pending Billing / Fully Fulfilled or Billed / Fully Fulfilled: fulfillment is complete, stop and alert.
// H = Closed: order is closed, stop and alert.
const INELIGIBLE_STATUS_REFS = new Set(['C', 'D', 'E', 'F', 'H']);

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeSku(value) {
  return String(value || '').trim();
}

function normalizeSkuKey(value) {
  return normalizeSku(value).toLowerCase();
}

function duplicateValues(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const rawValue of values) {
    const value = normalizeSkuKey(rawValue);
    if (!value) continue;
    if (seen.has(value)) dupes.add(rawValue);
    seen.add(value);
  }
  return Array.from(dupes);
}

function buildStopPlan(reason, detail, alertLevel = 'warning') {
  return [{
    workflowName: shopifyOrder.workflowName,
    alertRecipients: shopifyOrder.alertRecipients,
    action: 'stop',
    canApply: false,
    shouldAlert: alertLevel !== 'info',
    alertLevel,
    reason,
    detail,
    eventType: shopifyOrder.eventType,
    shopifyOrder: {
      id: shopifyOrder.id,
      numericId: shopifyOrder.numericId,
      name: shopifyOrder.name,
    },
    netsuite: netsuiteLookup,
  }];
}

if (!shopifyOrder.name) {
  return buildStopPlan('missing_shopify_order_name', 'Shopify order name is required to find the NetSuite Sales Order.');
}

if (!shopifyOrder.exported) {
  return buildStopPlan('not_exported', `Shopify order ${shopifyOrder.name} does not have the Exported tag.`, 'info');
}

if (!netsuiteLookup.success) {
  return buildStopPlan('netsuite_lookup_failed', netsuiteLookup.message || 'NetSuite Sales Order lookup failed.', 'error');
}

if (!netsuiteLookup.found || netsuiteLookup.duplicate) {
  return buildStopPlan(
    netsuiteLookup.duplicate ? 'duplicate_sales_order' : 'sales_order_not_found',
    netsuiteLookup.message || `NetSuite Sales Order not found for Shopify order ${shopifyOrder.name}.`
  );
}

const salesOrder = netsuiteLookup.salesOrder || {};
const statusRef = salesOrder.orderStatus || salesOrder.statusRef || '';

if (!ALLOWED_STATUS_REFS.has(statusRef)) {
  const statusKnownIneligible = INELIGIBLE_STATUS_REFS.has(statusRef);
  return buildStopPlan(
    statusKnownIneligible ? 'sales_order_status_ineligible' : 'sales_order_status_unknown',
    `NetSuite Sales Order ${salesOrder.tranid || salesOrder.internalId} is ${salesOrder.orderStatusText || salesOrder.statusText || statusRef}. Only Pending Approval and Pending Fulfillment are eligible.`
  );
}

if (shopifyOrder.isCancellation) {
  return [{
    workflowName: shopifyOrder.workflowName,
    alertRecipients: shopifyOrder.alertRecipients,
    action: 'apply_cancellation',
    canApply: true,
    shouldAlert: false,
    eventType: 'cancellation',
    shopifyOrder: {
      id: shopifyOrder.id,
      numericId: shopifyOrder.numericId,
      name: shopifyOrder.name,
      cancelledAt: shopifyOrder.cancelledAt,
      cancelReason: shopifyOrder.cancelReason,
    },
    netsuite: {
      salesOrder,
      lines: netsuiteLookup.lines || [],
    },
    cancellation: {
      memoNote: [
        `Shopify cancellation received for ${shopifyOrder.name}`,
        shopifyOrder.cancelReason ? `reason: ${shopifyOrder.cancelReason}` : null,
        shopifyOrder.cancelledAt ? `cancelled at: ${shopifyOrder.cancelledAt}` : null,
      ].filter(Boolean).join(' | '),
    },
  }];
}

const activeShopifyLines = (shopifyOrder.lineItems || [])
  .map(line => ({
    ...line,
    sku: normalizeSku(line.sku),
    quantity: Number(line.quantity || 0),
    originalUnitPrice: roundMoney(line.originalUnitPrice || 0),
  }))
  .filter(line => line.sku && line.quantity > 0);

if (!activeShopifyLines.length) {
  return buildStopPlan('no_active_shopify_lines', `No active Shopify lines found for order ${shopifyOrder.name}.`);
}

const duplicateShopifySkus = duplicateValues(activeShopifyLines.map(line => line.sku));
if (duplicateShopifySkus.length) {
  return buildStopPlan('duplicate_shopify_skus', `Cannot safely update by SKU because Shopify has duplicate active SKUs: ${duplicateShopifySkus.join(', ')}.`);
}

const itemMatchesBySku = netsuiteLookup.itemMatchesBySku || {};
const itemMatchesByNormalizedSku = Object.keys(itemMatchesBySku).reduce((acc, sku) => {
  acc[normalizeSkuKey(sku)] = itemMatchesBySku[sku];
  return acc;
}, {});
const missingSkus = [];
const duplicateNetSuiteSkus = [];

const targetLines = activeShopifyLines.map(line => {
  const match = itemMatchesByNormalizedSku[normalizeSkuKey(line.sku)] || { count: 0, matches: [] };
  if (match.count === 0) missingSkus.push(line.sku);
  if (match.count > 1) duplicateNetSuiteSkus.push(line.sku);

  return {
    shopifyLineItemId: line.id,
    shopifyLineItemNumericId: line.numericId,
    sku: line.sku,
    title: line.title || line.name || line.sku,
    quantity: line.quantity,
    rate: line.originalUnitPrice,
    netsuiteItemId: match.item?.internalId || null,
    netsuiteLocationId: line.fulfillmentLocation?.netsuiteLocationId || workflowArguments.defaultLocationID || null,
    shopifyFulfillmentLocation: line.fulfillmentLocation || null,
  };
});

if (missingSkus.length || duplicateNetSuiteSkus.length) {
  return buildStopPlan(
    'item_matching_failed',
    [
      missingSkus.length ? `Missing NetSuite SKUs: ${missingSkus.join(', ')}` : null,
      duplicateNetSuiteSkus.length ? `Duplicate NetSuite SKUs: ${duplicateNetSuiteSkus.join(', ')}` : null,
    ].filter(Boolean).join('; ')
  );
}

const discountAmount = roundMoney(shopifyOrder.discountAmount || 0);

return [{
  workflowName: shopifyOrder.workflowName,
  alertRecipients: shopifyOrder.alertRecipients,
  action: 'apply_edit',
  canApply: true,
  shouldAlert: false,
  eventType: 'edit',
  shopifyOrder: {
    id: shopifyOrder.id,
    numericId: shopifyOrder.numericId,
    name: shopifyOrder.name,
    updatedAt: shopifyOrder.updatedAt,
    orderEdit: shopifyOrder.orderEdit,
  },
  netsuite: {
    salesOrder,
    lines: netsuiteLookup.lines || [],
  },
  edit: {
    shippingAddress: shopifyOrder.shippingAddress,
    billingAddress: shopifyOrder.billingAddress,
    customer: shopifyOrder.customer,
    email: shopifyOrder.email,
    phone: shopifyOrder.phone,
    targetLines,
    discountAmount,
    discountItemId: workflowArguments.discountID || null,
    discountPercentFieldId: 'custbody_shopify_disc_pct',
    defaultLocationId: workflowArguments.defaultLocationID || null,
    memoNote: `Shopify edit synced for ${shopifyOrder.name} at ${new Date().toISOString()}`,
  },
}];
