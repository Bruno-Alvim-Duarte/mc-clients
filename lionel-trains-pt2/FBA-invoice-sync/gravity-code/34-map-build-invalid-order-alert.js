const config = input['map9QOY']?.[0] || {};
const order = input['mapQC7W']?.[0] || {};

return [{
  to: config.recipients,
  subject: `[${input.workflowArguments.storeName}] Amazon FBA to NetSuite - FBA Invoice Sync - Invalid order ${order.amazonOrderId || '(unknown)'}`,
  body: `Amazon FBA order ${order.amazonOrderId || '(unknown)'} could not be normalized and was added to retry memory.\n\nReason(s):\n${(order.validationErrors || []).map(e => '- ' + e).join('\n')}\n\nNo NetSuite invoice was created.`
}];