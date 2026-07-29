const config = input['map9QOY']?.[0] || {};
const order = input['mapQC7W']?.[0] || {};
const resolved = input['netsuiteExecuteCustomCode0OJ2']?.[0] || {};

const round = n => Math.round((Number(n) || 0) * 100) / 100;
const isPlaceholder = v => !v || String(v).startsWith('{{');

const itemLines = (resolved.matched || []).map(line => ({
  kind: 'amazon_item',
  sku: line.sku,
  title: line.title,
  itemInternalId: line.netsuiteItemId,
  quantity: line.quantity,
  rate: round(line.itemPrice / Math.max(line.quantity, 1)),
  amount: round(line.itemPrice),
  amazonOrderItemId: line.amazonOrderItemId,
}));

const totals = (order.lines || []).reduce(
  (acc, line) => {
    acc.shipping += line.shippingPrice || 0;
    acc.shippingTax += line.shippingTax || 0;
    acc.itemTax += line.itemTax || 0;
    acc.giftWrap += line.giftWrapPrice || 0;
    acc.giftWrapTax += line.giftWrapTax || 0;
    acc.discounts +=
      (line.promotionDiscount || 0) +
      (line.shippingDiscount || 0);

    return acc;
  },
  {
    shipping: 0,
    shippingTax: 0,
    itemTax: 0,
    giftWrap: 0,
    giftWrapTax: 0,
    discounts: 0,
  }
);

const shippingCost = round(totals.shipping);

const chargeLines = [];
const missingChargeMappings = [];

function addCharge(kind, itemId, amount, description) {
  const rounded = round(amount);

  if (Math.abs(rounded) < 0.005) return;

  if (isPlaceholder(itemId)) {
    missingChargeMappings.push(kind);
    return;
  }

  chargeLines.push({
    kind,
    itemInternalId: String(itemId),
    quantity: 1,
    rate: rounded,
    amount: rounded,
    description,
  });
}

addCharge(
  'giftWrap',
  config.chargeItems.giftWrap,
  totals.giftWrap,
  `Amazon gift wrap for order ${order.amazonOrderId}`
);

addCharge(
  'promotionDiscount',
  config.chargeItems.promotionDiscount,
  -Math.abs(totals.discounts),
  `Amazon discounts for order ${order.amazonOrderId}`
);

const validationErrors = [];

if (!resolved.hasAllItems) {
  validationErrors.push(
    `Missing NetSuite item SKUs: ${(resolved.missingSkus || []).join(', ') || 'none'}; duplicate NetSuite item SKUs: ${(resolved.duplicateSkus || []).join(', ') || 'none'}.`
  );
}

if (missingChargeMappings.length) {
  validationErrors.push(
    `Missing NetSuite charge item mappings: ${missingChargeMappings.join(', ')}.`
  );
}

if (!itemLines.length) {
  validationErrors.push('No invoice item lines were created.');
}

return {
  canCreate: validationErrors.length === 0,
  validationErrors,
  amazonOrderId: order.amazonOrderId,
  externalId: order.amazonOrderId,
  entity: config.netsuite.customerInternalId,
  subsidiary: config.netsuite.subsidiary,
  divisionFieldId: config.netsuite.divisionFieldId,
  division: config.netsuite.division,
  department: config.netsuite.department,
  class: config.netsuite.class,
  location: config.netsuite.location,
  shipmethod: config.netsuite.shipmethod,
  tranDate: order.purchaseDate,
  memo: `Amazon FBA order ${order.amazonOrderId}`,
  otherRefNum: order.amazonOrderId,
  marketplaceId: order.marketplaceId,
  currency: order.currency,
  shippingCost,
  itemLines,
  chargeLines,
  totals,
};