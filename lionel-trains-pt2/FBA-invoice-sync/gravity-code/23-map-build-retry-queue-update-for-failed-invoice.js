const invoiceResult = input['netsuiteExecuteCustomCodeDMG7']?.[0] || {};
const amazonOrderId = String(invoiceResult.amazonOrderId || '').trim();
const errorDetails = invoiceResult?.error?.message
  || invoiceResult?.error?.code
  || 'Invoice creation failed';

return [{
  retryQueueUpdateType: 'add',
  source: 'failed_invoice',
  amazonOrderId,
  reason: amazonOrderId ? [`NetSuite invoice creation failed: ${errorDetails}`] : [],
  lastAttemptAt: input.system?.nowIso || new Date().toISOString()
}];
