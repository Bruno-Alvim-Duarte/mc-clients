const config = input['map9QOY']?.[0] || {};
const order = input['mapQC7W']?.[0] || {};
const payload = input['mapL4FH']?.[0] || {};
const shouldDeferBatchValidationEmail = Boolean(
  payload.shouldDeferBatchValidationEmail || payload.shouldDeferMissingSkuEmail
);

const shortages = payload.inventoryShortages || [];
const inventoryDetails = shortages.length
  ? [
      '',
      'Inventory availability details:',
      ...shortages.map(line =>
        [
          `- SKU: ${line.sku || line.netsuiteItemSku || '(unknown)'}`,
          `NetSuite Item ID: ${line.netsuiteItemId || '(unknown)'}`,
          `Location: ${line.locationId || payload.inventoryLocationId || config.netsuite?.location || '(unknown)'}`,
          `Required: ${line.requiredQuantity}`,
          `Available: ${line.availableQuantity}`,
          `Shortage: ${line.shortageQuantity}`
        ].join(' | ')
      )
    ].join('\n')
  : '';

const inventoryCheckErrors = payload.inventoryCheckErrors && payload.inventoryCheckErrors.length
  ? `\n\nInventory check error(s):\n${payload.inventoryCheckErrors.map(e => '- ' + e).join('\n')}`
  : '';

return [{
  to: config.recipients,
  sendEmail: shouldDeferBatchValidationEmail ? 'No' : 'Yes',
  subject: `[${input?.workflowArguments?.storeName}] Amazon FBA to NetSuite - FBA Invoice Sync - Skipped order ${order.amazonOrderId}`,
  body: `Amazon FBA order ${order.amazonOrderId} was skipped and added to retry memory.\n\nReason(s):\n${(payload.validationErrors || []).map(e => '- ' + e).join('\n')}${inventoryDetails}${inventoryCheckErrors}\n\nMarketplace: ${order.marketplaceId || ''}\nPurchase Date: ${order.purchaseDate || ''}\nLast Update Date: ${order.lastUpdateDate || ''}\n\nNo NetSuite invoice was created.`
}];
