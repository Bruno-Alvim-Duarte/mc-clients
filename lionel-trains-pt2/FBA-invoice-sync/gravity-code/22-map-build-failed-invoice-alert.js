const config = input['map9QOY']?.[0] || {};
const order = input['mapQC7W']?.[0] || {};
const invoiceResult = input['netsuiteExecuteCustomCodeDMG7']?.[0] || {};

const errorDetails = invoiceResult?.error?.message
  || invoiceResult?.message
  || invoiceResult.error?.code
  || 'Unknown error';

// Detect if the error is likely an inventory detail / quantity issue
const errorStr = String(errorDetails).toLowerCase();
const isLikelyInventoryIssue =
  errorStr.includes('inventory detail') ||
  errorStr.includes('inventory number') ||
  errorStr.includes('lot number');

// Build a summary of the items in this order (SKU + qty)
const orderLines = (order.lines || []);
const linesSummary = orderLines.length
  ? orderLines.map(l => `- SKU: ${l.sku || '(unknown)'}, Qty: ${l.quantity}`).join('\n')
  : '(no line items available)';

// Friendly explanation for the most common scenario
const inventoryTip = isLikelyInventoryIssue
  ? [
      '',
      'What this most likely means:',
      'The Amazon FBA location in NetSuite does not have enough available quantity for one or more items in this order.',
      '',
      'How to fix:',
      '1. Open NetSuite and navigate to the inventory for the item(s) listed above.',
      '2. Check the available quantity at the Amazon FBA location.',
      '3. If the quantity is insufficient, create an Inventory Adjustment or Transfer to ensure the Amazon FBA location has enough stock to cover the order quantities.',
      '4. Once the inventory is corrected, the invoice will be retried automatically on the next sync run.',
    ].join('\n')
  : '';

const bodyParts = [
  `NetSuite invoice creation failed for Amazon FBA order ${order.amazonOrderId}.`,
  '',
  `Error: ${errorDetails}`,
  '',
  'Items in this order:',
  linesSummary,
];

if (inventoryTip) {
  bodyParts.push(inventoryTip);
}

bodyParts.push(
  '',
  `Marketplace: ${order.marketplaceId || ''}`,
  `Purchase Date: ${order.purchaseDate || ''}`,
  `Last Update Date: ${order.lastUpdateDate || ''}`,
  '',
  'The order has been added to the retry queue for the next run.'
);

return [{
  to: config.recipients,
  subject: `[${input.workflowArguments.storeName}] Amazon FBA to NetSuite - FBA Invoice Sync - Failed to create invoice for order ${order.amazonOrderId}`,
  body: bodyParts.join('\n'),
}];