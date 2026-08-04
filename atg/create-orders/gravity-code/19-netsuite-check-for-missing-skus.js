const order = ${JSON.stringify(input?.iterateELDR?.[0])};                             
                                                    
  function execute() {                                                                  
    try {                                           
      const lineItems = Array.isArray(order?.lineItems?.edges)
        ? order.lineItems.edges
        : [];

      const skus = [
        ...new Set(
          lineItems
            .map(function (item) { return item?.node?.sku; })
            .filter(Boolean)
            .map(function (sku) { return String(sku).trim(); })
        )
      ];

      if (!skus.length) {
        return {
          success: false,
          message: 'No SKUs found in Shopify lineItems',
          orderName: order?.name,
          items: [],
          missingSkus: []
        };
      }

      const skuFilters = [];
      skus.forEach(function (sku, index) {
        if (index > 0) skuFilters.push('OR');
        skuFilters.push(['itemid', 'is', sku]);
      });

      const itemSearch = search.create({
        type: search.Type.ITEM,
        filters: [skuFilters],
        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'itemid' }),
          search.createColumn({ name: 'displayname' }),
          search.createColumn({ name: 'salesdescription' }),
          search.createColumn({ name: 'upccode' }),
          search.createColumn({ name: 'isinactive' })
        ]
      });

      function extractSku(itemId) {
        var parts = String(itemId || '').split(' : ');
        return parts[parts.length - 1].trim();
      }

      const foundSkuMap = {};
      const inactiveSkuSet = {};

      itemSearch.run().each(function (result) {
        const key = extractSku(result.getValue({ name: 'itemid' }));
        const isInactive = result.getValue({ name: 'isinactive' }) === 'T';

        if (isInactive) {
          inactiveSkuSet[key] = true;
        } else {
          foundSkuMap[key] = {
            internalId: result.getValue({ name: 'internalid' }),
            sku: result.getValue({ name: 'itemid' }),
            displayName: result.getValue({ name: 'displayname' }),
            salesDescription: result.getValue({ name: 'salesdescription' }),
            upcCode: result.getValue({ name: 'upccode' })
          };
        }
        return true;
      });

      const missingSkus = skus
        .filter(function (sku) { return !foundSkuMap[sku]; })
        .map(function (sku) {
          return {
            sku: sku,
            reason: inactiveSkuSet[sku]
              ? 'Item exists in NetSuite but is inactive'
              : 'Item not found in NetSuite'
          };
        });

      const foundItems = skus
        .filter(function (sku) { return foundSkuMap[sku]; })
        .map(function (sku) { return foundSkuMap[sku]; });

      const enrichedLineItems = lineItems.map(function (lineItem) {
        const node = lineItem.node || {};
        const sku = String(node.sku || '').trim();
        const netsuiteItem = foundSkuMap[sku] || null;

        return {
          shopifyLineItemId: node.legacyResourceId,
          title: node.title,
          sku: sku,
          quantity: node.quantity,
          originalUnitPrice: node.originalUnitPriceSet?.shopMoney?.amount,
          discountedTotal: node.discountedTotalSet?.shopMoney?.amount,
          currencyCode: node.originalUnitPriceSet?.shopMoney?.currencyCode,
          netsuiteItemId: netsuiteItem?.internalId || null,
          netsuiteItem: netsuiteItem
        };
      });

      return {
        success: missingSkus.length === 0,
        orderId: order?.legacyResourceId,
        orderName: order?.name,
        searchedSkus: skus,
        foundItems: foundItems,
        missingSkus: missingSkus,
        lineItems: enrichedLineItems
      };

    } catch (error) {
      return {
        success: false,
        message: error.message,
        stack: error.stack,
        error: error
      };
    }
  }

  execute();