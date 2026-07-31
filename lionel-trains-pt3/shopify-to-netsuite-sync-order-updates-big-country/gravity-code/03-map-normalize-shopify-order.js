const webhook = input['REPLACE_WITH_01_MAP_NORMALIZE_WEBHOOK_STEP_KEY']?.[0] || {};
const graphqlResponse = input['REPLACE_WITH_SHOPIFY_GRAPHQL_BETA_STEP_KEY']?.[0] || {};
const workflowArguments = input.workflowArguments || {};
const NETSUITE_AMAZON_LOCATION_ID = 152;
const SHOPIFY_LOCATION_TO_NETSUITE_LOCATION_OVERRIDES = {
  'gid://shopify/Location/72788476094': NETSUITE_AMAZON_LOCATION_ID,
};

function nodes(connectionOrArray) {
  if (!connectionOrArray) return [];
  if (Array.isArray(connectionOrArray)) return connectionOrArray;
  if (Array.isArray(connectionOrArray.nodes)) return connectionOrArray.nodes;
  if (Array.isArray(connectionOrArray.edges)) {
    return connectionOrArray.edges.map(edge => edge && edge.node).filter(Boolean);
  }
  return [];
}

function money(value) {
  const amount =
    value?.shopMoney?.amount ||
    value?.shop_money?.amount ||
    value?.amount ||
    null;

  if (amount === null || amount === undefined || amount === '') return 0;
  const num = Number(amount);
  return Number.isFinite(num) ? num : 0;
}

function lastGidPart(value) {
  if (!value) return null;
  return String(value).split('/').pop();
}

function normalizeAddress(address) {
  if (!address) return null;
  return {
    firstName: address.firstName || address.first_name || '',
    lastName: address.lastName || address.last_name || '',
    name: address.name || [address.firstName || address.first_name, address.lastName || address.last_name].filter(Boolean).join(' '),
    company: address.company || '',
    address1: address.address1 || '',
    address2: address.address2 || '',
    city: address.city || '',
    province: address.province || '',
    provinceCode: address.provinceCode || address.province_code || '',
    country: address.country || '',
    countryCodeV2: address.countryCodeV2 || address.country_code || '',
    zip: address.zip || '',
    phone: address.phone || '',
  };
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  return String(value).split(',').map(tag => tag.trim()).filter(Boolean);
}

function getGraphqlOrder(response) {
  return response?.data?.order || response?.order || response?.body?.data?.order || null;
}

function getRestOrderFromWebhook(webhookRecord) {
  const body = webhookRecord.rawBody || {};
  if (body.order_edit) return null;
  return body;
}

function buildFulfillmentLocationByLineItem(order) {
  const byLineItemId = {};

  for (const fulfillmentOrder of nodes(order?.fulfillmentOrders)) {
    const location = fulfillmentOrder?.assignedLocation?.location || {};
    const shopifyLocationId = location.id || null;

    for (const fulfillmentLine of nodes(fulfillmentOrder?.lineItems)) {
      const lineItem = fulfillmentLine?.lineItem || {};
      const ids = [
        lineItem.id,
        lineItem.legacyResourceId,
        lineItem.id ? lastGidPart(lineItem.id) : null,
      ].filter(Boolean).map(String);

      for (const id of ids) {
      byLineItemId[id] = {
        shopifyLocationId,
        shopifyLocationLegacyId: location.legacyResourceId || lastGidPart(location.id),
        shopifyLocationName: location.name || '',
        netsuiteLocationId:
          SHOPIFY_LOCATION_TO_NETSUITE_LOCATION_OVERRIDES[shopifyLocationId] ||
          workflowArguments.locationID ||
          null,
      };
    }
  }
  }

  return byLineItemId;
}

const sourceOrder = getGraphqlOrder(graphqlResponse) || getRestOrderFromWebhook(webhook) || {};
const fulfillmentLocationByLineItem = buildFulfillmentLocationByLineItem(sourceOrder);

const lineItems = nodes(sourceOrder.lineItems || sourceOrder.line_items).map(line => {
  const id = line.id || line.admin_graphql_api_id || null;
  const legacyResourceId = line.legacyResourceId || line.id || line.line_item_id || lastGidPart(id);
  const location =
    fulfillmentLocationByLineItem[String(id)] ||
    fulfillmentLocationByLineItem[String(legacyResourceId)] ||
    fulfillmentLocationByLineItem[String(lastGidPart(id))] ||
    null;

  return {
    id,
    legacyResourceId,
    numericId: legacyResourceId ? String(legacyResourceId) : lastGidPart(id),
    sku: String(line.sku || line.variant?.sku || '').trim(),
    title: line.title || line.name || '',
    name: line.name || line.title || '',
    quantity: Number(line.currentQuantity ?? line.current_quantity ?? line.quantity ?? 0),
    originalQuantity: Number(line.quantity ?? 0),
    fulfillableQuantity: Number(line.fulfillableQuantity ?? line.fulfillable_quantity ?? 0),
    originalUnitPrice: money(line.originalUnitPriceSet || line.price_set || { amount: line.price }),
    discountedTotal: money(line.discountedTotalSet || line.pre_tax_price_set || { amount: line.pre_tax_price }),
    taxable: line.taxable !== false,
    requiresShipping: line.requiresShipping ?? line.requires_shipping ?? true,
    vendor: line.vendor || '',
    variantId: line.variant?.id || line.variant_id || null,
    productId: line.product?.id || line.product_id || null,
    fulfillmentLocation: location,
  };
}).filter(line => line.sku || line.quantity > 0 || line.id);

const tags = parseTags(sourceOrder.tags || webhook.order?.tags);
const orderName = sourceOrder.name || webhook.order?.name || null;
const numericId = String(sourceOrder.legacyResourceId || sourceOrder.id || webhook.order?.numericId || '').split('/').pop();

return [{
  workflowName: webhook.workflowName,
  alertRecipients: webhook.alertRecipients,
  webhook: webhook.webhook,
  eventType: webhook.eventType,
  isEdit: webhook.isEdit,
  isCancellation: webhook.isCancellation,
  exported: tags.some(tag => String(tag).trim().toLowerCase() === 'exported'),
  id: sourceOrder.id || webhook.order?.gid || null,
  numericId,
  name: orderName,
  tags,
  createdAt: sourceOrder.createdAt || sourceOrder.created_at || null,
  updatedAt: sourceOrder.updatedAt || sourceOrder.updated_at || webhook.order?.updatedAt || null,
  cancelledAt: sourceOrder.cancelledAt || sourceOrder.cancelled_at || webhook.order?.cancelledAt || null,
  cancelReason: sourceOrder.cancelReason || sourceOrder.cancel_reason || webhook.order?.cancelReason || null,
  financialStatus: sourceOrder.displayFinancialStatus || sourceOrder.financial_status || '',
  fulfillmentStatus: sourceOrder.displayFulfillmentStatus || sourceOrder.fulfillment_status || '',
  sourceName: sourceOrder.sourceName || sourceOrder.source_name || '',
  email: sourceOrder.email || '',
  phone: sourceOrder.phone || '',
  note: sourceOrder.note || '',
  customer: sourceOrder.customer || null,
  billingAddress: normalizeAddress(sourceOrder.billingAddress || sourceOrder.billing_address),
  shippingAddress: normalizeAddress(sourceOrder.shippingAddress || sourceOrder.shipping_address),
  lineItems,
  discountAmount: money(sourceOrder.currentTotalDiscountsSet || sourceOrder.current_total_discounts_set || sourceOrder.totalDiscountsSet || sourceOrder.total_discounts_set),
  totalAmount: money(sourceOrder.currentTotalPriceSet || sourceOrder.current_total_price_set || sourceOrder.totalPriceSet || sourceOrder.total_price_set),
  shippingAmount: money(sourceOrder.totalShippingPriceSet || sourceOrder.total_shipping_price_set),
  orderEdit: webhook.orderEdit,
  rawCancellationBody: webhook.isCancellation ? webhook.rawBody : null,
}];
