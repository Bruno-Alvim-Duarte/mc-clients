const retryRecord =
  input.item ||
  input.loopItem ||
  input.currentItem ||
  input['iterateHBWI']?.[0] ||
  {};

const workflowArguments = input.workflowArguments || {};
const retryWebhookUrl =
  retryRecord.retryWebhookUrl ||
  workflowArguments.retryWebhookUrl ||
  workflowArguments.webhookUrl ||
  '';

return [{
  shouldPost: !!retryWebhookUrl && !!retryRecord.webhookBody,
  method: 'POST',
  url: retryWebhookUrl,
  headers: {
    'Content-Type': 'application/json',
    'X-Mindcloud-Retry': 'true',
  },
  body: retryRecord.webhookBody || {},
  retryIndex: retryRecord.retryIndex ?? null,
  retryQueueKey: retryRecord.retryQueueKey || workflowArguments.retryQueueKey || 'big_country_order_update_retry_queue',
}];
