const source = input['mapL4FH']?.[0] || {};
const amazonOrderId = String(source.amazonOrderId || source.AmazonOrderId || '').trim();

return [{
  retryQueueUpdateType: 'add',
  source: 'mismatch',
  amazonOrderId,
  reason: amazonOrderId ? (source.validationErrors || []) : [],
  lastAttemptAt: input.system?.nowIso || new Date().toISOString()
}];
