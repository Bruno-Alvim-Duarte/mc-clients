const config = input['map9QOY']?.[0] || {};
const order = input['mapQC7W']?.[0] || {};
const payload = input['mapL4FH']?.[0] || {};

return [{
  to: config.recipients,
  subject: `Amazon FBA to NetSuite - FBA Invoice Sync - Skipped order ${order.amazonOrderId}`,
  body: `Amazon FBA order ${order.amazonOrderId} was skipped and added to retry memory.\n\nReason(s):\n${(payload.validationErrors || []).map(e => '- ' + e).join('\n')}\n\nMarketplace: ${order.marketplaceId || ''}\nPurchase Date: ${order.purchaseDate || ''}\nLast Update Date: ${order.lastUpdateDate || ''}\n\nNo NetSuite invoice was created.`
}];