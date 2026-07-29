// Gravity map step: Parse Amazon settlement TSV and aggregate by accounting category.
// Expected input:
// - input.mapBuildRuntimeConfig[0] from "Build Runtime Config"
// - input.iterateSettlementReport[0] from the report loop
// - input.amazonGetFbmReportDocument[0] from Amazon Seller "Get FBM Report Document"
// - input.httpDownloadSettlementReport[0] from HTTP GET against the signed document URL
//
// Replace step keys with the actual keys Cloudy creates.

const runtimeConfig = (input.mapF0FK || [])[0] || {};
const currentReport = (input.iterateEV9J || [])[0] || {};
const reportDocument = (input.amazonSellerNaNKN7D || [])[0] || {};
const httpResponse = (input.httpRequestHJ8M || [])[0] || {};

const CONFIG = {
  accountIds: {
    accountsReceivable: "123",
    cash: "1113",
    amazonSellingFees: "336",
    amazonFulfillmentFees: "434",
    amazonStorageFee: "523",
    refunds: "260"
  },
  departmentId: "34",
  allowCatchAllBySign: true,
  recordTaxLines: false,
  failWhenTaxDoesNotNetToZero: true,
  moneyTolerance: 0.01
};

if (runtimeConfig.netsuite && runtimeConfig.netsuite.accountIds) {
  CONFIG.accountIds = {
    ...CONFIG.accountIds,
    ...runtimeConfig.netsuite.accountIds
  };
}

if (runtimeConfig.netsuite && runtimeConfig.netsuite.departmentId) {
  CONFIG.departmentId = runtimeConfig.netsuite.departmentId;
}

if (runtimeConfig.behavior) {
  CONFIG.allowCatchAllBySign = runtimeConfig.behavior.allowCatchAllBySign !== undefined
    ? runtimeConfig.behavior.allowCatchAllBySign
    : CONFIG.allowCatchAllBySign;
  CONFIG.recordTaxLines = runtimeConfig.behavior.recordTaxLines !== undefined
    ? runtimeConfig.behavior.recordTaxLines
    : CONFIG.recordTaxLines;
  CONFIG.failWhenTaxDoesNotNetToZero = runtimeConfig.behavior.failWhenTaxDoesNotNetToZero !== undefined
    ? runtimeConfig.behavior.failWhenTaxDoesNotNetToZero
    : CONFIG.failWhenTaxDoesNotNetToZero;
  CONFIG.moneyTolerance = runtimeConfig.behavior.moneyTolerance || CONFIG.moneyTolerance;
}

const REQUIRED_HEADERS = [
  "settlement-id",
  "settlement-start-date",
  "settlement-end-date",
  "deposit-date",
  "total-amount",
  "currency",
  "transaction-type",
  "order-id",
  "merchant-order-id",
  "adjustment-id",
  "shipment-id",
  "marketplace-name",
  "amount-type",
  "amount-description",
  "amount",
  "fulfillment-id",
  "posted-date",
  "posted-date-time",
  "order-item-code",
  "merchant-order-item-id",
  "merchant-adjustment-item-id",
  "sku",
  "quantity-purchased",
  "promotion-id"
];

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function includesAny(value, patterns) {
  const text = normalizeKey(value);
  return patterns.some(pattern => text.indexOf(pattern) !== -1);
}

function getResponseBody(response) {
  if (typeof response === "string") return response;
  if (typeof response.body === "string") return response.body;
  if (typeof response.data === "string") return response.data;
  if (typeof response.content === "string") return response.content;
  if (typeof response.responseBody === "string") return response.responseBody;
  if (typeof response.text === "string") return response.text;
  if (response.body && typeof response.body === "object") return JSON.stringify(response.body);
  throw new Error("Unable to find downloaded settlement report body on HTTP response");
}

function parseTsv(tsv) {
  const lines = String(tsv || "")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim() !== "");

  if (lines.length < 2) {
    throw new Error("Settlement report is empty or missing rows");
  }

  const headers = lines[0].split("\t").map(header => header.trim());
  const missingHeaders = REQUIRED_HEADERS.filter(header => headers.indexOf(header) === -1);

  if (missingHeaders.length > 0) {
    throw new Error(`Settlement report is missing required headers: ${missingHeaders.join(", ")}`);
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split("\t");
    const row = { __lineNumber: index + 2 };

    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] !== undefined ? values[headerIndex] : "";
    });

    row.amountNumber = row.amount === "" ? 0 : Number(row.amount);
    if (row.amount !== "" && Number.isNaN(row.amountNumber)) {
      throw new Error(`Invalid amount on settlement line ${row.__lineNumber}: ${row.amount}`);
    }

    return row;
  });
}

function isHeaderRow(row) {
  return normalizeText(row["total-amount"]) !== "";
}

function isTaxRow(row) {
  const amountType = normalizeKey(row["amount-type"]);
  const description = normalizeKey(row["amount-description"]);

  return (
    amountType === "itemwithheldtax" ||
    description.indexOf("tax") !== -1
  );
}

function classifyRow(row) {
  const transactionType = normalizeText(row["transaction-type"]);
  const transactionKey = normalizeKey(transactionType);
  const amountType = normalizeKey(row["amount-type"]);
  const description = normalizeText(row["amount-description"]);
  const descriptionKey = normalizeKey(description);
  const amount = Number(row.amountNumber || 0);

  if (amount === 0) {
    return {
      category: "ZERO_AMOUNT",
      reason: "Zero amount row",
      accountId: null,
      includeInJournal: false
    };
  }

  if (isTaxRow(row)) {
    return {
      category: "TAX",
      reason: "Amazon tax or withheld tax, validated only",
      accountId: null,
      includeInJournal: CONFIG.recordTaxLines
    };
  }

  if (transactionKey.indexOf("refund") === 0) {
    return {
      category: "REFUNDS",
      reason: "Refund transaction type",
      accountId: CONFIG.accountIds.refunds,
      includeInJournal: true
    };
  }

  if (transactionKey === "order" && amountType === "itemprice") {
    return {
      category: "ACCOUNTS_RECEIVABLE",
      reason: "Order item price non-tax amount",
      accountId: CONFIG.accountIds.accountsReceivable,
      includeInJournal: true
    };
  }

  if (
    includesAny(description, [
      "inventory storage",
      "storage fee",
      "awd storage",
      "awd processing",
      "awd transportation",
      "inbound placement"
    ])
  ) {
    return {
      category: "AMAZON_STORAGE_FEE",
      reason: "Storage or AWD fee description",
      accountId: CONFIG.accountIds.amazonStorageFee,
      includeInJournal: true
    };
  }

  if (
    includesAny(description, [
      "fulfillment",
      "per unit fulfillment",
      "customer return",
      "removal order",
      "inbound transportation"
    ])
  ) {
    return {
      category: "AMAZON_FULFILLMENT_FEES",
      reason: "Fulfillment, return, removal, or inbound transportation fee",
      accountId: CONFIG.accountIds.amazonFulfillmentFees,
      includeInJournal: true
    };
  }

  if (
    amountType === "itemfees" ||
    transactionKey === "amazonfees" ||
    includesAny(descriptionKey, [
      "commission",
      "variableclosingfee",
      "closing fee",
      "chargeback",
      "deal",
      "participation"
    ])
  ) {
    return {
      category: "AMAZON_SELLING_FEES",
      reason: "Selling fee or Amazon fee",
      accountId: CONFIG.accountIds.amazonSellingFees,
      includeInJournal: true
    };
  }

  if (
    includesAny(description, [
      "inventory reimbursement",
      "reimbursement"
    ])
  ) {
    return {
      category: "AMAZON_SELLING_FEES",
      reason: "Amazon reimbursement treated as selling-fee offset",
      accountId: CONFIG.accountIds.amazonSellingFees,
      includeInJournal: true
    };
  }

  if (CONFIG.allowCatchAllBySign) {
    if (amount < 0) {
      return {
        category: "AMAZON_SELLING_FEES",
        reason: "Catch-all negative leftover",
        accountId: CONFIG.accountIds.amazonSellingFees,
        includeInJournal: true,
        catchAll: true
      };
    }

    return {
      category: "AMAZON_SELLING_FEES",
      reason: "Catch-all positive leftover treated as selling-fee offset",
      accountId: CONFIG.accountIds.amazonSellingFees,
      includeInJournal: true,
      catchAll: true
    };
  }

  return {
    category: "UNCATEGORIZED",
    reason: "No classification rule matched",
    accountId: null,
    includeInJournal: false,
    error: true
  };
}

function addAmount(bucket, amount) {
  bucket.netAmount = roundMoney(bucket.netAmount + amount);
  if (amount >= 0) {
    bucket.positiveAmount = roundMoney(bucket.positiveAmount + amount);
  } else {
    bucket.negativeAmount = roundMoney(bucket.negativeAmount + amount);
  }
}

function firstNonEmpty(rows, fieldId) {
  const row = rows.find(item => normalizeText(item[fieldId]) !== "");
  return row ? normalizeText(row[fieldId]) : "";
}

const rows = parseTsv(getResponseBody(httpResponse));
const headerRows = rows.filter(isHeaderRow);

if (headerRows.length !== 1) {
  throw new Error(`Expected exactly one settlement header row, found ${headerRows.length}`);
}

const header = headerRows[0];
const detailRows = rows.filter(row => !isHeaderRow(row));
const settlementId = normalizeText(header["settlement-id"]);

if (!settlementId) {
  throw new Error("Missing settlement-id on settlement header row");
}

const categories = {};
const uncategorizedRows = [];
const catchAllRows = [];
const zeroAmountRows = [];
const taxRows = [];
const validations = [];
const errors = [];

function getCategory(category, accountId) {
  if (!categories[category]) {
    categories[category] = {
      category,
      accountId,
      rowCount: 0,
      netAmount: 0,
      positiveAmount: 0,
      negativeAmount: 0,
      reasons: {}
    };
  }

  return categories[category];
}

for (const row of detailRows) {
  const amount = Number(row.amountNumber || 0);
  const classification = classifyRow(row);

  if (classification.category === "ZERO_AMOUNT") {
    zeroAmountRows.push(row.__lineNumber);
    continue;
  }

  if (classification.category === "TAX") {
    taxRows.push(row);
    if (!classification.includeInJournal) {
      continue;
    }
  }
  if (classification.catchAll) {
    catchAllRows.push({
      lineNumber: row.__lineNumber,
      transactionType: row["transaction-type"],
      amountType: row["amount-type"],
      amountDescription: row["amount-description"],
      amount,
      assignedCategory: classification.category,
      reason: classification.reason
    });
  }

  if (classification.error || !classification.accountId) {
    uncategorizedRows.push({
      lineNumber: row.__lineNumber,
      transactionType: row["transaction-type"],
      amountType: row["amount-type"],
      amountDescription: row["amount-description"],
      amount,
      reason: classification.reason
    });
    continue;
  }

  if (classification.includeInJournal) {
    const bucket = getCategory(classification.category, classification.accountId);
    bucket.rowCount += 1;
    bucket.reasons[classification.reason] = (bucket.reasons[classification.reason] || 0) + 1;
    addAmount(bucket, amount);
  }
}

const detailTotal = roundMoney(detailRows.reduce((sum, row) => sum + Number(row.amountNumber || 0), 0));
const headerTotal = roundMoney(Number(header["total-amount"] || 0));
const reportDifference = roundMoney(detailTotal - headerTotal);

if (Math.abs(reportDifference) > CONFIG.moneyTolerance) {
  errors.push(`Settlement detail total ${detailTotal} does not match header total ${headerTotal}; difference ${reportDifference}`);
}

const taxNet = roundMoney(taxRows.reduce((sum, row) => sum + Number(row.amountNumber || 0), 0));
const taxPositive = roundMoney(taxRows.filter(row => Number(row.amountNumber || 0) > 0).reduce((sum, row) => sum + Number(row.amountNumber || 0), 0));
const taxNegative = roundMoney(taxRows.filter(row => Number(row.amountNumber || 0) < 0).reduce((sum, row) => sum + Number(row.amountNumber || 0), 0));

if (CONFIG.failWhenTaxDoesNotNetToZero && Math.abs(taxNet) > CONFIG.moneyTolerance) {
  errors.push(`Amazon tax and withheld tax do not net to zero for settlement ${settlementId}; tax net ${taxNet}`);
}

if (uncategorizedRows.length > 0) {
  errors.push(`Settlement has ${uncategorizedRows.length} uncategorized rows`);
}

const settlement = {
  settlementId,
  reportId: currentReport.reportId || null,
  reportDocumentId: currentReport.reportDocumentId || reportDocument.reportDocumentId || null,
  reportDownloadUrl: reportDocument.url || null,
  externalId: `amazon_settlement_${settlementId}`,
  memo: `Amazon Settlement ${settlementId}`,
  settlementStartDate: normalizeText(header["settlement-start-date"]),
  settlementEndDate: normalizeText(header["settlement-end-date"]),
  depositDate: normalizeText(header["deposit-date"]),
  tranDate: normalizeText(header["settlement-end-date"]).split(" ")[0],
  currency: normalizeText(header.currency || "USD") || "USD",
  marketplaceName: firstNonEmpty(detailRows, "marketplace-name"),
  totalAmount: headerTotal,
  detailTotal,
  reportDifference,
  rowCount: rows.length,
  detailRowCount: detailRows.length,
  categories: Object.keys(categories).sort().map(category => categories[category]),
  cashSummary: {
    accountId: CONFIG.accountIds.cash,
    source: "settlement header total-amount",
    amount: Math.abs(headerTotal),
    debitAmount: headerTotal >= 0 ? Math.abs(headerTotal) : 0,
    creditAmount: headerTotal < 0 ? Math.abs(headerTotal) : 0,
    includedInCategories: false
  },
  taxSummary: {
    rowCount: taxRows.length,
    positiveAmount: taxPositive,
    negativeAmount: taxNegative,
    netAmount: taxNet,
    recordedInJournal: CONFIG.recordTaxLines
  },
  catchAllRows,
  uncategorizedRows,
  zeroAmountRows,
  validations,
  errors,
  canCreateJournalEntry: errors.length === 0
};

return [settlement];
