const orderInfo = ${JSON.stringify(input['mapQC7W']?.[0] || {})};

function execute() {
  try {
    const externalId = String(orderInfo?.amazonOrderId || '').trim();
    if (!externalId) return [];

    const invoiceSearch = search.create({
      type: search.Type.INVOICE,
      filters: [
        ['mainline', 'is', 'T'],
        'AND',
        ['externalidstring', 'is', externalId]
      ],
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'tranid' }),
        search.createColumn({ name: 'externalid' }),
        search.createColumn({ name: 'entity' })
      ]
    });

    const matches = [];
    invoiceSearch.run().each(function(result) {
      matches.push({
        id: String(result.getValue({ name: 'internalid' })),
        tranid: result.getValue({ name: 'tranid' }),
        externalId: result.getValue({ name: 'externalid' }),
        entity: result.getValue({ name: 'entity' }),
        amazonOrderId: externalId
      });
      return false;
    });

    return matches;
  } catch (error) {
    return { success: false, message: error.message, stack: error.stack, error };
  }
}

execute();