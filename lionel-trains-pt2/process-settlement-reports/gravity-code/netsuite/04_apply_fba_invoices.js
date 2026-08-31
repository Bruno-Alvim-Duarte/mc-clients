// NetSuite Execute Custom Code: Apply a settlement JE's AR credit to FBA invoices.
//
// This does not set an invoice status directly. NetSuite marks an invoice paid when
// a Customer Payment applies both the JE credit and the open invoice. The payment
// amount is zero, so this creates no duplicate cash posting.
//
// Expected input:
// - input.mapBuildRuntimeConfig[0]
// - input.mapBuildJournalEntryPayload[0]
// - input.netsuiteCreateJournalEntry[0] OR input.netsuiteSearchExistingJournalEntry[0]
//
// Replace the input step keys with the actual Gravity keys after Cloudy creates them.

const runtimeConfig = ${JSON.stringify(input?.mapF0FK?.[0])};
const settlement = ${JSON.stringify(input?.mapWLLK?.[0])};
const createResult = ${JSON.stringify(input?.netsuiteExecuteCustomCodeYDBY?.[0])};
const searchResult = ${JSON.stringify(input?.netsuiteExecuteCustomCodeWGNK?.[0])};

const CONFIG = {
  moneyTolerance: Number(runtimeConfig?.behavior?.moneyTolerance || 0.01),
  invoiceConversionRoundingAdjustmentLimit: Number(
    runtimeConfig?.behavior?.invoiceConversionRoundingAdjustmentLimit || 0.05
  ),
  customerId: String(
    runtimeConfig?.netsuite?.fbaInvoiceCustomerInternalId ||
    runtimeConfig?.netsuite?.journalEntryLineEntityId ||
    ""
  ).trim(),
  arAccountId: String(runtimeConfig?.netsuite?.accountIds?.accountsReceivable || "").trim()
};

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function amountsMatch(left, right) {
  return Math.abs(toNumber(left) - toNumber(right)) <= CONFIG.moneyTolerance;
}

function parseDateOnly(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const dateOnly = text.indexOf("T") >= 0 ? text.split("T")[0] : text.split(" ")[0];
  const parts = dateOnly.split("-");
  if (parts.length !== 3) return null;

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  return year && month && day ? new Date(year, month - 1, day) : null;
}

function getJournalEntryId() {
  if (createResult?.journalEntryId || createResult?.id) {
    return String(createResult.journalEntryId || createResult.id);
  }

  if (searchResult?.existingJournalEntry?.internalId) {
    return String(searchResult.existingJournalEntry.internalId);
  }

  return null;
}

function getSettlementAmountsByOrder() {
  const amounts = {};

  for (const item of settlement?.fbaInvoiceSettlementAmounts || []) {
    const amazonOrderId = String(item?.amazonOrderId || "").trim();
    if (!amazonOrderId) continue;

    if (!amounts[amazonOrderId]) {
      amounts[amazonOrderId] = {
        arAmount: 0,
        originalArAmount: 0,
        hasOriginalArAmount: false
      };
    }

    amounts[amazonOrderId].arAmount = roundMoney(
      amounts[amazonOrderId].arAmount + toNumber(item?.arAmount)
    );

    const originalArAmount = toFiniteNumber(item?.originalArAmount);
    if (originalArAmount !== null) {
      amounts[amazonOrderId].originalArAmount = roundMoney(
        amounts[amazonOrderId].originalArAmount + originalArAmount
      );
      amounts[amazonOrderId].hasOriginalArAmount = true;
    }
  }

  return amounts;
}

function requiresInvoiceCurrencyConversion() {
  return Boolean(settlement?.currencyConversion?.required);
}

function getInvoiceConversionRate() {
  const exchangeRate = toFiniteNumber(settlement?.currencyConversion?.exchangeRate);

  if (exchangeRate === null || exchangeRate <= 0) {
    throw new Error(
      "Settlement " + settlement?.settlementId +
      " requires currency conversion but has no valid Amazon exchange rate"
    );
  }

  return exchangeRate;
}

function getPaymentExternalId() {
  return "amazon_settlement_invoice_application_" + (settlement?.settlementId || "");
}

function findExistingPayment(externalId) {
  const matches = [];
  const paymentSearch = search.create({
    type: search.Type.TRANSACTION,
    filters: [
      ["type", "anyof", "CustPymt"],
      "AND",
      ["mainline", "is", "T"],
      "AND",
      ["externalidstring", "is", externalId]
    ],
    columns: [search.createColumn({ name: "internalid" })]
  });

  paymentSearch.run().each(function(result) {
    matches.push(String(result.getValue({ name: "internalid" })));
    return matches.length < 2;
  });

  if (matches.length > 1) {
    throw new Error("Found multiple Customer Payments with external ID " + externalId + ": " + matches.join(", "));
  }

  return matches[0] || null;
}

function buildExternalIdMatchExpression(orderIds) {
  const expression = [];

  orderIds.forEach(function(amazonOrderId, index) {
    if (index > 0) expression.push("OR");
    expression.push(["externalidstring", "is", amazonOrderId]);
  });

  return expression;
}

function identifyMatchingOrder(invoice, settlementAmountsByOrder) {
  const externalId = String(invoice.externalId || "").trim();
  return settlementAmountsByOrder[externalId] !== undefined ? externalId : null;
}

function findOpenFbaInvoices(settlementAmountsByOrder) {
  const orderIds = Object.keys(settlementAmountsByOrder).filter(function(amazonOrderId) {
    return settlementAmountsByOrder[amazonOrderId].arAmount > CONFIG.moneyTolerance;
  });
  const invoicesById = {};

  // Chunk the OR expression to stay below NetSuite search-expression limits.
  for (let start = 0; start < orderIds.length; start += 25) {
    const chunk = orderIds.slice(start, start + 25);
    const invoiceSearch = search.create({
      type: search.Type.INVOICE,
      filters: [
        ["mainline", "is", "T"],
        "AND",
        ["entity", "anyof", CONFIG.customerId],
        "AND",
        ["amountremaining", "greaterthan", "0"],
        "AND",
        buildExternalIdMatchExpression(chunk)
      ],
      columns: [
        search.createColumn({ name: "internalid" }),
        search.createColumn({ name: "externalid" }),
        search.createColumn({ name: "amountremaining" })
      ]
    });

    invoiceSearch.run().each(function(result) {
      const invoice = {
        internalId: String(result.getValue({ name: "internalid" })),
        externalId: result.getValue({ name: "externalid" }),
        amountRemaining: roundMoney(result.getValue({ name: "amountremaining" }))
      };
      const amazonOrderId = identifyMatchingOrder(invoice, settlementAmountsByOrder);

      if (amazonOrderId) {
        const existingInvoice = invoicesById[invoice.internalId];
        if (existingInvoice) {
          if (existingInvoice.amazonOrderId !== amazonOrderId) {
            throw new Error(
              "Invoice " + invoice.internalId + " matched multiple Amazon order IDs: " +
              existingInvoice.amazonOrderId + ", " + amazonOrderId
            );
          }
          return true;
        }
        invoicesById[invoice.internalId] = { ...invoice, amazonOrderId };
      }

      return true;
    });
  }

  const invoices = Object.keys(invoicesById).map(function(internalId) {
    return invoicesById[internalId];
  });
  const invoiceByOrder = {};

  invoices.forEach(function(invoice) {
    if (invoiceByOrder[invoice.amazonOrderId]) {
      throw new Error(
        "Multiple open FBA invoices match Amazon order " + invoice.amazonOrderId + ": " +
        invoiceByOrder[invoice.amazonOrderId].internalId + ", " + invoice.internalId
      );
    }
    invoiceByOrder[invoice.amazonOrderId] = invoice;
  });

  return invoices;
}

function getItemLineForRoundingAdjustment(invoiceRecord) {
  const itemLineCount = invoiceRecord.getLineCount({ sublistId: "item" });
  let candidate = null;

  for (let line = 0; line < itemLineCount; line += 1) {
    const quantity = toFiniteNumber(invoiceRecord.getSublistValue({
      sublistId: "item",
      fieldId: "quantity",
      line
    }));
    const rate = toFiniteNumber(invoiceRecord.getSublistValue({
      sublistId: "item",
      fieldId: "rate",
      line
    }));

    if (quantity === null || quantity <= 0 || rate === null) continue;

    const magnitude = Math.abs(quantity * rate);
    if (!candidate || magnitude > candidate.magnitude) {
      candidate = { line, quantity, rate, magnitude };
    }
  }

  return candidate;
}

function saveInvoiceConversion(invoiceRecord) {
  return String(invoiceRecord.save({
    enableSourcing: true,
    ignoreMandatoryFields: false
  }));
}

function loadInvoice(invoiceId) {
  return record.load({
    type: record.Type.INVOICE,
    id: Number(invoiceId),
    isDynamic: false
  });
}

function getInvoiceTotal(invoiceRecord) {
  return roundMoney(invoiceRecord.getValue({ fieldId: "total" }));
}

function applyRoundingAdjustmentToInvoice(invoiceId, targetAmount, currentAmount) {
  const roundingAdjustment = roundMoney(targetAmount - currentAmount);

  if (Math.abs(roundingAdjustment) <= CONFIG.moneyTolerance) {
    return {
      invoiceId: String(invoiceId),
      roundingAdjustment: 0,
      total: currentAmount
    };
  }

  if (Math.abs(roundingAdjustment) > CONFIG.invoiceConversionRoundingAdjustmentLimit) {
    throw new Error(
      "Invoice " + invoiceId + " conversion produced " + currentAmount +
      ", which differs from the Amazon converted amount " + targetAmount +
      " by " + roundingAdjustment + ". The permitted rounding adjustment is " +
      CONFIG.invoiceConversionRoundingAdjustmentLimit + ". It was not paid."
    );
  }

  const invoiceRecord = loadInvoice(invoiceId);
  const candidate = getItemLineForRoundingAdjustment(invoiceRecord);

  if (!candidate) {
    throw new Error(
      "Invoice " + invoiceId + " needs a " + roundingAdjustment +
      " currency-conversion rounding adjustment but has no adjustable item line"
    );
  }

  invoiceRecord.setSublistValue({
    sublistId: "item",
    fieldId: "rate",
    line: candidate.line,
    value: candidate.rate + (roundingAdjustment / candidate.quantity)
  });
  saveInvoiceConversion(invoiceRecord);

  const reloadedInvoice = loadInvoice(invoiceId);
  const adjustedTotal = getInvoiceTotal(reloadedInvoice);

  if (!amountsMatch(adjustedTotal, targetAmount)) {
    throw new Error(
      "Invoice " + invoiceId + " total is " + adjustedTotal +
      " after currency conversion and rounding adjustment, but Amazon converted amount is " +
      targetAmount + ". It was not paid."
    );
  }

  return {
    invoiceId: String(invoiceId),
    roundingAdjustment,
    total: adjustedTotal
  };
}

function updateInvoiceForSettlementConversion(invoice, settlementAmountsByOrder) {
  if (!requiresInvoiceCurrencyConversion()) {
    return {
      converted: false,
      reason: "Settlement does not require currency conversion"
    };
  }

  const settlementAmounts = settlementAmountsByOrder[invoice.amazonOrderId];
  if (!settlementAmounts || !settlementAmounts.hasOriginalArAmount) {
    throw new Error(
      "Missing original AR amount for Amazon order " + invoice.amazonOrderId +
      " on converted settlement " + settlement?.settlementId
    );
  }

  const sourceAmount = roundMoney(settlementAmounts.originalArAmount);
  const targetAmount = roundMoney(settlementAmounts.arAmount);
  const exchangeRate = getInvoiceConversionRate();
  const exchangeRateTarget = roundMoney(sourceAmount * exchangeRate);

  if (sourceAmount <= CONFIG.moneyTolerance || targetAmount <= CONFIG.moneyTolerance) {
    throw new Error(
      "Invalid source or converted AR amount for Amazon order " + invoice.amazonOrderId +
      ": " + sourceAmount + " -> " + targetAmount
    );
  }

  if (!amountsMatch(exchangeRateTarget, targetAmount)) {
    throw new Error(
      "Amazon order " + invoice.amazonOrderId + " has converted AR amount " + targetAmount +
      ", but its source AR amount " + sourceAmount + " multiplied by the Amazon exchange rate " +
      exchangeRate + " equals " + exchangeRateTarget
    );
  }

  let invoiceRecord = loadInvoice(invoice.internalId);
  const currentTotal = getInvoiceTotal(invoiceRecord);
  const currentDue = roundMoney(invoice.amountRemaining);

  // A previously applied payment means changing the invoice total could corrupt its balance.
  if (!amountsMatch(currentDue, currentTotal)) {
    throw new Error(
      "Invoice " + invoice.internalId + " for Amazon order " + invoice.amazonOrderId +
      " is already partially applied (total " + currentTotal + ", due " + currentDue +
      ") and was not currency-converted or paid"
    );
  }

  // This makes retries safe when the invoice was corrected but Customer Payment creation failed.
  if (amountsMatch(currentTotal, targetAmount)) {
    return {
      converted: false,
      alreadyConverted: true,
      sourceAmount,
      targetAmount,
      currentTotal
    };
  }

  // Only scale an untouched FBA invoice. A different source value needs manual review.
  if (!amountsMatch(currentTotal, sourceAmount)) {
    throw new Error(
      "Invoice " + invoice.internalId + " for Amazon order " + invoice.amazonOrderId +
      " has total " + currentTotal + ", but the source settlement AR amount is " + sourceAmount +
      " and the Amazon converted amount is " + targetAmount + ". It was not updated or paid."
    );
  }

  const itemLineCount = invoiceRecord.getLineCount({ sublistId: "item" });
  if (itemLineCount === 0) {
    throw new Error(
      "Invoice " + invoice.internalId + " for Amazon order " + invoice.amazonOrderId +
      " has no item lines to convert"
    );
  }

  for (let line = 0; line < itemLineCount; line += 1) {
    const currentRate = toFiniteNumber(invoiceRecord.getSublistValue({
      sublistId: "item",
      fieldId: "rate",
      line
    }));

    if (currentRate === null) {
      throw new Error(
        "Invoice " + invoice.internalId + " line " + line +
        " has no numeric rate and cannot be currency-converted"
      );
    }

    invoiceRecord.setSublistValue({
      sublistId: "item",
      fieldId: "rate",
      line,
      value: currentRate * exchangeRate
    });
  }

  const shippingCost = toFiniteNumber(invoiceRecord.getValue({ fieldId: "shippingcost" }));
  if (shippingCost !== null && shippingCost !== 0) {
    invoiceRecord.setValue({
      fieldId: "shippingcost",
      value: shippingCost * exchangeRate
    });
  }

  saveInvoiceConversion(invoiceRecord);

  invoiceRecord = loadInvoice(invoice.internalId);
  const convertedTotal = getInvoiceTotal(invoiceRecord);
  const rounding = applyRoundingAdjustmentToInvoice(
    invoice.internalId,
    targetAmount,
    convertedTotal
  );

  return {
    converted: true,
    sourceAmount,
    targetAmount,
    exchangeRate,
    convertedTotal: rounding.total,
    roundingAdjustment: rounding.roundingAdjustment
  };
}

function findSublistLine(recordObject, sublistId, fieldId, value) {
  const lineCount = recordObject.getLineCount({ sublistId });
  const expected = String(value);

  for (let line = 0; line < lineCount; line += 1) {
    const lineValue = recordObject.getSublistValue({ sublistId, fieldId, line });
    if (String(lineValue || "") === expected) return line;
  }

  return -1;
}

function getCreditLines(payment, journalEntryId) {
  const lines = [];
  const lineCount = payment.getLineCount({ sublistId: "credit" });

  for (let line = 0; line < lineCount; line += 1) {
    const sourceId = String(payment.getSublistValue({
      sublistId: "credit",
      fieldId: "internalid",
      line
    }) || "");

    if (sourceId !== journalEntryId) continue;

    const due = roundMoney(payment.getSublistValue({
      sublistId: "credit",
      fieldId: "due",
      line
    }));

    if (due > CONFIG.moneyTolerance) {
      lines.push({ line, due });
    }
  }

  return lines;
}

function execute() {
  try {
    if (!settlement?.settlementId) {
      throw new Error("Missing settlement payload while applying FBA invoices");
    }

    if (!CONFIG.customerId) {
      throw new Error(
        "Missing workflowArguments.fbaInvoiceCustomerInternalId (or journalEntryLineEntityId) " +
        "for FBA invoice application"
      );
    }

    if (!CONFIG.arAccountId) {
      throw new Error("Missing NetSuite Accounts Receivable internal ID for FBA invoice application");
    }

    const journalEntryId = getJournalEntryId();
    if (!journalEntryId) {
      throw new Error("Missing Journal Entry ID while applying FBA invoices");
    }

    const settlementAmountsByOrder = getSettlementAmountsByOrder();
    const paymentExternalId = getPaymentExternalId();
    const existingPaymentId = findExistingPayment(paymentExternalId);

    if (existingPaymentId) {
      return {
        success: true,
        alreadyApplied: true,
        settlementId: settlement.settlementId,
        journalEntryId,
        customerPaymentId: existingPaymentId,
        paymentExternalId
      };
    }

    const invoices = findOpenFbaInvoices(settlementAmountsByOrder);
    if (invoices.length === 0) {
      return {
        success: true,
        skipped: true,
        reason: "No open FBA invoices matched this settlement's Amazon order IDs",
        settlementId: settlement.settlementId,
        journalEntryId,
        paymentExternalId,
        settlementOrderCount: Object.keys(settlementAmountsByOrder).length,
        invoiceCount: 0
      };
    }

    // When Amazon converted the settlement (for example MXN to USD), FBA Invoice
    // Sync created the invoice with the unconverted source amount in USD. Correct
    // that invoice first, using Amazon's actual settlement rate, so its open balance
    // equals the AR credit on the USD Journal Entry before creating the payment.
    const invoiceConversions = invoices.map(function(invoice) {
      return {
        invoiceId: invoice.internalId,
        amazonOrderId: invoice.amazonOrderId,
        ...updateInvoiceForSettlementConversion(invoice, settlementAmountsByOrder)
      };
    });

    const payment = record.transform({
      fromType: record.Type.CUSTOMER,
      fromId: Number(CONFIG.customerId),
      toType: record.Type.CUSTOMER_PAYMENT,
      isDynamic: false
    });

    // Currency affects which invoices and credits NetSuite exposes on the sublists.
    if (settlement?.payload?.currency?.id) {
      payment.setValue({ fieldId: "currency", value: Number(settlement.payload.currency.id) });
    }

    payment.setValue({ fieldId: "aracct", value: Number(CONFIG.arAccountId) });
    // Do not set payment to zero directly. Once matching credit and invoice lines
    // are applied below, NetSuite calculates the zero payment amount itself.
    payment.setValue({ fieldId: "autoapply", value: false });
    payment.setValue({ fieldId: "externalid", value: paymentExternalId });
    payment.setValue({
      fieldId: "memo",
      value: "Apply Amazon settlement " + settlement.settlementId + " Journal Entry to FBA invoices"
    });

    const paymentDate = parseDateOnly(settlement.tranDate);
    if (paymentDate) payment.setValue({ fieldId: "trandate", value: paymentDate });

    const selectedInvoices = [];
    let invoiceApplicationTotal = 0;

    invoices.forEach(function(invoice) {
      const applyLine = findSublistLine(payment, "apply", "internalid", invoice.internalId);
      if (applyLine < 0) {
        throw new Error(
          "Open invoice " + invoice.internalId + " for Amazon order " + invoice.amazonOrderId + " " +
          "is unavailable to this Customer Payment. Check its customer, AR account, subsidiary, and currency."
        );
      }

      const amountDue = roundMoney(payment.getSublistValue({
        sublistId: "apply",
        fieldId: "due",
        line: applyLine
      }));
      const settlementArAmount = roundMoney(
        settlementAmountsByOrder[invoice.amazonOrderId].arAmount
      );

      if (amountDue <= CONFIG.moneyTolerance) return;
      if (amountDue > settlementArAmount + CONFIG.moneyTolerance) {
        throw new Error(
          "Invoice " + invoice.internalId + " for Amazon order " + invoice.amazonOrderId + " has " + amountDue + " due, " +
          "but this settlement supplies only " + settlementArAmount + " of AR credit. It was not partially applied."
        );
      }

      selectedInvoices.push({
        ...invoice,
        applyLine,
        amount: amountDue,
        settlementArAmount
      });
      invoiceApplicationTotal = roundMoney(invoiceApplicationTotal + amountDue);
    });

    if (selectedInvoices.length === 0) {
      return {
        success: true,
        skipped: true,
        reason: "Matching FBA invoices have no amount due",
        settlementId: settlement.settlementId,
        journalEntryId,
        paymentExternalId,
        invoiceCount: invoices.length
      };
    }

    const creditLines = getCreditLines(payment, journalEntryId);
    const creditAvailable = roundMoney(creditLines.reduce(function(sum, line) {
      return sum + line.due;
    }, 0));

    if (creditAvailable + CONFIG.moneyTolerance < invoiceApplicationTotal) {
      throw new Error(
        "Journal Entry " + journalEntryId + " has only " + creditAvailable + " of available AR credit, " +
        "but the matched FBA invoices require " + invoiceApplicationTotal + ". No invoices were applied."
      );
    }

    selectedInvoices.forEach(function(invoice) {
      payment.setSublistValue({
        sublistId: "apply",
        fieldId: "amount",
        line: invoice.applyLine,
        value: invoice.amount
      });
      payment.setSublistValue({
        sublistId: "apply",
        fieldId: "apply",
        line: invoice.applyLine,
        value: true
      });
    });

    let remainingCreditToApply = invoiceApplicationTotal;
    creditLines.forEach(function(creditLine) {
      if (remainingCreditToApply <= CONFIG.moneyTolerance) return;

      const amount = roundMoney(Math.min(creditLine.due, remainingCreditToApply));
      payment.setSublistValue({
        sublistId: "credit",
        fieldId: "amount",
        line: creditLine.line,
        value: amount
      });
      payment.setSublistValue({
        sublistId: "credit",
        fieldId: "apply",
        line: creditLine.line,
        value: true
      });
      remainingCreditToApply = roundMoney(remainingCreditToApply - amount);
    });

    if (remainingCreditToApply > CONFIG.moneyTolerance) {
      throw new Error(
        "Unable to allocate the required " + invoiceApplicationTotal + " of JE credit; " +
        remainingCreditToApply + " remains unapplied."
      );
    }

    const customerPaymentId = payment.save({
      enableSourcing: true,
      ignoreMandatoryFields: false
    });

    return {
      success: true,
      settlementId: settlement.settlementId,
      journalEntryId,
      customerPaymentId: String(customerPaymentId),
      paymentExternalId,
      customerId: CONFIG.customerId,
      invoiceCount: selectedInvoices.length,
      appliedAmount: invoiceApplicationTotal,
      availableJournalEntryCredit: creditAvailable,
      unappliedJournalEntryCredit: roundMoney(creditAvailable - invoiceApplicationTotal),
      invoiceConversions,
      invoices: selectedInvoices.map(function(invoice) {
        return {
          amazonOrderId: invoice.amazonOrderId,
          invoiceId: invoice.internalId,
          amount: invoice.amount
        };
      })
    };
  } catch (error) {
    return {
      success: false,
      settlementId: settlement?.settlementId || null,
      journalEntryId: getJournalEntryId(),
      message: error.message,
      stack: error.stack,
      error
    };
  }
}

execute();
