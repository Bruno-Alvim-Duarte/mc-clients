/** @NApiVersion 2.1 */
let output;

const PAGE_SIZE = 1000;
const MAX_LIMIT = 1000;
const SHOPIFY_ORDER_ID_FIELD = 'custbody_shopify_ord_id';
const wfArguments = ${JSON.stringify(input?.workflowArguments)}

const fulfillmentColumns = {
  fulfillmentId: search.createColumn({ name: 'internalid' }),
  createdFromId: search.createColumn({ name: 'createdfrom' }),
  shopifyOrderId: search.createColumn({
    name: SHOPIFY_ORDER_ID_FIELD,
    join: 'createdFrom'
  })
};

const packageTrackingColumn = search.createColumn({
  name: 'trackingnumber',
  join: 'shipmentPackage'
});

const packageDescription = search.createColumn({
  name: 'contentsdescription',
  join: 'shipmentPackage',
  label: 'Contents Description'
});

const itemDetailColumns = {
  internalId: search.createColumn({ name: 'internalid' }),
  itemId: search.createColumn({ name: 'itemid' }),
  displayName: search.createColumn({ name: 'displayname' })
};

const itemfulfillmentCandidateSearchObj = search.create({
  type: 'itemfulfillment',
  settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
  filters: [
    ['type', 'anyof', 'ItemShip'],
    'AND',
    ['mainline', 'is', 'F'],
    'AND',
    ['shipping', 'is', 'F'],
    'AND',
    ['taxline', 'is', 'F'],
    'AND',
    ['createdfrom.custbody_shopify_ord_id', 'isnotempty', ''],
    'AND',
    ['csegdivision', 'is', wfArguments.divisionID],
    'AND',
    ['custbody_synced_to_shopify', 'is', 'F']
  ],
  columns: [
    fulfillmentColumns.fulfillmentId,
    fulfillmentColumns.createdFromId,
    fulfillmentColumns.shopifyOrderId
  ]
});

const itemfulfillmentPackageSearchObj = search.create({
  type: 'itemfulfillment',
  settings: [{ name: 'consolidationtype', value: 'ACCTTYPE' }],
  filters: [
    ['type', 'anyof', 'ItemShip'],
    'AND',
    ['mainline', 'is', 'T'],
    'AND',
    ['createdfrom.custbody_shopify_ord_id', 'isnotempty', ''],
    'AND',
    ['csegdivision', 'is', wfArguments.divisionID],
    'AND',
    ['custbody_synced_to_shopify', 'is', 'F']
  ],
  columns: [
    fulfillmentColumns.fulfillmentId,
    packageTrackingColumn,
    packageDescription
  ]
});

function getOrCreateFulfillment(fulfillmentsById, order, fulfillmentId, createdFromId, shopifyOrderId) {
  let fulfillment = fulfillmentsById[fulfillmentId];

  if (!fulfillment) {
    fulfillment = {
      data: {
        id: fulfillmentId,
        createdfrom: createdFromId || ''
      },
      sublists: {
        item: {},
        package: {}
      },
      shopifyOrderId: shopifyOrderId || ''
    };

    fulfillmentsById[fulfillmentId] = fulfillment;
    order.push(fulfillment);
  }

  if (!fulfillment.data.createdfrom && createdFromId) {
    fulfillment.data.createdfrom = createdFromId;
  }

  if (!fulfillment.shopifyOrderId && shopifyOrderId) {
    fulfillment.shopifyOrderId = shopifyOrderId;
  }

  return fulfillment;
}

function safeGetSublistValue(rec, sublistId, fieldId, line) {
  try {
    const value = rec.getSublistValue({
      sublistId,
      fieldId,
      line
    });

    return value === null || value === undefined ? '' : value;
  } catch (e) {
    return '';
  }
}

function getItemDetailsById(itemIds) {
  const detailsById = {};
  const uniqueItemIds = [];
  const seen = {};

  for (let i = 0; i < itemIds.length; i++) {
    const itemId = itemIds[i];

    if (!itemId || seen[itemId]) continue;

    seen[itemId] = true;
    uniqueItemIds.push(itemId);
  }

  if (uniqueItemIds.length === 0) return detailsById;

  search.create({
    type: 'item',
    filters: [
      ['internalid', 'anyof', uniqueItemIds]
    ],
    columns: [
      itemDetailColumns.internalId,
      itemDetailColumns.itemId,
      itemDetailColumns.displayName
    ]
  }).run().each(function (result) {
    const internalId = result.getValue(itemDetailColumns.internalId);

    if (!internalId) return true;

    detailsById[internalId] = {
      itemid: result.getValue(itemDetailColumns.itemId) || '',
      displayname: result.getValue(itemDetailColumns.displayName) || ''
    };

    return true;
  });

  return detailsById;
}

function safeSetPackagesFromSearchResult(fulfillment, result) {
  const trackingNumbersRaw = result.getValue(packageTrackingColumn);
  const packageDescriptionsRaw = result.getValue(packageDescription);

  if (!trackingNumbersRaw) return;

  const existingTracking = {};

  Object.keys(fulfillment.sublists.package).forEach(function (key) {
    const pkg = fulfillment.sublists.package[key];
    if (pkg && pkg.packagetrackingnumber) {
      existingTracking[pkg.packagetrackingnumber] = true;
    }
  });

  const trackingNumbers = trackingNumbersRaw
    .toString()
    .split(',')
    .map(function (value) {
      return value.trim();
    })
    .filter(Boolean);

  const packageDescriptions = packageDescriptionsRaw
    ? packageDescriptionsRaw
        .toString()
        .split(',')
        .map(function (value) {
          return value.trim();
        })
        .filter(Boolean)
    : [];

  for (let k = 0; k < trackingNumbers.length; k++) {
    const trackingNumber = trackingNumbers[k];

    if (existingTracking[trackingNumber]) {
      continue;
    }

    const packageIndex = Object.keys(fulfillment.sublists.package).length;

    fulfillment.sublists.package[packageIndex] = {
      packagetrackingnumber: trackingNumber,
      packagedescr: packageDescriptions[k] || ''
    };

    existingTracking[trackingNumber] = true;
  }
}

function loadFulfillmentItems(fulfillmentId, fulfillment) {
  const fulfillmentRec = record.load({
    type: record.Type.ITEM_FULFILLMENT,
    id: fulfillmentId,
    isDynamic: false
  });

  const lineCount = fulfillmentRec.getLineCount({
    sublistId: 'item'
  });

  const rawLines = [];
  const itemIds = [];

  for (let i = 0; i < lineCount; i++) {
    const item = safeGetSublistValue(fulfillmentRec, 'item', 'item', i);

    rawLines.push({
      item,
      quantity: safeGetSublistValue(fulfillmentRec, 'item', 'quantity', i),
      description: safeGetSublistValue(fulfillmentRec, 'item', 'description', i),
      rate:
        safeGetSublistValue(fulfillmentRec, 'item', 'rate', i) ||
        safeGetSublistValue(fulfillmentRec, 'item', 'itemunitprice', i)
    });

    if (item) {
      itemIds.push(item);
    }
  }

  const itemDetailsById = getItemDetailsById(itemIds);

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const itemDetails = itemDetailsById[line.item] || {};
    const itemIndex = Object.keys(fulfillment.sublists.item).length;

    fulfillment.sublists.item[itemIndex] = {
      itemname: itemDetails.itemid || '',
      quantity: line.quantity || '',
      item: line.item || '',
      displayname: line.description || itemDetails.displayname || '',
      itemunitprice: line.rate || '',
      itemquantity: line.quantity || ''
    };
  }
}

try {
  const fulfillmentsById = {};
  const fulfillments = [];

  const pagedFulfillments = itemfulfillmentCandidateSearchObj.runPaged({
    pageSize: PAGE_SIZE
  });

  const fulfillmentPageRanges = pagedFulfillments.pageRanges;

  if (fulfillmentPageRanges.length > 0) {
    for (let i = 0; i < fulfillmentPageRanges.length; i++) {
      if (fulfillments.length >= MAX_LIMIT) break;

      const page = pagedFulfillments.fetch({
        index: fulfillmentPageRanges[i].index
      });

      for (let j = 0; j < page.data.length; j++) {
        if (fulfillments.length >= MAX_LIMIT) break;

        const result = page.data[j];
        const fulfillmentId = result.getValue(fulfillmentColumns.fulfillmentId);

        if (!fulfillmentId) continue;

        const fulfillment = getOrCreateFulfillment(
          fulfillmentsById,
          fulfillments,
          fulfillmentId,
          result.getValue(fulfillmentColumns.createdFromId),
          result.getValue(fulfillmentColumns.shopifyOrderId)
        );

        if (Object.keys(fulfillment.sublists.item).length === 0) {
          loadFulfillmentItems(fulfillmentId, fulfillment);
        }

      }
    }
  }

  const pagedPackages = itemfulfillmentPackageSearchObj.runPaged({
    pageSize: PAGE_SIZE
  });

  const packagePageRanges = pagedPackages.pageRanges;

  if (packagePageRanges.length > 0) {
    for (let i = 0; i < packagePageRanges.length; i++) {
      const page = pagedPackages.fetch({
        index: packagePageRanges[i].index
      });

      for (let j = 0; j < page.data.length; j++) {
        const result = page.data[j];
        const fulfillmentId = result.getValue(fulfillmentColumns.fulfillmentId);

        if (!fulfillmentId || !fulfillmentsById[fulfillmentId]) continue;

        safeSetPackagesFromSearchResult(fulfillmentsById[fulfillmentId], result);
      }
    }
  }

  output = fulfillments;
} catch (e) {
  output = {
    errorMessage: e.message,
    errorName: e.name,
    errorStack: e.stack
  };
}

;(output);
