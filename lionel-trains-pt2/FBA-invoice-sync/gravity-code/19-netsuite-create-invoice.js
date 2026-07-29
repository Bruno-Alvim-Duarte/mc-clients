var payload = ${JSON.stringify(input?.mapL4FH?.[0] || {})};

function setIf(rec, fieldId, value) {
  if (value !== null && value !== undefined && value !== '') {
    rec.setValue({
      fieldId,
      value,
    });
  }
}

function parseDateOnly(value) {
  if (!value) return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) return null;

  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isClosedPeriodDateError(error) {
  const message = String((error && error.message) || '').toLowerCase();

  return (
    message.indexOf('transaction date is not within an open accounting period') !== -1 ||
    message.indexOf('inventory costing calculations in a closed period') !== -1
  );
}

function createAndSaveInvoice(tranDateValue) {
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

  const tranDate = parseDateOnly(tranDateValue);
  if (tranDate) {
    setIf(invoice, 'trandate', tranDate);
  }

  if (Number(payload.shippingCost || 0) > 0) {
    setIf(invoice, 'shippingcost', Number(payload.shippingCost));
  }

  setIf(invoice, 'shipmethod', payload.shipmethod);

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
    id,
    lines,
    tranDate,
  };
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

    let saveResult;
    let usedClosedPeriodFallback = false;
    let originalDateError = null;

    try {
      saveResult = createAndSaveInvoice(payload.tranDate);
    } catch (error) {
      if (!payload.fallbackTranDate || !isClosedPeriodDateError(error)) {
        throw error;
      }

      usedClosedPeriodFallback = true;
      originalDateError = error.message;
      saveResult = createAndSaveInvoice(payload.fallbackTranDate);
    }

    return {
      success: true,
      id: String(saveResult.id),
      externalId: payload.externalId,
      amazonOrderId: payload.amazonOrderId,
      lineCount: saveResult.lines.length,
      shippingCost: payload.shippingCost || 0,
      tranDate: usedClosedPeriodFallback
        ? payload.fallbackTranDate
        : payload.tranDate,
      originalAmazonPurchaseDate: payload.originalAmazonPurchaseDate || null,
      usedClosedPeriodFallback,
      originalDateError,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      stack: error.stack,
      error,
      amazonOrderId: payload.amazonOrderId,
    };
  }
}

execute();
