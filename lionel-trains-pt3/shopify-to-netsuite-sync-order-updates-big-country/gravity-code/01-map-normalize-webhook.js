const WORKFLOW_NAME = 'Shopify to NetSuite - Sync Order Updates (Big Country)';
const ALERT_RECIPIENTS = 'bruno@mindcloud.co,AMiller@lionel.com,jjones@lionel.com';

function findWebhookEnvelope(source) {
  if (!source || typeof source !== 'object') return {};

  const candidates = [
    source.webhook,
    source.trigger,
    source.request,
    source.body,
    source.workflowArguments?.testWebhook,
  ];

  for (const candidate of candidates) {
    const item = Array.isArray(candidate) ? candidate[0] : candidate;
    if (item && typeof item === 'object' && (item.headers || item.body)) {
      return item;
    }
  }

  for (const value of Object.values(source)) {
    const item = Array.isArray(value) ? value[0] : value;
    if (item && typeof item === 'object' && (item.headers || item.body)) {
      return item;
    }
  }

  return {};
}

function lastGidPart(value) {
  if (!value) return null;
  return String(value).split('/').pop();
}

function asGid(type, numericId) {
  return numericId ? `gid://shopify/${type}/${numericId}` : null;
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map(String);
  if (!value) return [];
  return String(value)
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean);
}

const envelope = findWebhookEnvelope(input);
const headers = envelope.headers || {};
const body = envelope.body || {};
const orderEdit = body.order_edit || {};
const topic = String(headers['x-shopify-topic'] || headers['X-Shopify-Topic'] || '').trim();

const orderNumericId = String(
  headers['x-shopify-order-id'] ||
    headers['X-Shopify-Order-Id'] ||
    orderEdit.order_id ||
    body.id ||
    ''
).trim();

const orderGid =
  body.admin_graphql_api_id ||
  orderEdit.admin_graphql_api_id ||
  asGid('Order', orderNumericId);

const isEdit = topic === 'orders/edited' || !!body.order_edit;
const isCancellation = topic === 'orders/cancelled' || !!body.cancelled_at;

return [{
  workflowName: WORKFLOW_NAME,
  alertRecipients: ALERT_RECIPIENTS,
  webhook: {
    topic,
    eventId: headers['x-shopify-event-id'] || null,
    webhookId: headers['x-shopify-webhook-id'] || null,
    triggeredAt: headers['x-shopify-triggered-at'] || null,
    shopDomain: headers['x-shopify-shop-domain'] || null,
    method: envelope.method || null,
    url: envelope.url || null,
  },
  eventType: isCancellation ? 'cancellation' : isEdit ? 'edit' : 'unknown',
  isEdit,
  isCancellation,
  order: {
    numericId: orderNumericId || lastGidPart(orderGid),
    gid: orderGid,
    name: body.name || null,
    tags: parseTags(body.tags),
    cancelReason: body.cancel_reason || null,
    cancelledAt: body.cancelled_at || null,
    closedAt: body.closed_at || null,
    updatedAt: body.updated_at || null,
  },
  orderEdit: isEdit ? {
    id: orderEdit.id || null,
    appId: orderEdit.app_id || null,
    createdAt: orderEdit.created_at || null,
    committedAt: orderEdit.committed_at || null,
    staffNote: orderEdit.staff_note || '',
    notifyCustomer: !!orderEdit.notify_customer,
    lineItems: orderEdit.line_items || { additions: [], removals: [] },
    discounts: orderEdit.discounts || {},
    shippingLines: orderEdit.shipping_lines || { additions: [], removals: [] },
  } : null,
  rawBody: body,
}];
