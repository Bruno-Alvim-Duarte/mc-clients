const config = input['map9QOY']?.[0] || {};
const order = input['iterate7INU']?.[0] || {};
const raw = input['amazonSellerGetOrderItemsNFJ8'] || [];

const itemRows = raw.flatMap(x =>
  Array.isArray(x?.OrderItems) ? x.OrderItems :
  Array.isArray(x?.orderItems) ? x.orderItems :
  Array.isArray(x?.items) ? x.items :
  Array.isArray(x) ? x : [x]
).filter(Boolean);

const money = v => Number(v?.Amount ?? v?.amount ?? v ?? 0) || 0;
const round = n => Math.round((Number(n) || 0) * 100) / 100;
const amazonOrderId = String(order.AmazonOrderId || order.amazonOrderId || '').trim();

const lines = itemRows.map(item => {
  const quantity = Number(item.QuantityOrdered ?? item.quantityOrdered ?? item.QuantityShipped ?? item.quantity ?? 0) || 0;
  return {
    amazonOrderItemId: String(item.OrderItemId || item.orderItemId || ''),
    sku: String(item.SellerSKU || item.sellerSKU || item.SKU || item.sku || '').trim(),
    title: item.Title || item.title || '',
    asin: item.ASIN || item.asin || '',
    quantity,
    itemPrice: round(money(item.ItemPrice || item.itemPrice)),
    itemTax: round(money(item.ItemTax || item.itemTax)),
    shippingPrice: round(money(item.ShippingPrice || item.shippingPrice)),
    shippingTax: round(money(item.ShippingTax || item.shippingTax)),
    shippingDiscount: round(money(item.ShippingDiscount || item.shippingDiscount)),
    promotionDiscount: round(money(item.PromotionDiscount || item.promotionDiscount)),
    giftWrapPrice: round(money(item.GiftWrapPrice || item.giftWrapPrice)),
    giftWrapTax: round(money(item.GiftWrapTax || item.giftWrapTax))
  };
}).filter(line => line.quantity > 0);

const validationErrors = [];
if (!amazonOrderId) validationErrors.push('Missing AmazonOrderId.');
if (!lines.length) validationErrors.push(`No order items returned for Amazon order ${amazonOrderId || '(unknown)'}.`);
for (const line of lines) {
  if (!line.sku) validationErrors.push(`Missing Seller SKU for Amazon order item ${line.amazonOrderItemId || '(unknown)'}.`);
  if (line.itemPrice === 0) validationErrors.push(`Zero item price for SKU ${line.sku || '(missing sku)'}.`);
}

return [{
  amazonOrderId,
  marketplaceId: order.MarketplaceId || order.marketplaceId || null,
  purchaseDate: order.PurchaseDate || order.purchaseDate || null,
  lastUpdateDate: order.LastUpdateDate || order.lastUpdateDate || null,
  currency: order.OrderTotal?.CurrencyCode || order.orderTotal?.currencyCode || itemRows[0]?.ItemPrice?.CurrencyCode || null,
  isRetry: Boolean(order.isRetry),
  customerInternalId: config.netsuite.customerInternalId,
  lines,
  validationErrors,
  hasRequiredData: validationErrors.length === 0
}];