// Gravity map step: Build Amazon Financial Event Group search request.
// Expected input:
// - input.mapBuildRuntimeConfig[0] or input.mapF0FK[0]
// - input.mapParseSettlementReportTsv[0] or input.mapXTUO[0]
//
// This step prepares the date window for the Amazon Seller action that lists
// Financial Event Groups. The Amazon action itself does not need local code.

const runtimeConfig = (input.mapF0FK || input.mapBuildRuntimeConfig || [])[0] || {};
const settlement = (input.mapXTUO || input.mapParseSettlementReportTsv || [])[0] || {};

const conversionConfig =
  (runtimeConfig.behavior && runtimeConfig.behavior.currencyConversion) ||
  {};

const CONFIG = {
  sourceCurrencyCodes: conversionConfig.sourceCurrencyCodes || ["MXN"],
  targetCurrencyCode: conversionConfig.targetCurrencyCode || "USD",
  searchPaddingDays: conversionConfig.financialEventGroupSearchPaddingDays || 3
};

function normalizeText(value) {
  return String(value || "").trim();
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

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

if (!settlement.settlementId) {
  throw new Error("Missing parsed settlement payload while building Financial Event Group search request");
}

const settlementCurrency = normalizeText(settlement.currency || "USD").toUpperCase();
const requiresCurrencyConversion =
  settlementCurrency !== CONFIG.targetCurrencyCode &&
  CONFIG.sourceCurrencyCodes.map(code => String(code).toUpperCase()).indexOf(settlementCurrency) !== -1;

const settlementEndDate = parseAmazonDate(settlement.settlementEndDate || settlement.tranDate);

if (!settlementEndDate) {
  throw new Error(`Unable to parse settlement end date for settlement ${settlement.settlementId}: ${settlement.settlementEndDate}`);
}

const startDate = addDays(settlementEndDate, -CONFIG.searchPaddingDays).toISOString();
const endDate = addDays(settlementEndDate, CONFIG.searchPaddingDays).toISOString();

return [{
  settlementId: settlement.settlementId,
  reportId: settlement.reportId,
  reportDocumentId: settlement.reportDocumentId,
  settlementCurrency,
  targetCurrencyCode: CONFIG.targetCurrencyCode,
  requiresCurrencyConversion,
  settlementEndDate: settlement.settlementEndDate,
  settlementEndDateIso: settlementEndDate.toISOString(),
  startDate,
  endDate,
  financialEventGroupStartDate: startDate,
  financialEventGroupEndDate: endDate
}];
