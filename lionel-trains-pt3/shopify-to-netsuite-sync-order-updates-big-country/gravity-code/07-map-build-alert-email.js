const plan = input['mapAX8Y']?.[0] || {};
const applyResult = input['netsuiteExecuteCustomCodePOSP']?.[0] || null;

const shopifyOrder = plan.shopifyOrder || {};
const salesOrder = plan.netsuite?.salesOrder || {};
const failed = applyResult && applyResult.success === false;
const logType = failed ? 'error' : 'warning';

const subject = failed
  ? `[${input?.workflowArguments?.storeName}] Shopify to NetSuite - Sync Order Updates - NetSuite Update Failed`
  : 'Shopify to NetSuite - Sync Order Updates - Manual Review Required';

const body = [
  'Hello,',
  '',
  'This is an automated notification from Gravity.',
  '',
  'WORKFLOW',
  plan.workflowName || 'Shopify to NetSuite - Sync Order Updates (Big Country)',
  '',
  'SHOPIFY',
  `Order Name: ${shopifyOrder.name || '(unknown)'}`,
  `Order ID: ${shopifyOrder.numericId || shopifyOrder.id || '(unknown)'}`,
  `Event Type: ${plan.eventType || '(unknown)'}`,
  '',
  'NETSUITE',
  `Sales Order Internal ID: ${salesOrder.internalId || applyResult?.salesOrderId || '(unknown)'}`,
  `Sales Order Tran ID: ${salesOrder.tranid || '(unknown)'}`,
  `Status: ${salesOrder.orderStatusText || salesOrder.statusText || salesOrder.orderStatus || '(unknown)'}`,
  '',
  'DETAILS',
  failed
    ? `NetSuite update failed: ${applyResult.message || '(no message returned)'}`
    : `Reason: ${plan.reason || '(no reason returned)'}`,
  plan.detail ? `Detail: ${plan.detail}` : null,
  applyResult?.stack ? `Stack: ${applyResult.stack}` : null,
  '',
  'NEXT STEPS',
  'Review the Shopify order, NetSuite Sales Order, and Gravity run logs before replaying or manually applying the change.',
  '',
  'This is an automated message. Please do not reply to this email.',
].filter(line => line !== null && line !== undefined).join('\n');

const logMessage = [
  failed
    ? '[NetSuite] Shopify order update failed while applying NetSuite changes.'
    : '[NetSuite] Shopify order update requires manual review.',
  failed
    ? `Error: ${applyResult.message || '(no message returned)'}.`
    : `Reason: ${plan.reason || '(no reason returned)'}.`,
  shopifyOrder.name ? `Shopify Order: ${shopifyOrder.name}.` : null,
  (salesOrder.internalId || applyResult?.salesOrderId)
    ? `Sales Order Internal ID: ${salesOrder.internalId || applyResult.salesOrderId}.`
    : null,
  plan.detail ? `Detail: ${plan.detail}` : null,
].filter(Boolean).join(' ');

return [{
  shouldSend: !!plan.shouldAlert || failed,
  shouldLog: true,
  logType,
  logMessage,
  to: plan.alertRecipients || 'bruno@mindcloud.co,AMiller@lionel.com,jjones@lionel.com',
  subject,
  body,
  reason: failed ? 'netsuite_update_failed' : plan.reason,
  shopifyOrderName: shopifyOrder.name || null,
  salesOrderInternalId: salesOrder.internalId || applyResult?.salesOrderId || null,
}];
