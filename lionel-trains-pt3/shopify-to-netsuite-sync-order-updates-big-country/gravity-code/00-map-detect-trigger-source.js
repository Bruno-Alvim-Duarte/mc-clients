const DEFAULT_RETRY_QUEUE_KEY = 'order_update_retry_queue';

function firstObject(value) {
  if (Array.isArray(value)) return value.find(item => item && typeof item === 'object') || null;
  return value && typeof value === 'object' ? value : null;
}

function hasWebhookEnvelope(value) {
  const item = firstObject(value);
  if (!item) return false;
  return !!(
    item.headers ||
    item.body ||
    item.method ||
    item.url
  );
}

function hasShopifyWebhookShape(value) {
  const item = firstObject(value);
  if (!item || !hasWebhookEnvelope(item)) return false;

  const headers = item.headers || {};
  const body = item.body || {};
  const topic = String(headers['x-shopify-topic'] || headers['X-Shopify-Topic'] || '').trim();

  return !!(
    topic ||
    body.order_edit ||
    body.cancelled_at ||
    body.admin_graphql_api_id ||
    headers['x-shopify-event-id'] ||
    headers['X-Shopify-Event-Id']
  );
}

function hasDirectWebhook(source) {
  if (!source || typeof source !== 'object') return false;

  if (hasShopifyWebhookShape(source)) return true;
  if (hasShopifyWebhookShape(source.webhook)) return true;
  if (hasShopifyWebhookShape(source.trigger)) return true;
  if (hasShopifyWebhookShape(source.request)) return true;
  if (hasShopifyWebhookShape(source.body)) return true;
  if (hasShopifyWebhookShape(source.workflowArguments?.testWebhook)) return true;

  return Object.keys(source).some(key => {
    const lowerKey = String(key).toLowerCase();
    return (lowerKey.includes('webhook') || lowerKey.includes('trigger')) &&
      hasShopifyWebhookShape(source[key]);
  });
}

const workflowArguments = input.workflowArguments || {};
const isWebhook = hasDirectWebhook(input);
const retryQueueKey = workflowArguments.retryQueueKey || DEFAULT_RETRY_QUEUE_KEY;

return [{
  triggerSource: isWebhook ? 'webhook' : 'scheduled',
  isWebhook,
  isScheduled: !isWebhook,
  retryQueueKey,
  retryWebhookUrl: workflowArguments.retryWebhookUrl,
  detectedAt: new Date().toISOString(),
}];
