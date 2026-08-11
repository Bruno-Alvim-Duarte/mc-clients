const config = input['map9QOY']?.[0] || {};
const currentOrders = input['amazonSellerListOrdersKFHW'] || [];
const groupedRetryOrderResults = input['groupResults4EHS'] || [];

function parseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }
  return [];
}

function orderId(sourceOrder) {
  return String(
    sourceOrder?.AmazonOrderId ||
    sourceOrder?.amazonOrderId ||
    sourceOrder?.id ||
    ''
  ).trim();
}

function collectOrders(value, collected = []) {
  if (!value) return collected;

  if (typeof value === 'string') {
    collectOrders(parseArray(value), collected);
    return collected;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectOrders(item, collected);
    return collected;
  }

  if (typeof value !== 'object') return collected;

  if (orderId(value)) {
    collected.push(value);
    return collected;
  }

  const wrapperKeys = [
    'results',
    'result',
    'response',
    'responses',
    'amazonSellerGetOrderGSDY',
    'data',
    'output',
    'outputs',
    'items',
    'orders',
    'Order',
    'Orders'
  ];

  for (const key of wrapperKeys) {
    if (value[key]) collectOrders(value[key], collected);
  }

  return collected;
}

const retryIds = new Set(
  (config.retryOrderIds || [])
    .map(id => String(id || '').trim())
    .filter(Boolean)
);

const retryCacheById = new Map();
const groupedRetryOrders = collectOrders(groupedRetryOrderResults);

for (const order of groupedRetryOrders) {
  const id = orderId(order);
  if (!id || !retryIds.has(id)) continue;

  retryCacheById.set(id, order);
}

const retrySources = Array.from(retryCacheById.values());
const byId = new Map();

for (const sourceOrder of currentOrders) {
  const id = orderId(sourceOrder);
  if (!id) continue;

  const status = String(
    sourceOrder.OrderStatus ||
    sourceOrder.orderStatus ||
    ''
  ).toLowerCase();

  const channel = String(
    sourceOrder.FulfillmentChannel ||
    sourceOrder.fulfillmentChannel ||
    ''
  ).toUpperCase();

  if (status && status !== 'shipped') continue;
  if (channel && channel !== 'AFN') continue;

  byId.set(id, {
    ...sourceOrder,
    AmazonOrderId: id,
    isRetry: retryIds.has(id) || Boolean(sourceOrder.isRetry),
  });
}

for (const sourceOrder of retrySources) {
  const id = orderId(sourceOrder);
  if (!id) continue;

  const status = String(
    sourceOrder.OrderStatus ||
    sourceOrder.orderStatus ||
    ''
  ).toLowerCase();

  const channel = String(
    sourceOrder.FulfillmentChannel ||
    sourceOrder.fulfillmentChannel ||
    ''
  ).toUpperCase();

  if (status && status !== 'shipped') continue;
  if (channel && channel !== 'AFN') continue;

  byId.set(id, {
    ...sourceOrder,
    AmazonOrderId: id,
    isRetry: true,
  });
}

return Array.from(byId.values()).sort((a, b) =>
  Number(Boolean(b.isRetry)) - Number(Boolean(a.isRetry)) ||
  String(a.LastUpdateDate || a.lastUpdateDate || '').localeCompare(
    String(b.LastUpdateDate || b.lastUpdateDate || '')
  ) ||
  String(a.AmazonOrderId).localeCompare(String(b.AmazonOrderId))
);
