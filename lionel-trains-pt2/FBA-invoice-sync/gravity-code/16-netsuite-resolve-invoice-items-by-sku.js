const config = ${JSON.stringify(input['map9QOY']?.[0] || {})};
const orderInfo = ${JSON.stringify(input['mapQC7W']?.[0] || {})};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQuantity(value) {
  return Math.round(toNumber(value) * 100000) / 100000;
}

function shouldCheckInventory(item) {
  const type = String(item.type || '').toLowerCase();
  const recordType = String(item.recordType || '').toLowerCase();
  const combined = type + ' ' + recordType;

  const nonInventoryTypes = [
    'description',
    'discount',
    'dwnlditem',
    'endgroup',
    'giftcert',
    'group',
    'markup',
    'noninvtpart',
    'othcharge',
    'payment',
    'service',
    'shipitem',
    'subtotal',
    'taxgroup',
    'taxitem'
  ];

  if (nonInventoryTypes.some(value => combined.indexOf(value) !== -1)) {
    return false;
  }

  return true;
}

function getInventoryBalanceAvailability(itemId, locationId) {
  let available = 0;
  let rows = 0;

  const inventoryBalanceSearch = search.create({
    type: 'inventorybalance',
    filters: [
      ['item', 'anyof', itemId],
      'AND',
      ['location', 'anyof', locationId]
    ],
    columns: [
      search.createColumn({ name: 'available' }),
      search.createColumn({ name: 'location' })
    ]
  });

  inventoryBalanceSearch.run().each(function(result) {
    available += toNumber(result.getValue({ name: 'available' }));
    rows += 1;
    return true;
  });

  return {
    available: roundQuantity(available),
    rows,
    source: 'inventorybalance'
  };
}

function getItemLocationAvailability(itemId, locationId) {
  let available = 0;
  let rows = 0;

  const itemLocationSearch = search.create({
    type: search.Type.ITEM,
    filters: [
      ['internalid', 'anyof', itemId],
      'AND',
      ['inventorylocation', 'anyof', locationId],
      'AND',
      ['isinactive', 'is', 'F']
    ],
    columns: [
      search.createColumn({ name: 'inventorylocation' }),
      search.createColumn({ name: 'locationquantityavailable' })
    ]
  });

  itemLocationSearch.run().each(function(result) {
    available += toNumber(result.getValue({ name: 'locationquantityavailable' }));
    rows += 1;
    return true;
  });

  return {
    available: roundQuantity(available),
    rows,
    source: 'item.locationquantityavailable'
  };
}

function getAvailableQuantity(itemId, locationId) {
  const errors = [];

  try {
    return getInventoryBalanceAvailability(itemId, locationId);
  } catch (error) {
    errors.push('inventorybalance search failed: ' + error.message);
  }

  try {
    return getItemLocationAvailability(itemId, locationId);
  } catch (error) {
    errors.push('item location quantity search failed: ' + error.message);
  }

  return {
    available: 0,
    rows: 0,
    source: null,
    errors
  };
}

function execute() {
  try {
    const matched = [];
    const missingSkus = [];
    const duplicateSkus = [];
    const inventoryShortages = [];
    const inventoryCheckErrors = [];
    const inventoryCheckSkipped = [];
    const lines = orderInfo?.lines || [];
    const locationId = String(config?.netsuite?.location || '').trim();

    for (const line of lines) {
      const sku = String(line.sku || '').trim();
      if (!sku) { missingSkus.push('(missing sku)'); continue; }

      const itemSearch = search.create({
        type: search.Type.ITEM,
        filters: [
          ['itemid', 'is', sku],
          'AND',
          ['isinactive', 'is', 'F']
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'itemid' }),
          search.createColumn({ name: 'displayname' }),
          search.createColumn({ name: 'type' })
        ]
      });

      const results = [];
      itemSearch.run().each(function(result) {
        results.push({
          id: String(result.getValue({ name: 'internalid' })),
          sku: result.getValue({ name: 'itemid' }),
          displayName: result.getValue({ name: 'displayname' }),
          type: result.getValue({ name: 'type' }),
          recordType: result.recordType || null
        });
        return results.length < 2;
      });

      if (results.length === 1) {
        matched.push({
          ...line,
          netsuiteItemId: results[0].id,
          netsuiteItemSku: results[0].sku,
          netsuiteItemName: results[0].displayName,
          netsuiteItemType: results[0].type,
          netsuiteRecordType: results[0].recordType,
          requiresInventoryAvailability: shouldCheckInventory(results[0])
        });
      }
      else if (results.length === 0) missingSkus.push(sku);
      else duplicateSkus.push(sku);
    }

    if (!locationId) {
      inventoryCheckErrors.push('Missing NetSuite location for inventory availability check.');
    }

    const requiredByItem = {};

    for (const line of matched) {
      if (!line.requiresInventoryAvailability) {
        inventoryCheckSkipped.push({
          sku: line.sku,
          netsuiteItemId: line.netsuiteItemId,
          netsuiteItemType: line.netsuiteItemType,
          reason: 'Item type does not consume inventory.'
        });
        continue;
      }

      const key = String(line.netsuiteItemId || '').trim();
      if (!key) continue;

      if (!requiredByItem[key]) {
        requiredByItem[key] = {
          netsuiteItemId: key,
          sku: line.sku,
          netsuiteItemSku: line.netsuiteItemSku,
          netsuiteItemName: line.netsuiteItemName,
          netsuiteItemType: line.netsuiteItemType,
          requiredQuantity: 0,
          amazonOrderItemIds: []
        };
      }

      requiredByItem[key].requiredQuantity += toNumber(line.quantity);
      if (line.amazonOrderItemId) {
        requiredByItem[key].amazonOrderItemIds.push(line.amazonOrderItemId);
      }
    }

    const availabilityByItem = {};

    if (locationId) {
      for (const required of Object.values(requiredByItem)) {
        const availability = getAvailableQuantity(required.netsuiteItemId, locationId);
        const requiredQuantity = roundQuantity(required.requiredQuantity);
        const availableQuantity = roundQuantity(availability.available);

        availabilityByItem[required.netsuiteItemId] = {
          ...required,
          requiredQuantity,
          availableQuantity,
          locationId,
          source: availability.source,
          rows: availability.rows
        };

        if (availability.errors && availability.errors.length) {
          inventoryCheckErrors.push(
            "Unable to validate inventory for SKU "+required.sku + " / NetSuite item "+required.netsuiteItemId + " at location "+locationId + ": "+ availability.errors.join('; ')
          );
          continue;
        }

        if (availableQuantity < requiredQuantity) {
          inventoryShortages.push({
            ...required,
            requiredQuantity,
            availableQuantity,
            shortageQuantity: roundQuantity(requiredQuantity - availableQuantity),
            locationId,
            source: availability.source
          });
        }
      }
    }

    for (const line of matched) {
      const availability = availabilityByItem[String(line.netsuiteItemId || '').trim()];
      if (!availability) continue;

      line.requiredQuantityAtLocation = availability.requiredQuantity;
      line.availableQuantityAtLocation = availability.availableQuantity;
      line.inventoryLocationId = availability.locationId;
      line.inventoryAvailabilitySource = availability.source;
    }

    return {
      amazonOrderId: orderInfo.amazonOrderId,
      matched,
      missingSkus,
      duplicateSkus,
      inventoryLocationId: locationId,
      inventoryShortages,
      inventoryCheckErrors,
      inventoryCheckSkipped,
      hasAllItems: missingSkus.length === 0 && duplicateSkus.length === 0 && matched.length === lines.length,
      hasSufficientInventory: inventoryShortages.length === 0 && inventoryCheckErrors.length === 0
    };
  } catch (error) {
    return { success: false, message: error.message, stack: error.stack, error };
  }
}

execute();
