const shopifyOrderId = ${JSON.stringify(input?.iterateF7I7[0]?.node?.name)};

  function execute() {
    try {
      if (!shopifyOrderId) {
        return {
          success: false,
          message: 'Missing Shopify Order ID input.'
        };
      }

      const salesOrderSearch = search.create({
        type: search.Type.SALES_ORDER,
        filters: [
          ['mainline', 'is', 'F'],
          'AND',
          ['taxline', 'is', 'F'],
          'AND',
          ['shipping', 'is', 'F'],
          'AND',
          ['custbody_shopify_ord_id', 'is', String(shopifyOrderId)]
        ],

        columns: [
          search.createColumn({ name: 'internalid' }),
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'entity' }),
          search.createColumn({ name: 'status' }),
          search.createColumn({ name: 'trandate' }),
          search.createColumn({ name: 'total' }),
          search.createColumn({ name: 'custbody_shopify_ord_id' })
        ]
      });

      const results = [];

      salesOrderSearch.run().each(function (result) {
        results.push({
          internalId: result.getValue({ name: 'internalid' }),
          tranId: result.getValue({ name: 'tranid' }),
          customerId: result.getValue({ name: 'entity' }),
          customerName: result.getText({ name: 'entity' }),
          status: result.getValue({ name: 'status' }),
          statusText: result.getText({ name: 'status' }),
          tranDate: result.getValue({ name: 'trandate' }),
          total: result.getValue({ name: 'total' }),
          shopifyOrderId: result.getValue({ name: 'custbody_shopify_ord_id' })
        });

        return results.length < 10;
      });

      return {
        success: results.length > 0,
        shopifyOrderId: String(shopifyOrderId),
        count: results.length,
        salesOrders: results,
        salesOrderId: results[0]?.internalId || null
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
