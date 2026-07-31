const plan = input['REPLACE_WITH_05_MAP_BUILD_UPDATE_PLAN_STEP_KEY']?.[0] || {};
const applyResult = input['REPLACE_WITH_06_NETSUITE_APPLY_UPDATE_STEP_KEY']?.[0] || null;
const alert = input['REPLACE_WITH_07_MAP_BUILD_ALERT_EMAIL_STEP_KEY']?.[0] || {};

const failed = applyResult && applyResult.success === false;
const shouldWrite = failed || !!plan.shouldAlert;

return [{
  shouldWrite,
  key: `big_country_order_update_failure_${plan.shopifyOrder?.name || plan.shopifyOrder?.numericId || 'unknown'}_${Date.now()}`,
  value: {
    workflowName: plan.workflowName || 'Shopify to NetSuite - Sync Order Updates (Big Country)',
    createdAt: new Date().toISOString(),
    reason: failed ? 'netsuite_update_failed' : plan.reason,
    detail: failed ? applyResult.message : plan.detail,
    eventType: plan.eventType,
    shopifyOrder: plan.shopifyOrder || null,
    netsuiteSalesOrder: plan.netsuite?.salesOrder || null,
    applyResult,
    alertSubject: alert.subject || null,
  },
}];
