const state = input['map3HMU']?.[0] || {};
const checkpoint = state.checkpoint || {};
const updatedAfter = checkpoint.lastUpdatedAfter || '2026-05-01T00:00:00';
const wfArguments = input["workflowArguments"]
const defaultSkuTranslationExceptions = {
  '203-stickerless': '203',
  '203Merchant Barcode': '203',
  '470AF': '470',
  'YZ-O27H-G3TU': '811'
};

return [{
  workflowName: 'Amazon FBA to NetSuite - FBA Invoice Sync',
  recipients: `bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com, ${wfArguments.storePersonEmail}`,
  region: 'North America',
  marketplaceScope: 'All marketplaces',
  orderStatus: 'Shipped',
  fulfillmentChannel: 'AFN',
  updatedAfter,
  updatedBefore: input.system?.nowIso || new Date().toISOString(),
  pageSize: 50,
  retryOrders: state.retryOrders || [],
  retryOrderIds: state.retryOrderIds || [],
  checkpointKey: state.keys?.checkpointKey || 'lionel_fba_invoice_sync_checkpoint',
  retryQueueKey: state.keys?.retryQueueKey || 'lionel_fba_invoice_retry_orders',
  missingSkuBatchAlertKey: 'lionel_fba_invoice_missing_sku_batch_alert',
  skuTranslationExceptions: {
    ...defaultSkuTranslationExceptions,
    ...(wfArguments.skuTranslationExceptions || {})
  },
  batchId: input.system?.nowIso || new Date().toISOString(),
  netsuite: {
    customerInternalId: wfArguments.customerID,
    customerName: '9561387706 Amazon Customer',
    subsidiary: '3',
    divisionFieldId: 'csegdivision',
    division: wfArguments.divisionID,
    class: wfArguments.classID,
    department: '34',
    location: '152',
    shipmethod: '47311'
  },
  chargeItems: {
    giftWrap: wfArguments.giftWrapItemID,
    promotionDiscount: wfArguments?.discountItemID
  }
}];
