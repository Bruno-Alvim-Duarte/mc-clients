// Gravity map step: Apply Amazon Financial Event Group currency conversion.
// Expected input:
// - input.mapBuildRuntimeConfig[0] or input.mapF0FK[0]
// - input.mapParseSettlementReportTsv[0] or input.mapXTUO[0]
// - input.mapBuildFinancialEventGroupSearchRequest[0]
// - Amazon Seller "List Financial Event Groups" output
//
// Replace listFinancialEventGroups with the actual Gravity step key after Cloudy creates it.

const runtimeConfig = (input.mapF0FK || input.mapBuildRuntimeConfig || [])[0] || {};
const settlement = (input.mapXTUO || input.mapParseSettlementReportTsv || [])[0] || {};
const searchRequest =
  (input.map1PG6 || [])[0] ||
  (input.mapBuildFinancialEventGroupSearchRequest || [])[0] ||
  (input.mapFinancialEventGroupSearchRequest || [])[0] ||
  {};
const listFinancialEventGroupsResult =
  input.amazonSellerListFinancialEventGroupsO2XZ?.[0] ||
  input.amazonListFinancialEventGroups ||
  input.amazonSellerListFinancialEventGroups ||
  input.amazonSellerFinancialEventGroups ||
  {};

const conversionConfig =
  (runtimeConfig.behavior && runtimeConfig.behavior.currencyConversion) ||
  {};

const CONFIG = {
  sourceCurrencyCodes: conversionConfig.sourceCurrencyCodes || ["MXN"],
  targetCurrencyCode: conversionConfig.targetCurrencyCode ||
    runtimeConfig.netsuite &&
    runtimeConfig.netsuite.journalEntryCurrencyCode ||
    "USD",
  dateMatchToleranceSeconds: conversionConfig.financialEventGroupDateMatchToleranceSeconds || 60,
  amountTolerance: conversionConfig.financialEventGroupAmountTolerance || 0.01,
  roundingAdjustmentTolerance: conversionConfig.roundingAdjustmentTolerance || 0.05
};

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCurrency(value) {
  return normalizeText(value).toUpperCase();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return value;
  }
}

function extractFinancialEventGroups(result) {
  const candidates = [
    result,
    result.financialEventGroups,
    result.financialEventGroupList,
    result.payload,
    result.data,
    result.body,
    result.result
  ];

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed)) {
      if (parsed.length === 1 && parsed[0] && !parsed[0].financialEventGroupId && !parsed[0].fundTransferDate) {
        const nested = extractFinancialEventGroups(parsed[0]);
        if (nested.length > 0) return nested;
      }
      return parsed;
    }
    if (parsed && Array.isArray(parsed.financialEventGroups)) return parsed.financialEventGroups;
    if (parsed && Array.isArray(parsed.financialEventGroupList)) return parsed.financialEventGroupList;
    if (parsed && Array.isArray(parsed.items)) return parsed.items;
  }

  return [];
}

function parseAmazonDate(value) {
  const text = normalizeText(value);
  if (!text) return null;

  const dayFirstMatch = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2})(?:\s+UTC)?)?$/);
  if (dayFirstMatch) {
    const day = Number(dayFirstMatch[1]);
    const month = Number(dayFirstMatch[2]);
    const year = Number(dayFirstMatch[3]);
    const hour = Number(dayFirstMatch[4] || 0);
    const minute = Number(dayFirstMatch[5] || 0);
    const second = Number(dayFirstMatch[6] || 0);
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const yearFirstMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{1,2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|\s+UTC)?)?$/);
  if (yearFirstMatch) {
    const year = Number(yearFirstMatch[1]);
    const month = Number(yearFirstMatch[2]);
    const day = Number(yearFirstMatch[3]);
    const hour = Number(yearFirstMatch[4] || 0);
    const minute = Number(yearFirstMatch[5] || 0);
    const second = Number(yearFirstMatch[6] || 0);
    const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const normalized = text
    .replace(" UTC", "Z")
    .replace(" ", "T");
  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(text);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function dateDistanceSeconds(a, b) {
  return Math.abs(a.getTime() - b.getTime()) / 1000;
}

function moneyAmount(value) {
  if (!value) return 0;
  return Number(value.currencyAmount || value.amount || 0);
}

function moneyCurrency(value) {
  if (!value) return "";
  return normalizeCurrency(value.currencyCode || value.currency || "");
}

function convertAmount(amount, exchangeRate) {
  return roundMoney(Number(amount || 0) * exchangeRate);
}

function cloneCategory(category, exchangeRate) {
  return {
    ...category,
    originalNetAmount: category.netAmount,
    originalPositiveAmount: category.positiveAmount,
    originalNegativeAmount: category.negativeAmount,
    netAmount: convertAmount(category.netAmount, exchangeRate),
    positiveAmount: convertAmount(category.positiveAmount, exchangeRate),
    negativeAmount: convertAmount(category.negativeAmount, exchangeRate)
  };
}

function categoryNetTotal(categories) {
  return roundMoney(categories.reduce((sum, category) => sum + Number(category.netAmount || 0), 0));
}

function applyRoundingAdjustment(categories, targetNetAmount) {
  const currentNetAmount = categoryNetTotal(categories);
  const adjustment = roundMoney(Number(targetNetAmount || 0) - currentNetAmount);

  if (adjustment === 0) {
    return {
      categories,
      roundingAdjustment: 0,
      adjustedCategory: null
    };
  }

  if (Math.abs(adjustment) > CONFIG.roundingAdjustmentTolerance) {
    throw new Error(
      `Converted category total ${currentNetAmount} differs from Amazon converted total ${targetNetAmount} by ${adjustment}`
    );
  }

  const adjustedCategories = categories.map(category => ({ ...category }));
  const adjustmentIndex = adjustedCategories
    .map((category, index) => ({
      index,
      amount: Math.max(Math.abs(Number(category.positiveAmount || 0)), Math.abs(Number(category.negativeAmount || 0)))
    }))
    .sort((a, b) => b.amount - a.amount)[0];

  if (!adjustmentIndex) {
    throw new Error("Unable to apply currency rounding adjustment because no journal categories exist");
  }

  const category = adjustedCategories[adjustmentIndex.index];

  if (adjustment > 0) {
    if (Number(category.positiveAmount || 0) > 0 || Number(category.negativeAmount || 0) === 0) {
      category.positiveAmount = roundMoney(Number(category.positiveAmount || 0) + adjustment);
    } else {
      category.negativeAmount = roundMoney(Number(category.negativeAmount || 0) + adjustment);
    }
  } else if (Math.abs(adjustment) <= Number(category.positiveAmount || 0)) {
    category.positiveAmount = roundMoney(Number(category.positiveAmount || 0) + adjustment);
  } else {
    category.negativeAmount = roundMoney(Number(category.negativeAmount || 0) + adjustment);
  }

  category.netAmount = roundMoney(Number(category.positiveAmount || 0) + Number(category.negativeAmount || 0));
  category.currencyRoundingAdjustment = roundMoney(Number(category.currencyRoundingAdjustment || 0) + adjustment);
  category.reasons = {
    ...(category.reasons || {}),
    "Amazon currency conversion rounding adjustment": ((category.reasons || {})["Amazon currency conversion rounding adjustment"] || 0) + 1
  };

  return {
    categories: adjustedCategories,
    roundingAdjustment: adjustment,
    adjustedCategory: category.category
  };
}

function findMatchingFinancialEventGroup(groups, settlementEndDate, sourceCurrency, sourceAmount) {
  const dateMatches = groups.filter(group => {
    const fundTransferDate = parseAmazonDate(group.fundTransferDate);
    return fundTransferDate &&
      dateDistanceSeconds(fundTransferDate, settlementEndDate) <= CONFIG.dateMatchToleranceSeconds;
  });

  if (dateMatches.length === 0) return null;
  if (dateMatches.length === 1) return dateMatches[0];

  const amountMatches = dateMatches.filter(group =>
    moneyCurrency(group.originalTotal) === sourceCurrency &&
    Math.abs(roundMoney(moneyAmount(group.originalTotal) - sourceAmount)) <= CONFIG.amountTolerance
  );

  if (amountMatches.length === 1) return amountMatches[0];

  throw new Error(
    `Found ${dateMatches.length} Financial Event Groups with fundTransferDate matching settlement end date for settlement ${settlement.settlementId}; amount/currency matches: ${amountMatches.length}`
  );
}

if (!settlement.settlementId) {
  throw new Error("Missing parsed settlement payload while applying currency conversion");
}

const sourceCurrency = normalizeCurrency(settlement.currency || "USD");
const targetCurrency = normalizeCurrency(CONFIG.targetCurrencyCode || "USD");
const requiresCurrencyConversion =
  sourceCurrency !== targetCurrency &&
  CONFIG.sourceCurrencyCodes.map(code => normalizeCurrency(code)).indexOf(sourceCurrency) !== -1;

if (!requiresCurrencyConversion) {
  return [{
    ...settlement,
    currencyConversion: {
      required: false,
      sourceCurrency,
      targetCurrency,
      reason: sourceCurrency === targetCurrency
        ? "Settlement is already in target currency"
        : "Settlement currency is not configured for Amazon conversion"
    }
  }];
}

const settlementEndDate = parseAmazonDate(searchRequest.settlementEndDateIso || settlement.settlementEndDate);

if (!settlementEndDate) {
  throw new Error(`Unable to parse settlement end date for currency conversion: ${settlement.settlementEndDate}`);
}

const financialEventGroups = extractFinancialEventGroups(listFinancialEventGroupsResult);
const matchedGroup = findMatchingFinancialEventGroup(
  financialEventGroups,
  settlementEndDate,
  sourceCurrency,
  roundMoney(settlement.totalAmount)
);

if (!matchedGroup) {
  throw new Error(
    `No Financial Event Group found with fundTransferDate matching settlement end date ${settlementEndDate.toISOString()} for settlement ${settlement.settlementId}`
  );
}

const originalCurrency = moneyCurrency(matchedGroup.originalTotal);
const convertedCurrency = moneyCurrency(matchedGroup.convertedTotal);
const originalAmount = roundMoney(moneyAmount(matchedGroup.originalTotal));
const convertedAmount = roundMoney(moneyAmount(matchedGroup.convertedTotal));

if (originalCurrency !== sourceCurrency) {
  throw new Error(`Financial Event Group original currency ${originalCurrency} does not match settlement currency ${sourceCurrency}`);
}

if (convertedCurrency !== targetCurrency) {
  throw new Error(`Financial Event Group converted currency ${convertedCurrency} does not match target currency ${targetCurrency}`);
}

if (Math.abs(roundMoney(originalAmount - roundMoney(settlement.totalAmount))) > CONFIG.amountTolerance) {
  throw new Error(
    `Financial Event Group original total ${originalAmount} ${originalCurrency} does not match settlement total ${settlement.totalAmount} ${sourceCurrency}`
  );
}

if (originalAmount === 0) {
  throw new Error(`Financial Event Group original total is zero for settlement ${settlement.settlementId}`);
}

const exchangeRate = convertedAmount / originalAmount;
const convertedCategories = (settlement.categories || []).map(category => cloneCategory(category, exchangeRate));
const convertedFbaInvoiceSettlementAmounts = (settlement.fbaInvoiceSettlementAmounts || []).map(item => ({
  ...item,
  originalArAmount: item.arAmount,
  arAmount: convertAmount(item.arAmount, exchangeRate)
}));
const adjusted = applyRoundingAdjustment(convertedCategories, convertedAmount);
const convertedDetailTotal = convertAmount(settlement.detailTotal, exchangeRate);
const convertedTaxSummary = settlement.taxSummary
  ? {
      ...settlement.taxSummary,
      originalPositiveAmount: settlement.taxSummary.positiveAmount,
      originalNegativeAmount: settlement.taxSummary.negativeAmount,
      originalNetAmount: settlement.taxSummary.netAmount,
      positiveAmount: convertAmount(settlement.taxSummary.positiveAmount, exchangeRate),
      negativeAmount: convertAmount(settlement.taxSummary.negativeAmount, exchangeRate),
      netAmount: convertAmount(settlement.taxSummary.netAmount, exchangeRate)
    }
  : settlement.taxSummary;

return [{
  ...settlement,
  sourceCurrency,
  originalCurrency: sourceCurrency,
  originalTotalAmount: settlement.totalAmount,
  originalDetailTotal: settlement.detailTotal,
  currency: targetCurrency,
  totalAmount: convertedAmount,
  detailTotal: convertedDetailTotal,
  reportDifference: roundMoney(convertedDetailTotal - convertedAmount),
  categories: adjusted.categories,
  fbaInvoiceSettlementAmounts: convertedFbaInvoiceSettlementAmounts,
  cashSummary: {
    ...(settlement.cashSummary || {}),
    source: "Amazon Financial Event Group convertedTotal",
    originalAmount: settlement.totalAmount,
    originalCurrency: sourceCurrency,
    amount: Math.abs(convertedAmount),
    debitAmount: convertedAmount >= 0 ? Math.abs(convertedAmount) : 0,
    creditAmount: convertedAmount < 0 ? Math.abs(convertedAmount) : 0
  },
  taxSummary: convertedTaxSummary,
  currencyConversion: {
    required: true,
    sourceCurrency,
    targetCurrency,
    exchangeRate,
    exchangeRateFormula: "convertedTotal.currencyAmount / originalTotal.currencyAmount",
    originalTotal: matchedGroup.originalTotal,
    convertedTotal: matchedGroup.convertedTotal,
    financialEventGroupId: matchedGroup.financialEventGroupId || null,
    fundTransferDate: matchedGroup.fundTransferDate || null,
    settlementEndDateIso: settlementEndDate.toISOString(),
    roundingAdjustment: adjusted.roundingAdjustment,
    roundingAdjustedCategory: adjusted.adjustedCategory
  }
}];
