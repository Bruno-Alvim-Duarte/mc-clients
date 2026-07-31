var payload = ${JSON.stringify(input?.mapL4FH?.[0] || {})};

function setIf(rec, fieldId, value) {
  if (value !== null && value !== undefined && value !== '') {
    rec.setValue({
      fieldId,
      value,
    });
  }
}

function toNetSuiteDateText(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return [
      String(value.getUTCMonth() + 1),
      String(value.getUTCDate()),
      String(value.getUTCFullYear()),
    ].join('/');
  }

  const raw = String(value).trim();
  const firstTen = raw.slice(0, 10);

  if (
    firstTen.length === 10 &&
    firstTen.charAt(4) === '-' &&
    firstTen.charAt(7) === '-'
  ) {
    const parts = firstTen.split('-');

    return [
      String(Number(parts[1])),
      String(Number(parts[2])),
      parts[0],
    ].join('/');
  }

  if (raw.indexOf('/') !== -1) {
    return raw;
  }

  return null;
}

function setDateTextIf(rec, fieldId, value) {
  const dateText = toNetSuiteDateText(value);

  if (dateText) {
    rec.setText({
      fieldId,
      text: dateText,
    });
  }

  return dateText;
}

function isClosedPeriodDateError(error) {
  const message = String((error && error.message) || '').toLowerCase();

  return (
    message.indexOf('transaction date is not within an open accounting period') !== -1 ||
    message.indexOf('inventory costing calculations in a closed period') !== -1
  );
}

function getFieldTextSafe(rec, fieldId) {
  try {
    return rec.getText({ fieldId });
  } catch (error) {
    return null;
  }
}

function getFieldValueSafe(rec, fieldId) {
  try {
    const value = rec.getValue({ fieldId });

    if (value instanceof Date) {
      return value.toISOString();
    }

    return value === undefined ? null : value;
  } catch (error) {
    return null;
  }
}

function buildDateDiagnostics(rec, attemptName, inputTranDateValue, tranDateText) {
  return {
    attemptName,
    inputTranDateValue,
    inputTranDateType: Object.prototype.toString.call(inputTranDateValue),
    inputTranDateString: String(inputTranDateValue),
    tranDateText,
    recordTranDateText: getFieldTextSafe(rec, 'trandate'),
    recordTranDateValue: getFieldValueSafe(rec, 'trandate'),
    postingPeriodText: getFieldTextSafe(rec, 'postingperiod'),
    postingPeriodValue: getFieldValueSafe(rec, 'postingperiod'),
  };
}

function findOpenPostingPeriodForDate(dateText) {
  if (!dateText || typeof search === 'undefined') {
    return null;
  }

  try {
    const accountingPeriodSearch = search.create({
      type: 'accountingperiod',
      filters: [
        ['startdate', 'onorbefore', dateText],
        'AND',
        ['enddate', 'onorafter', dateText],
        'AND',
        ['isyear', 'is', 'F'],
        'AND',
        ['isquarter', 'is', 'F'],
        'AND',
        ['closed', 'is', 'F'],
      ],
      columns: [
        search.createColumn({ name: 'internalid' }),
        search.createColumn({ name: 'periodname' }),
        search.createColumn({ name: 'startdate' }),
        search.createColumn({ name: 'enddate' }),
        search.createColumn({ name: 'closed' }),
      ],
    });

    let match = null;

    accountingPeriodSearch.run().each(function(result) {
      match = {
        id: String(result.getValue({ name: 'internalid' })),
        name: result.getValue({ name: 'periodname' }),
        startDate: result.getValue({ name: 'startdate' }),
        endDate: result.getValue({ name: 'enddate' }),
        closed: result.getValue({ name: 'closed' }),
      };

      return false;
    });

    return match;
  } catch (error) {
    return {
      error: error.message,
    };
  }
}

function createAndSaveInvoice(tranDateValue, attemptName) {
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

  const tranDateText = setDateTextIf(invoice, 'trandate', tranDateValue);
  const postingPeriod = findOpenPostingPeriodForDate(tranDateText);

  if (postingPeriod && postingPeriod.id) {
    setIf(invoice, 'postingperiod', postingPeriod.id);
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

  const dateDiagnostics = buildDateDiagnostics(
    invoice,
    attemptName,
    tranDateValue,
    tranDateText
  );
  dateDiagnostics.openPostingPeriodLookup = postingPeriod;

  let id;

  try {
    id = invoice.save({
      enableSourcing: true,
      ignoreMandatoryFields: false,
    });
  } catch (error) {
    error.dateDiagnostics = dateDiagnostics;
    throw error;
  }

  return {
    id,
    lines,
    tranDateText,
    dateDiagnostics,
  };
}

function execute() {
  let usedClosedPeriodFallback = false;
  let originalDateError = null;
  const attemptedTranDate = payload && payload.tranDate;
  const attemptedFallbackTranDate = payload && payload.fallbackTranDate;
  const dateAttemptDiagnostics = [];

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

    try {
      saveResult = createAndSaveInvoice(payload.tranDate, 'actual_transaction_date');
      dateAttemptDiagnostics.push(saveResult.dateDiagnostics);
    } catch (error) {
      if (error.dateDiagnostics) {
        dateAttemptDiagnostics.push(error.dateDiagnostics);
      }

      if (!payload.fallbackTranDate || !isClosedPeriodDateError(error)) {
        throw error;
      }

      usedClosedPeriodFallback = true;
      originalDateError = error.message;

      try {
        saveResult = createAndSaveInvoice(payload.fallbackTranDate, 'fallback_current_month_first_day');
        dateAttemptDiagnostics.push(saveResult.dateDiagnostics);
      } catch (fallbackError) {
        if (fallbackError.dateDiagnostics) {
          dateAttemptDiagnostics.push(fallbackError.dateDiagnostics);
        }

        throw fallbackError;
      }
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
      tranDateText: saveResult.tranDateText,
      dateAttemptDiagnostics,
    };
  } catch (error) {
    return {
      success: false,
      message: error.message,
      stack: error.stack,
      error,
      amazonOrderId: payload.amazonOrderId,
      attemptedTranDate,
      attemptedFallbackTranDate,
      usedClosedPeriodFallback,
      originalDateError,
      dateAttemptDiagnostics,
    };
  }
}

execute();
