const orderInfo = ${JSON.stringify(input['mapQC7W']?.[0] || {})};

function execute() {
  try {
    const matched = [];
    const missingSkus = [];
    const duplicateSkus = [];
    const lines = orderInfo?.lines || [];

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
          type: result.getValue({ name: 'type' })
        });
        return results.length < 2;
      });

      if (results.length === 1) matched.push({ ...line, netsuiteItemId: results[0].id, netsuiteItemSku: results[0].sku, netsuiteItemName: results[0].displayName });
      else if (results.length === 0) missingSkus.push(sku);
      else duplicateSkus.push(sku);
    }

    return {
      amazonOrderId: orderInfo.amazonOrderId,
      matched,
      missingSkus,
      duplicateSkus,
      hasAllItems: missingSkus.length === 0 && duplicateSkus.length === 0 && matched.length === lines.length
    };
  } catch (error) {
    return { success: false, message: error.message, stack: error.stack, error };
  }
}

execute();