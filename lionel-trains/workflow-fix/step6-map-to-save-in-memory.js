const currentIteratorRecord = input?.iterateF7I7?.[0];
const netsuiteSearchResult = input?.netsuiteExecuteCustomCodeTDUH;
const memoryValue = input?.memory?.variable;

function unwrapFirst(value) {
  return Array.isArray(value) ? value[0] : value;
}

function getCurrentShopifyOrder() {
  return (
    currentIteratorRecord?.node ||
    currentIteratorRecord?.data?.node ||
    currentIteratorRecord?.order ||
    currentIteratorRecord
  );
}

function getConnectionNodes(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (Array.isArray(value.edges)) {
    return value.edges.map(function (edge) {
      return edge?.node;
    }).filter(Boolean);
  }

  if (Array.isArray(value.nodes)) {
    return value.nodes;
  }

  return [];
}

function getNumericId(value) {
  if (!value) {
    return null;
  }

  return String(value).split('/').pop().replace('#', '');
}

function getNumber(value, fallback) {
  const numberValue = Number(value);
  return isNaN(numberValue) ? fallback : numberValue;
}

function getFirstNumber(values) {
  for (let i = 0; i < values.length; i++) {
    const value = values[i];

    if (value === null || value === undefined || value === '') {
      continue;
    }

    const numberValue = Number(value);

    if (!isNaN(numberValue)) {
      return numberValue;
    }
  }

  return null;
}

function getMoneyAmount(value) {
  return (
    value?.shopMoney?.amount ||
    value?.presentmentMoney?.amount ||
    value?.amount ||
    null
  );
}

function getSourceText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim().toLowerCase();
}

function shouldCountFulfillment(fulfillment) {
  const statusText = [
    fulfillment?.status,
    fulfillment?.displayStatus
  ].map(getSourceText).join(' ');

  return (
    statusText.indexOf('cancel') === -1 &&
    statusText.indexOf('failure') === -1 &&
    statusText.indexOf('failed') === -1 &&
    statusText.indexOf('error') === -1
  );
}

function getFulfilledQuantitiesByLineItemId(order) {
  const fulfilledQuantities = {};
  const fulfillments = getConnectionNodes(order?.fulfillments);
  let hasFulfillmentLineItems = false;

  fulfillments.forEach(function (fulfillment) {
    if (!shouldCountFulfillment(fulfillment)) {
      return;
    }

    getConnectionNodes(fulfillment?.fulfillmentLineItems).forEach(function (fulfillmentLineItem) {
      const lineItemId = fulfillmentLineItem?.lineItem?.id;

      if (!lineItemId) {
        return;
      }

      hasFulfillmentLineItems = true;
      fulfilledQuantities[lineItemId] =
        (fulfilledQuantities[lineItemId] || 0) +
        getNumber(fulfillmentLineItem?.quantity, 0);
    });
  });

  return {
    hasFulfillmentLineItems: hasFulfillmentLineItems,
    fulfilledQuantities: fulfilledQuantities
  };
}

function getNetSuiteSearchPayload() {
  const payload = unwrapFirst(netsuiteSearchResult) || {};

  return {
    success: payload.success === true,
    salesOrderId: payload.salesOrderId || null,
    salesOrders: Array.isArray(payload.salesOrders) ? payload.salesOrders : [],
    lines: Array.isArray(payload.lines) ? payload.lines : []
  };
}

function parseMemoryArray(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsedValue = JSON.parse(value);
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch (error) {
      return [];
    }
  }

  return [];
}

const order = getCurrentShopifyOrder();
const netsuiteSearch = getNetSuiteSearchPayload();
const lineItems = getConnectionNodes(order?.lineItems);
const orderNumber = order?.name || '';
const shopifyOrderId = getNumericId(order?.id) || getNumericId(orderNumber);

if (!order?.id) {
  return {
    success: false,
    message: 'Missing current Shopify order from iterateF7I7.',
    rawIteratorRecord: currentIteratorRecord || null
  };
}

if (!lineItems.length) {
  return {
    success: false,
    message: 'Current Shopify order has no lineItems. Add lineItems { quantity fulfillableQuantity fulfillmentStatus } to workflow-fix/step1-get-orders.md and rerun the Shopify step.',
    orderNumber: orderNumber,
    shopifyOrderId: shopifyOrderId,
    displayFulfillmentStatus: order?.displayFulfillmentStatus || '',
    updatedAt: order?.updatedAt || '',
    rawOrder: order
  };
}

const fulfilledQuantitiesByLineItemId = getFulfilledQuantitiesByLineItemId(order);

const fulfilledShopifyLines = lineItems.map(function (lineItem) {
  const orderedQuantity = getNumber(lineItem?.quantity, 0);
  const fulfillableQuantity = getFirstNumber([
    lineItem?.fulfillableQuantity,
    lineItem?.fulfillable_quantity,
    lineItem?.remainingQuantity,
    lineItem?.remaining_quantity
  ]);

  const pendingQuantity =
    fulfillableQuantity === null
      ? orderedQuantity
      : Math.min(Math.max(fulfillableQuantity, 0), orderedQuantity);

  const fulfilledQuantityFromLineItem = Math.max(orderedQuantity - pendingQuantity, 0);
  const fulfilledQuantityFromFulfillments =
    fulfilledQuantitiesByLineItemId.fulfilledQuantities[lineItem?.id];
  const fulfilledQuantity = Math.max(
    fulfilledQuantitiesByLineItemId.hasFulfillmentLineItems
      ? getNumber(fulfilledQuantityFromFulfillments, 0)
      : fulfilledQuantityFromLineItem,
    0
  );

  return {
    orderNumber: orderNumber,
    shopifyOrderId: shopifyOrderId,
    shopifyLineItemGid: lineItem?.id || null,
    shopifyLineItemId: getNumericId(lineItem?.id),
    sku: String(lineItem?.sku || '').trim(),
    title: lineItem?.title || '',
    fulfillmentStatus: lineItem?.fulfillmentStatus || '',
    orderedQuantity: orderedQuantity,
    fulfillableQuantity: pendingQuantity,
    fulfilledQuantitySource: fulfilledQuantitiesByLineItemId.hasFulfillmentLineItems ? 'fulfillmentLineItems' : 'lineItemQuantityMinusFulfillableQuantity',
    fulfilledQuantity: fulfilledQuantity,
    quantityToCloseInNetSuite: fulfilledQuantity,
    originalUnitPrice: getMoneyAmount(lineItem?.originalUnitPriceSet),
    discountedTotal: getMoneyAmount(lineItem?.discountedTotalSet)
  };
}).filter(function (line) {
  return line.fulfilledQuantity > 0;
});

const memoryRecord = {
  orderNumber: orderNumber,
  lineItems: fulfilledShopifyLines.map(function (line) {
    return {
      shopifyLineItemId: line.shopifyLineItemId,
      sku: line.sku,
      title: line.title,
      fulfilledQuantity: line.fulfilledQuantity,
      availableQuantity: line.fulfillableQuantity
    };
  })
};

const memoryRecords = parseMemoryArray(memoryValue).concat([memoryRecord]);

return {
  success: true,
  orderNumber: orderNumber,
  shopifyOrderId: shopifyOrderId,
  shopifyOrderGid: order?.id || null,
  displayFinancialStatus: order?.displayFinancialStatus || '',
  displayFulfillmentStatus: order?.displayFulfillmentStatus || '',
  updatedAt: order?.updatedAt || '',
  netsuiteSalesOrderFound: netsuiteSearch.success,
  netsuiteSalesOrderId: netsuiteSearch.salesOrderId,
  netsuiteSalesOrders: netsuiteSearch.salesOrders,
  fulfilledLineCount: fulfilledShopifyLines.length,
  fulfilledShopifyLines: fulfilledShopifyLines,
  memoryRecord: memoryRecord,
  memoryRecords: memoryRecords,
  memoryRecordsJson: JSON.stringify(memoryRecords),
  hasLinesToClose: fulfilledShopifyLines.length > 0 && Boolean(netsuiteSearch.salesOrderId)
};
