const order = input['mapL4FH']?.[0] || {};
const amazonOrderId = String(order.amazonOrderId || order.AmazonOrderId || '').trim();

return [{
  retryQueueUpdateType: 'remove',
  source: 'created_invoice',
  amazonOrderId,
  lastAttemptAt: input.system?.nowIso || new Date().toISOString()
}];
