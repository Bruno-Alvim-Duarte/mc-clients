const config = ${JSON.stringify(input['map9QOY']?.[0] || {})};
const orderInfo = ${JSON.stringify(input['mapQC7W']?.[0] || {})};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundQuantity(value) {
  return Math.round(toNumber(value) * 100000) / 100000;
}

function translateSku(value) {
  const text = String(value || '').trim();
  let sku = '';
  let foundNumber = false;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const isNumber = charCode >= 48 && charCode <= 57;

    if (!isNumber && foundNumber) break;

    if (isNumber) {
      foundNumber = true;
    }

    sku += text.charAt(i);
  }

  return foundNumber ? sku : '';
}

function normalizeSkuKey(value) {
  return String(value || '').trim().toLowerCase();
}

function addExceptionMapping(lookup, sourceSku, targetSku) {
  const source = String(sourceSku || '').trim();
  const target = String(targetSku || '').trim();

  if (!source || !target) return;

  lookup[source] = target;
  lookup[normalizeSkuKey(source)] = target;
}

function addExceptionSource(lookup, source) {
  if (!source) return;

  if (Array.isArray(source)) {
    for (const item of source) {
      if (!item || typeof item !== 'object') continue;

      addExceptionMapping(
        lookup,
        item.amazonSku || item.amazonSKU || item.sourceSku || item.sourceSKU || item.sku,
        item.netsuiteSku || item.netSuiteSku || item.netsuiteSKU || item.itemId || item.itemid || item.targetSku || item.targetSKU
      );
    }

    return;
  }

  if (typeof source === 'object') {
    for (const key of Object.keys(source)) {
      addExceptionMapping(lookup, key, source[key]);
    }
  }
}

function findExceptionSku(amazonSku) {
  const lookup = {};

  addExceptionSource(lookup, config.skuTranslationExceptions);
  addExceptionSource(lookup, config.skuExceptions);
  addExceptionSource(lookup, config?.netsuite?.skuTranslationExceptions);
  addExceptionSource(lookup, config?.netsuite?.skuExceptions);

  return lookup[amazonSku] || lookup[normalizeSkuKey(amazonSku)] || '';
}

function searchItemsBySku(sku) {
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

  return results;
}

function alreadySearched(searchedSkus, sku) {
  const key = normalizeSkuKey(sku);
  return searchedSkus.some(item => normalizeSkuKey(item.sku) === key);
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
    const missingSkuDetails = [];
    const duplicateSkus = [];
    const inventoryShortages = [];
    const inventoryCheckErrors = [];
    const inventoryCheckSkipped = [];
    const lines = orderInfo?.lines || [];
    const locationId = String(config?.netsuite?.location || '').trim();

    for (const line of lines) {
      const amazonSku = String(line.sku || '').trim();

      if (!amazonSku) {
        missingSkus.push('(missing sku)');
        continue;
      }

      const searchedSkus = [];
      let netsuiteSearchSku = amazonSku;
      let matchStrategy = 'exact';
      let results = searchItemsBySku(netsuiteSearchSku);
      const translatedSku = translateSku(amazonSku);
      searchedSkus.push({ strategy: matchStrategy, sku: netsuiteSearchSku, resultCount: results.length });

      if (results.length === 0) {
        if (translatedSku && !alreadySearched(searchedSkus, translatedSku)) {
          netsuiteSearchSku = translatedSku;
          matchStrategy = 'translated';
          results = searchItemsBySku(netsuiteSearchSku);
          searchedSkus.push({ strategy: matchStrategy, sku: netsuiteSearchSku, resultCount: results.length });
        }
      }

      if (results.length === 0) {
        const translatedSkuWithM = translatedSku && !/m$/i.test(translatedSku) ? translatedSku + 'M' : '';

        if (translatedSkuWithM && !alreadySearched(searchedSkus, translatedSkuWithM)) {
          netsuiteSearchSku = translatedSkuWithM;
          matchStrategy = 'translated_appended_m';
          results = searchItemsBySku(netsuiteSearchSku);
          searchedSkus.push({ strategy: matchStrategy, sku: netsuiteSearchSku, resultCount: results.length });
        }
      }

      if (results.length === 0) {
        const exceptionSku = findExceptionSku(amazonSku);

        if (exceptionSku && !alreadySearched(searchedSkus, exceptionSku)) {
          netsuiteSearchSku = exceptionSku;
          matchStrategy = 'exception';
          results = searchItemsBySku(netsuiteSearchSku);
          searchedSkus.push({ strategy: matchStrategy, sku: netsuiteSearchSku, resultCount: results.length });
        }
      }

      if (results.length === 1) {
        matched.push({
          ...line,
          amazonSku,
          netsuiteSearchSku,
          skuMatchStrategy: matchStrategy,
          skuSearchAttempts: searchedSkus,
          netsuiteItemId: results[0].id,
          netsuiteItemSku: results[0].sku,
          netsuiteItemName: results[0].displayName,
          netsuiteItemType: results[0].type,
          netsuiteRecordType: results[0].recordType,
          requiresInventoryAvailability: shouldCheckInventory(results[0])
        });
      }
      else if (results.length === 0) {
        missingSkus.push(netsuiteSearchSku || amazonSku);
        missingSkuDetails.push({
          sku: netsuiteSearchSku || amazonSku,
          amazonSku,
          netsuiteSearchSku,
          skuMatchStrategy: matchStrategy,
          skuSearchAttempts: searchedSkus,
          amazonOrderId: orderInfo.amazonOrderId,
          amazonOrderItemId: line.amazonOrderItemId || '',
          title: line.title || '',
          asin: line.asin || '',
          quantity: line.quantity || 0,
          reason: 'No active NetSuite item found after exact SKU search, base SKU translation, base SKU + M search, and configured exception map'
        });
      }
      else duplicateSkus.push(netsuiteSearchSku);
    }

    if (!locationId) {
      inventoryCheckErrors.push('Missing NetSuite location for inventory availability check.');
    }

    const requiredByItem = {};

    for (const line of matched) {
      if (!line.requiresInventoryAvailability) {
        inventoryCheckSkipped.push({
          sku: line.sku,
          amazonSku: line.amazonSku || line.sku,
          netsuiteSearchSku: line.netsuiteSearchSku,
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
          amazonSku: line.amazonSku || line.sku,
          netsuiteSearchSku: line.netsuiteSearchSku,
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
      missingSkuDetails,
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
