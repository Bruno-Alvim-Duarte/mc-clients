const shopifyOrder = input['mapCPX5']?.[0] || {};
const netsuiteLookup = input['netsuiteExecuteCustomCodePYKM']?.[0] || {};
const workflowArguments = input.workflowArguments || {};

// NetSuite orderstatus returns the compact Sales Order status code in this
// Gravity/SuiteScript context, not the full search statusref value.
// A = Pending Approval: safe to update.
// B = Pending Fulfillment: safe to update.
const ALLOWED_STATUS_REFS = new Set(['A', 'B']);

// C = Cancelled: already cancelled, do not process again.
// D = Partially Fulfilled: fulfillment has started, stop and alert.
// E = Pending Billing / Partially Fulfilled: fulfillment has started, stop and alert.
// F = Pending Billing / Fully Fulfilled or Billed / Fully Fulfilled: fulfillment is complete, stop and alert.
// H = Closed: order is closed, stop and alert.
const INELIGIBLE_STATUS_REFS = new Set(['C', 'D', 'E', 'F', 'H']);

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeSku(value) {
  return String(value || '').trim();
}

function normalizeSkuKey(value) {
  return normalizeSku(value).toLowerCase();
}

function buildStopPlan(reason, detail, alertLevel = 'warning') {
  return [{
    workflowName: shopifyOrder.workflowName,
    alertRecipients: shopifyOrder.alertRecipients,
    action: 'stop',
    canApply: false,
    shouldAlert: alertLevel !== 'info',
    alertLevel,
    reason,
    detail,
    eventType: shopifyOrder.eventType,
    shopifyOrder: {
      id: shopifyOrder.id,
      numericId: shopifyOrder.numericId,
      name: shopifyOrder.name,
    },
    netsuite: netsuiteLookup,
  }];
}

function normalizeNoteToCarry(note) {
  return {
    source: note.source || 'unknown',
    label: note.label || 'Shopify edit note',
    value: String(note.value || '').trim(),
    destinationFieldId: note.destinationFieldId || 'item.description',
    destinationFieldLabel: note.destinationFieldLabel || 'NetSuite item line description',
    changeType: note.changeType || null,
    lineItemId: note.lineItemId || null,
    fixedAmount: note.fixedAmount || null,
    percentAmount: note.percentAmount || null,
  };
}

function addIdVariants(set, value) {
  if (value === null || value === undefined || value === '') return;
  const raw = String(value);
  set.add(raw);
  set.add(raw.split('/').pop());
}

function collectLineItemIds(value, ids = new Set()) {
  if (!value) return ids;
  if (Array.isArray(value)) {
    value.forEach(item => collectLineItemIds(item, ids));
    return ids;
  }
  if (typeof value !== 'object') return ids;

  [
    value.id,
    value.line_item_id,
    value.lineItemId,
    value.admin_graphql_api_id,
    value.legacyResourceId,
  ].forEach(id => addIdVariants(ids, id));

  Object.keys(value).forEach(key => {
    const nested = value[key];
    if (nested && typeof nested === 'object') collectLineItemIds(nested, ids);
  });

  return ids;
}

function lineIdsForTarget(line) {
  const sourceLines = Array.isArray(line.sourceLines) && line.sourceLines.length
    ? line.sourceLines
    : [line];
  const ids = new Set();

  sourceLines.forEach(sourceLine => {
    [
      sourceLine.id,
      sourceLine.numericId,
      sourceLine.legacyResourceId,
      sourceLine.id ? String(sourceLine.id).split('/').pop() : null,
    ].forEach(id => addIdVariants(ids, id));
  });

  return Array.from(ids);
}

function targetLocationForLine(line) {
  return line.fulfillmentLocation?.netsuiteLocationId || workflowArguments.defaultLocationID || null;
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(value => value !== null && value !== undefined && value !== '').map(String)));
}

function groupShopifyLinesBySku(lines) {
  const groupsBySku = {};

  lines.forEach(line => {
    const key = normalizeSkuKey(line.sku);
    groupsBySku[key] = groupsBySku[key] || [];
    groupsBySku[key].push(line);
  });

  const groupedLines = [];
  const unsafeDuplicateSkus = [];

  Object.keys(groupsBySku).forEach(key => {
    const group = groupsBySku[key];
    if (group.length === 1) {
      groupedLines.push({
        ...group[0],
        sourceLines: group,
        duplicateLineCount: 1,
      });
      return;
    }

    const positiveLines = group.filter(line => line.quantity > 0);
    const positiveRates = uniqueValues(positiveLines.map(line => String(roundMoney(line.originalUnitPrice || 0))));
    const positiveLocations = uniqueValues(positiveLines.map(targetLocationForLine));

    if (positiveRates.length > 1 || positiveLocations.length > 1) {
      unsafeDuplicateSkus.push(group[0].sku);
      return;
    }

    const preferredLine = positiveLines[0] || group[0];
    groupedLines.push({
      ...preferredLine,
      quantity: group.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
      originalUnitPrice: roundMoney(preferredLine.originalUnitPrice || 0),
      sourceLines: group,
      duplicateLineCount: group.length,
      duplicateLinePolicy: positiveLines.length
        ? 'merged_same_sku_lines'
        : 'merged_cancelled_zero_quantity_lines',
    });
  });

  return { groupedLines, unsafeDuplicateSkus };
}

const notesToCarry = (shopifyOrder.editNotes || shopifyOrder.orderEdit?.notes || [])
  .map(normalizeNoteToCarry)
  .filter(note => note.value);

const staffNote = notesToCarry.find(note => note.source === 'order_edit.staff_note')?.value || '';
const changedLineItemIds = collectLineItemIds(shopifyOrder.orderEdit?.lineItems || {});
const descriptionNotesByLineItemId = {};

notesToCarry.forEach(note => {
  if (note.lineItemId) {
    addIdVariants(changedLineItemIds, note.lineItemId);
  }

  if (note.source.indexOf('.description') !== -1 && note.lineItemId) {
    const ids = new Set();
    addIdVariants(ids, note.lineItemId);
    ids.forEach(id => {
      descriptionNotesByLineItemId[id] = descriptionNotesByLineItemId[id] || [];
      descriptionNotesByLineItemId[id].push(note.value);
    });
  }
});

if (!shopifyOrder.name) {
  return buildStopPlan('missing_shopify_order_name', 'Shopify order name is required to find the NetSuite Sales Order.');
}

if (!shopifyOrder.isEdit && !shopifyOrder.isCancellation) {
  return buildStopPlan(
    'unsupported_webhook_topic',
    `Unsupported Shopify webhook topic for order ${shopifyOrder.name}: ${shopifyOrder.webhook?.topic || shopifyOrder.eventType || 'unknown'}.`,
    'info'
  );
}

if (!shopifyOrder.exported) {
  return buildStopPlan('not_exported', `Shopify order ${shopifyOrder.name} does not have the Exported tag.`, 'info');
}

if (!netsuiteLookup.success) {
  return buildStopPlan('netsuite_lookup_failed', netsuiteLookup.message || 'NetSuite Sales Order lookup failed.', 'error');
}

if (!netsuiteLookup.found || netsuiteLookup.duplicate) {
  return buildStopPlan(
    netsuiteLookup.duplicate ? 'duplicate_sales_order' : 'sales_order_not_found',
    netsuiteLookup.message || `NetSuite Sales Order not found for Shopify order ${shopifyOrder.name}.`
  );
}

const salesOrder = netsuiteLookup.salesOrder || {};
const statusRef = salesOrder.orderStatus || salesOrder.statusRef || '';

if (!ALLOWED_STATUS_REFS.has(statusRef)) {
  const statusKnownIneligible = INELIGIBLE_STATUS_REFS.has(statusRef);
  return buildStopPlan(
    statusKnownIneligible ? 'sales_order_status_ineligible' : 'sales_order_status_unknown',
    `NetSuite Sales Order ${salesOrder.tranid || salesOrder.internalId} is ${salesOrder.orderStatusText || salesOrder.statusText || statusRef}. Only Pending Approval and Pending Fulfillment are eligible.`
  );
}

if (shopifyOrder.isCancellation) {
  return [{
    workflowName: shopifyOrder.workflowName,
    alertRecipients: shopifyOrder.alertRecipients,
    action: 'apply_cancellation',
    canApply: true,
    shouldAlert: false,
    eventType: 'cancellation',
    shopifyOrder: {
      id: shopifyOrder.id,
      numericId: shopifyOrder.numericId,
      name: shopifyOrder.name,
      cancelledAt: shopifyOrder.cancelledAt,
      cancelReason: shopifyOrder.cancelReason,
    },
    netsuite: {
      salesOrder,
      lines: netsuiteLookup.lines || [],
    },
    cancellation: {
      memoNote: [
        `Shopify cancellation received for ${shopifyOrder.name}`,
        shopifyOrder.cancelReason ? `reason: ${shopifyOrder.cancelReason}` : null,
        shopifyOrder.cancelledAt ? `cancelled at: ${shopifyOrder.cancelledAt}` : null,
      ].filter(Boolean).join(' | '),
    },
  }];
}

const shopifyLinesForSync = (shopifyOrder.lineItems || [])
  .map(line => ({
    ...line,
    sku: normalizeSku(line.sku),
    quantity: Number(line.quantity || 0),
    originalUnitPrice: roundMoney(line.originalUnitPrice || 0),
  }))
  .filter(line => line.sku && line.quantity >= 0);

if (!shopifyLinesForSync.length) {
  return buildStopPlan('no_shopify_lines', `No Shopify lines found for order ${shopifyOrder.name}.`);
}

const groupedShopifyLinesResult = groupShopifyLinesBySku(shopifyLinesForSync);
const shopifyLinesGroupedBySku = groupedShopifyLinesResult.groupedLines;

if (groupedShopifyLinesResult.unsafeDuplicateSkus.length) {
  return buildStopPlan(
    'duplicate_shopify_skus',
    `Cannot safely merge duplicate Shopify SKUs with different positive rates or locations: ${groupedShopifyLinesResult.unsafeDuplicateSkus.join(', ')}.`
  );
}

const itemMatchesBySku = netsuiteLookup.itemMatchesBySku || {};
const itemMatchesByNormalizedSku = Object.keys(itemMatchesBySku).reduce((acc, sku) => {
  acc[normalizeSkuKey(sku)] = itemMatchesBySku[sku];
  return acc;
}, {});
const missingSkus = [];
const duplicateNetSuiteSkus = [];
const netsuiteLines = netsuiteLookup.lines || [];

const targetLines = shopifyLinesGroupedBySku.map(line => {
  const match = itemMatchesByNormalizedSku[normalizeSkuKey(line.sku)] || { count: 0, matches: [] };
  if (match.count === 0) missingSkus.push(line.sku);
  if (match.count > 1) duplicateNetSuiteSkus.push(line.sku);
  const netsuiteItemId = match.item?.internalId || null;
  const matchingNetSuiteLine = netsuiteItemId
    ? netsuiteLines.find(nsLine => String(nsLine.itemInternalId || '') === String(netsuiteItemId) && !nsLine.isClosed)
    : null;
  const targetLocationId = targetLocationForLine(line);
  const changedByLineId = lineIdsForTarget(line).some(id => changedLineItemIds.has(id));
  const changedByValue = !matchingNetSuiteLine ||
    Number(matchingNetSuiteLine.quantity || 0) !== line.quantity ||
    roundMoney(matchingNetSuiteLine.rate || 0) !== line.originalUnitPrice ||
    (targetLocationId && String(matchingNetSuiteLine.location || '') !== String(targetLocationId));
  const lineDescriptionNotes = [];

  lineIdsForTarget(line).forEach(id => {
    (descriptionNotesByLineItemId[id] || []).forEach(note => lineDescriptionNotes.push(note));
  });

  if (staffNote && changedByLineId) {
    lineDescriptionNotes.push(staffNote);
  }

  return {
    shopifyLineItemId: line.id,
    shopifyLineItemNumericId: line.numericId,
    shopifyLineItemIds: lineIdsForTarget(line),
    sku: line.sku,
    title: line.title || line.name || line.sku,
    quantity: line.quantity,
    rate: line.originalUnitPrice,
    netsuiteItemId,
    netsuiteLocationId: targetLocationId,
    shopifyFulfillmentLocation: line.fulfillmentLocation || null,
    descriptionNotes: Array.from(new Set(lineDescriptionNotes.filter(Boolean))),
    isCancelledLine: line.quantity === 0,
    duplicateLineCount: line.duplicateLineCount || 1,
    duplicateLinePolicy: line.duplicateLinePolicy || null,
  };
});

if (missingSkus.length || duplicateNetSuiteSkus.length) {
  return buildStopPlan(
    'item_matching_failed',
    [
      missingSkus.length ? `Missing NetSuite SKUs: ${missingSkus.join(', ')}` : null,
      duplicateNetSuiteSkus.length ? `Duplicate NetSuite SKUs: ${duplicateNetSuiteSkus.join(', ')}` : null,
    ].filter(Boolean).join('; ')
  );
}

const discountAmount = roundMoney(shopifyOrder.discountAmount || 0);

return [{
  workflowName: shopifyOrder.workflowName,
  alertRecipients: shopifyOrder.alertRecipients,
  action: 'apply_edit',
  canApply: true,
  shouldAlert: false,
  eventType: 'edit',
  shopifyOrder: {
    id: shopifyOrder.id,
    numericId: shopifyOrder.numericId,
    name: shopifyOrder.name,
    updatedAt: shopifyOrder.updatedAt,
    orderEdit: shopifyOrder.orderEdit,
  },
  netsuite: {
    salesOrder,
    lines: netsuiteLookup.lines || [],
  },
  edit: {
    shippingAddress: shopifyOrder.shippingAddress,
    billingAddress: shopifyOrder.billingAddress,
    customer: shopifyOrder.customer,
    email: shopifyOrder.email,
    phone: shopifyOrder.phone,
    targetLines,
    discountAmount,
    discountItemId: workflowArguments.discountID || null,
    discountPercentFieldId: 'custbody_shopify_disc_pct',
    defaultLocationId: workflowArguments.defaultLocationID || null,
    notesToCarry,
    notesDestinationStatus: notesToCarry.length ? 'line_description' : 'no_notes',
    memoNote: `Shopify edit synced for ${shopifyOrder.name} at ${new Date().toISOString()}`,
  },
}];
