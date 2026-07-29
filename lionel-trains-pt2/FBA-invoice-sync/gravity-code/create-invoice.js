var payload = ${JSON.stringify(input?.mapL4FH?.[0] || {})};

function setIf(rec, fieldId, value) {
  if (value !== null && value !== undefined && value !== '') {
    rec.setValue({
      fieldId,
      value,
    });
  }
}

function execute() {
  try {
    if (!payload?.canCreate) {
      throw new Error(
        'Invoice payload is not createable for Amazon order ' +
          (payload && payload.amazonOrderId ? payload.amazonOrderId : '') +
          ': ' +
          ((payload && payload.validationErrors) || []).join('; ')
      );
    }

    const invoice = record.create({
      type: record.Type.INVOICE,
      isDynamic: true,
    });

    setIf(invoice, 'externalid', payload.externalId);
    setIf(invoice, 'entity', payload.entity);
    setIf(invoice, 'subsidiary', payload.subsidiary);
    setIf(invoice, 'department', payload.department);
    setIf(invoice, payload.divisionFieldId || 'csegdivision', payload.division);
    setIf(invoice, 'class', payload.class);
    setIf(invoice, 'location', payload.location);
    setIf(invoice, 'memo', payload.memo);
    setIf(invoice, 'otherrefnum', payload.otherRefNum);

    if (payload.tranDate) {
      setIf(invoice, 'trandate', new Date(payload.tranDate));
    }

    if (Number(payload.shippingCost || 0) > 0) {
      setIf(invoice, 'shippingcost', Number(payload.shippingCost));
    }
    setIf(invoice, 'shipmethod', payload.shipmethod)

    const lines = [
      ...(payload.itemLines || []),
      ...(payload.chargeLines || []),
    ];

    for (const line of lines) {
      invoice.selectNewLine({
        sublistId: 'item',
      });

      invoice.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'item',
        value: line.itemInternalId,
      });

      invoice.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'quantity',
        value: Number(line.quantity || 1),
      });

      invoice.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'rate',
        value: Number(line.rate || 0),
      });

      if (line.description) {
        invoice.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'description',
          value: line.description,
        });
      }

      if (payload.department) {
        invoice.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'department',
          value: payload.department,
        });
      }

      invoice.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'csegdivision',
        value: payload.division,
      });

      if (payload.class) {
        invoice.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'class',
          value: payload.class,
        });
      }

      if (payload.location) {
        invoice.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'location',
          value: payload.location,
        });
      }

      invoice.commitLine({
        sublistId: 'item',
      });
    }

    const id = invoice.save({
      enableSourcing: true,
      ignoreMandatoryFields: false,
    });

    return {
      success: true,
      id: String(id),
      externalId: payload.externalId,
      amazonOrderId: payload.amazonOrderId,
      lineCount: lines.length,
      shippingCost: payload.shippingCost || 0,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      stack: error.stack,
      error,
      amazonOrderId: payload.amazonOrderId
    };
  }
}

execute();