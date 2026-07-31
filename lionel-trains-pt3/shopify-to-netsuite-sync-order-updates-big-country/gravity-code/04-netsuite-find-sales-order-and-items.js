const shopifyOrder = ${JSON.stringify(input['REPLACE_WITH_03_MAP_NORMALIZE_SHOPIFY_ORDER_STEP_KEY']?.[0] || {})};

function execute() {
  try {
    const orderName = String(shopifyOrder.name || '').trim();

    if (!orderName) {
      return {
        success: false,
        found: false,
        message: 'Missing Shopify order name. Cannot search NetSuite Sales Order.',
        shopifyOrderName: orderName,
      };
    }

    const salesOrders = [];

    const soSearch = search.create({
      type: 'salesorder',
      filters: [
        ['mainline', 'is', 'T'],
        'AND',
        ['custbody_shopify_ord_id', 'is', orderName],
      ],
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'tranid' }),
        search.createColumn({ name: 'statusref' }),
        search.createColumn({ name: 'status' }),
        search.createColumn({ name: 'entity' }),
        search.createColumn({ name: 'memo' }),
        search.createColumn({ name: 'otherrefnum' }),
        search.createColumn({ name: 'custbody_shopify_ord_id' }),
      ],
    });

    soSearch.run().each(function(result) {
      salesOrders.push({
        internalId: String(result.getValue({ name: 'internalid' })),
        tranid: result.getValue({ name: 'tranid' }),
        statusRef: result.getValue({ name: 'statusref' }),
        statusText: result.getText({ name: 'status' }) || result.getValue({ name: 'status' }),
        entity: result.getValue({ name: 'entity' }),
        entityText: result.getText({ name: 'entity' }),
        memo: result.getValue({ name: 'memo' }) || '',
        otherrefnum: result.getValue({ name: 'otherrefnum' }) || '',
        shopifyOrderField: result.getValue({ name: 'custbody_shopify_ord_id' }) || '',
      });
      return salesOrders.length < 2;
    });

    if (salesOrders.length !== 1) {
      return {
        success: true,
        found: false,
        duplicate: salesOrders.length > 1,
        message: salesOrders.length > 1
          ? 'Multiple NetSuite Sales Orders found for Shopify order name.'
          : 'No NetSuite Sales Order found for Shopify order name.',
        shopifyOrderName: orderName,
        salesOrders,
      };
    }

    const salesOrder = salesOrders[0];
    const salesOrderRec = record.load({
      type: 'salesorder',
      id: salesOrder.internalId,
      isDynamic: false,
    });

    salesOrder.orderStatus = salesOrderRec.getValue({ fieldId: 'orderstatus' }) || salesOrder.statusRef || '';
    salesOrder.orderStatusText = salesOrderRec.getText({ fieldId: 'orderstatus' }) || salesOrder.statusText || '';
    salesOrder.location = salesOrderRec.getValue({ fieldId: 'location' }) || null;
    salesOrder.discountPercent = salesOrderRec.getValue({ fieldId: 'custbody_shopify_disc_pct' }) || 0;

    const lineCount = salesOrderRec.getLineCount({ sublistId: 'item' });
    const itemIds = {};
    const lines = [];

    function safeText(fieldId, line) {
      try {
        return salesOrderRec.getSublistText({ sublistId: 'item', fieldId, line }) || '';
      } catch (_) {
        return '';
      }
    }

    for (let i = 0; i < lineCount; i++) {
      const itemInternalId = salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
      if (itemInternalId) itemIds[String(itemInternalId)] = true;

      lines.push({
        line: i,
        lineUniqueKey: salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'lineuniquekey', line: i }) || null,
        itemInternalId: itemInternalId ? String(itemInternalId) : '',
        itemText: safeText('item', i),
        description: salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'description', line: i }) || '',
        quantity: Number(salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }) || 0),
        quantityFulfilled: Number(salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'quantityfulfilled', line: i }) || 0),
        quantityBilled: Number(salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'quantitybilled', line: i }) || 0),
        rate: Number(salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i }) || 0),
        amount: Number(salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i }) || 0),
        location: salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i }) || null,
        isClosed: salesOrderRec.getSublistValue({ sublistId: 'item', fieldId: 'isclosed', line: i }) === true,
      });
    }

    const itemDetailsById = {};
    const existingItemIds = Object.keys(itemIds);

    if (existingItemIds.length) {
      search.create({
        type: search.Type.ITEM,
        filters: [['internalid', 'anyof', existingItemIds]],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'itemid' }),
          search.createColumn({ name: 'displayname' }),
          search.createColumn({ name: 'type' }),
          search.createColumn({ name: 'isinactive' }),
        ],
      }).run().each(function(result) {
        const id = String(result.getValue({ name: 'internalid' }));
        itemDetailsById[id] = {
          internalId: id,
          sku: result.getValue({ name: 'itemid' }) || '',
          displayName: result.getValue({ name: 'displayname' }) || '',
          type: result.getValue({ name: 'type' }) || '',
          inactive: result.getValue({ name: 'isinactive' }) === true,
        };
        return true;
      });
    }

    lines.forEach(function(line) {
      const item = itemDetailsById[line.itemInternalId] || {};
      line.sku = item.sku || '';
      line.itemType = item.type || '';
      line.itemInactive = !!item.inactive;
    });

    const itemMatchesBySku = {};
    const skus = [];
    const seenSku = {};

    (shopifyOrder.lineItems || []).forEach(function(line) {
      const sku = String(line.sku || '').trim();
      if (!sku || seenSku[sku]) return;
      seenSku[sku] = true;
      skus.push(sku);
    });

    skus.forEach(function(sku) {
      const matches = [];

      search.create({
        type: search.Type.ITEM,
        filters: [
          ['itemid', 'is', sku],
          'AND',
          ['isinactive', 'is', 'F'],
        ],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'itemid' }),
          search.createColumn({ name: 'displayname' }),
          search.createColumn({ name: 'type' }),
        ],
      }).run().each(function(result) {
        matches.push({
          internalId: String(result.getValue({ name: 'internalid' })),
          sku: result.getValue({ name: 'itemid' }) || sku,
          displayName: result.getValue({ name: 'displayname' }) || '',
          type: result.getValue({ name: 'type' }) || '',
        });
        return matches.length < 2;
      });

      itemMatchesBySku[sku] = {
        sku,
        count: matches.length,
        matches,
        item: matches.length === 1 ? matches[0] : null,
      };
    });

    return {
      success: true,
      found: true,
      duplicate: false,
      shopifyOrderName: orderName,
      salesOrder,
      lines,
      itemMatchesBySku,
    };
  } catch (error) {
    return {
      success: false,
      found: false,
      message: error.message,
      stack: error.stack,
      error,
      shopifyOrderName: shopifyOrder.name || null,
    };
  }
}

execute();
