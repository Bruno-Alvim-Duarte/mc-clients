// Gravity map step: Build NetSuite Journal Entry payload from parsed settlement.
// Expected input:
// - input.mapBuildRuntimeConfig[0] from "Build Runtime Config"
// - input.mapApplySettlementCurrencyConversion[0]
//
// Replace mapBuildRuntimeConfig and mapApplySettlementCurrencyConversion with actual Gravity step keys.

const runtimeConfig = (input.mapF0FK || [])[0] || {};

const CONFIG = {
  subsidiaryId: "4",
  divisionId: "4",
  locationId: "32",
  classId: "38",
  departmentId: "34",
  currencyByCode: {
    USD: "1"
  },
  moneyTolerance: 0.01,
  journalEntryRoundingTolerance: 0.05
};

if (runtimeConfig.netsuite) {
  CONFIG.subsidiaryId = runtimeConfig.netsuite.subsidiaryId || CONFIG.subsidiaryId;
  CONFIG.divisionId = runtimeConfig.netsuite.divisionId || CONFIG.divisionId;
  CONFIG.locationId = runtimeConfig.netsuite.locationId || CONFIG.locationId;
  CONFIG.classId = runtimeConfig.netsuite.classId || CONFIG.classId;
  CONFIG.departmentId = runtimeConfig.netsuite.departmentId || CONFIG.departmentId;
  CONFIG.currencyByCode = runtimeConfig.netsuite.currencyByCode || CONFIG.currencyByCode;
}

if (runtimeConfig.behavior) {
  CONFIG.moneyTolerance = runtimeConfig.behavior.moneyTolerance || CONFIG.moneyTolerance;
  CONFIG.journalEntryRoundingTolerance =
    runtimeConfig.behavior.journalEntryRoundingTolerance ||
    runtimeConfig.behavior.journalEntryBalanceTolerance ||
    CONFIG.journalEntryRoundingTolerance;
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

function firstFromStep(stepValue) {
  return Array.isArray(stepValue) ? stepValue[0] : stepValue;
}

function isSettlementLike(value) {
  return value &&
    typeof value === "object" &&
    value.settlementId &&
    value.externalId &&
    value.totalAmount !== undefined &&
    Array.isArray(value.categories);
}

function collectSettlementCandidates(inputValue) {
  const candidates = [];

  Object.keys(inputValue || {}).forEach(key => {
    const value = inputValue[key];

    if (Array.isArray(value)) {
      value.forEach(item => {
        if (isSettlementLike(item)) {
          candidates.push({ key, value: item });
        }
      });
      return;
    }

    if (isSettlementLike(value)) {
      candidates.push({ key, value });
    }
  });

  return candidates;
}

function pickSettlementPayload() {
  const targetCurrencyCode = normalizeCurrency(
    runtimeConfig.netsuite &&
    runtimeConfig.netsuite.journalEntryCurrencyCode ||
    "USD"
  );

  const namedCandidates = [
    { key: "mapApplySettlementCurrencyConversion", value: firstFromStep(input.mapL1JR) },
    { key: "mapCurrencyConversion", value: firstFromStep(input.mapCurrencyConversion) },
    { key: "mapXTUO", value: firstFromStep(input.mapXTUO) }
  ].filter(candidate => isSettlementLike(candidate.value));

  const allCandidates = [
    ...namedCandidates,
    ...collectSettlementCandidates(input).filter(candidate =>
      !namedCandidates.some(named => named.key === candidate.key)
    )
  ];

  const convertedCandidate = allCandidates.find(candidate =>
    normalizeCurrency(candidate.value.currency) === targetCurrencyCode &&
    (
      candidate.value.currencyConversion ||
      candidate.key !== "mapXTUO"
    )
  );

  if (convertedCandidate) return convertedCandidate.value;

  const supportedCandidate = allCandidates.find(candidate =>
    CONFIG.currencyByCode[normalizeCurrency(candidate.value.currency)]
  );

  if (supportedCandidate) return supportedCandidate.value;

  const parsedCandidate = namedCandidates.find(candidate => candidate.key === "mapXTUO");

  if (parsedCandidate) {
    throw new Error(
      `Missing converted settlement payload for settlement ${parsedCandidate.value.settlementId}. ` +
      `Parsed settlement currency is ${parsedCandidate.value.currency}; Build Journal Entry Payload must receive the output from Apply Settlement Currency Conversion.`
    );
  }

  return {};
}

const settlement = pickSettlementPayload();

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function toSettlementJournalLine(accountId, signedAmount, memo, extra) {
  const amount = roundMoney(Math.abs(Number(signedAmount || 0)));
  if (amount === 0) return null;

  // Settlement detail rows follow the requirements buddy rule:
  // positive row amount = credit, negative row amount = debit.
  if (signedAmount >= 0) {
    return {
      account: { id: String(accountId) },
      credit: amount,
      memo,
      ...(extra || {})
    };
  }

  return {
    account: { id: String(accountId) },
    debit: amount,
    memo,
    ...(extra || {})
  };
}

function toCashHeaderLine(accountId, signedAmount, memo, extra) {
  const amount = roundMoney(Math.abs(Number(signedAmount || 0)));
  if (amount === 0) return null;

  // Header total is the bank deposit. Positive deposit debits cash; negative deposit credits cash.
  if (signedAmount >= 0) {
    return {
      account: { id: String(accountId) },
      debit: amount,
      memo,
      ...(extra || {})
    };
  }

  return {
    account: { id: String(accountId) },
    credit: amount,
    memo,
    ...(extra || {})
  };
}

function pushLine(lines, line) {
  if (line) lines.push(line);
}

function lineFieldsForCategory(category, commonLineFields) {
  return {
    ...commonLineFields,
    ...(category.departmentId ? { department: { id: String(category.departmentId) } } : {}),
    ...(category.classId ? { class: { id: String(category.classId) } } : {}),
    ...(category.locationId ? { location: { id: String(category.locationId) } } : {}),
    ...(category.divisionId ? { division: { id: String(category.divisionId) } } : {})
  };
}

function addCategoryLines(lines, category, commonLineFields) {
  const memoBase = `${settlement.memo} - ${category.category}`;
  const categoryLineFields = lineFieldsForCategory(category, commonLineFields);

  pushLine(
    lines,
    toSettlementJournalLine(
      category.accountId,
      category.positiveAmount,
      `${memoBase} positive`,
      categoryLineFields
    )
  );

  pushLine(
    lines,
    toSettlementJournalLine(
      category.accountId,
      category.negativeAmount,
      `${memoBase} negative`,
      categoryLineFields
    )
  );
}

function totalDebits(lines) {
  return roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
}

function totalCredits(lines) {
  return roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
}

function isCashLine(line) {
  return String(line.memo || "").indexOf(" - Cash deposit") !== -1;
}

function pickAdjustmentLine(lines, amountField, avoidCash) {
  const candidates = lines
    .map((line, index) => ({ line, index, amount: Number(line[amountField] || 0) }))
    .filter(candidate => candidate.amount > 0)
    .filter(candidate => !avoidCash || !isCashLine(candidate.line))
    .sort((a, b) => b.amount - a.amount);

  return candidates.length > 0 ? candidates[0] : null;
}

function applyJournalEntryRoundingAdjustment(lines, balanceDifference) {
  const adjustment = roundMoney(Math.abs(balanceDifference));

  if (adjustment === 0) {
    return {
      applied: false,
      amount: 0,
      lineIndex: null,
      field: null,
      direction: null
    };
  }

  const creditSideIsShort = balanceDifference > 0;
  const field = creditSideIsShort ? "credit" : "debit";
  const preferredLine = pickAdjustmentLine(lines, field, true) || pickAdjustmentLine(lines, field, false);

  if (!preferredLine) {
    throw new Error(
      `Unable to apply Journal Entry rounding adjustment for settlement ${settlement.settlementId}: no ${field} line exists`
    );
  }

  preferredLine.line[field] = roundMoney(Number(preferredLine.line[field] || 0) + adjustment);
  preferredLine.line.memo = `${preferredLine.line.memo || settlement.memo} - rounding adjustment ${field} +${adjustment.toFixed(2)}`;

  return {
    applied: true,
    amount: adjustment,
    lineIndex: preferredLine.index,
    field,
    direction: creditSideIsShort ? "increase_credit" : "increase_debit",
    accountId: preferredLine.line.account && preferredLine.line.account.id || null,
    originalDifference: balanceDifference
  };
}

function getCurrencyId(currencyCode) {
  const normalizedCurrencyCode = normalizeCurrency(currencyCode);
  const matchingCode = Object.keys(CONFIG.currencyByCode || {}).find(code =>
    normalizeCurrency(code) === normalizedCurrencyCode
  );

  return matchingCode ? CONFIG.currencyByCode[matchingCode] : null;
}

if (!settlement.settlementId) {
  throw new Error("Missing parsed settlement payload");
}

if (!settlement.canCreateJournalEntry) {
  throw new Error(`Settlement ${settlement.settlementId} is not createable: ${(settlement.errors || []).join("; ")}`);
}

const currencyId = getCurrencyId(settlement.currency);

if (!currencyId) {
  throw new Error(`Unsupported NetSuite currency for settlement ${settlement.settlementId}: ${settlement.currency}`);
}

const commonLineFields = {
  department: { id: CONFIG.departmentId },
  class: { id: CONFIG.classId },
  location: { id: CONFIG.locationId },
  division: { id: CONFIG.divisionId },
  ...(runtimeConfig.netsuite && runtimeConfig.netsuite.journalEntryLineEntityId
    ? { entity: { id: String(runtimeConfig.netsuite.journalEntryLineEntityId) } }
    : {})
};

const lines = [];
const cashAccount = (
  runtimeConfig.netsuite &&
  runtimeConfig.netsuite.accountIds &&
  runtimeConfig.netsuite.accountIds.cash
) || "1113";

pushLine(
  lines,
  toCashHeaderLine(
    cashAccount,
    settlement.totalAmount,
    `${settlement.memo} - Cash deposit`,
    commonLineFields
  )
);

for (const category of settlement.categories || []) {
  addCategoryLines(lines, category, commonLineFields);
}

let totalDebitsAmount = totalDebits(lines);
let totalCreditsAmount = totalCredits(lines);
let balanceDifference = roundMoney(totalDebitsAmount - totalCreditsAmount);
let journalEntryRoundingAdjustment = {
  applied: false,
  amount: 0,
  lineIndex: null,
  field: null,
  direction: null
};

if (Math.abs(balanceDifference) > CONFIG.journalEntryRoundingTolerance) {
  throw new Error(
    `Journal Entry remains unbalanced for settlement ${settlement.settlementId}: debits ${totalDebitsAmount}, credits ${totalCreditsAmount}, difference ${balanceDifference}`
  );
}

if (balanceDifference !== 0) {
  journalEntryRoundingAdjustment = applyJournalEntryRoundingAdjustment(lines, balanceDifference);
  totalDebitsAmount = totalDebits(lines);
  totalCreditsAmount = totalCredits(lines);
  balanceDifference = roundMoney(totalDebitsAmount - totalCreditsAmount);
}

if (balanceDifference !== 0) {
  throw new Error(
    `Journal Entry remains unbalanced after rounding adjustment for settlement ${settlement.settlementId}: debits ${totalDebitsAmount}, credits ${totalCreditsAmount}, difference ${balanceDifference}`
  );
}

const payload = {
  externalId: settlement.externalId,
  subsidiary: { id: CONFIG.subsidiaryId },
  currency: { id: currencyId },
  tranDate: settlement.tranDate,
  memo: settlement.memo,
  department: { id: CONFIG.departmentId },
  class: { id: CONFIG.classId },
  location: { id: CONFIG.locationId },
  division: { id: CONFIG.divisionId },
  line: lines
};

return [{
  settlementId: settlement.settlementId,
  reportId: settlement.reportId,
  reportDocumentId: settlement.reportDocumentId,
  reportDownloadUrl: settlement.reportDownloadUrl,
  externalId: settlement.externalId,
  memo: settlement.memo,
  settlementStartDate: settlement.settlementStartDate,
  settlementEndDate: settlement.settlementEndDate,
  depositDate: settlement.depositDate,
  tranDate: settlement.tranDate,
  currency: settlement.currency,
  totalAmount: settlement.totalAmount,
  detailTotal: settlement.detailTotal,
  totalDebits: totalDebitsAmount,
  totalCredits: totalCreditsAmount,
  lineCount: lines.length,
  categoryCount: (settlement.categories || []).length,
  cashSummary: settlement.cashSummary,
  currencyConversion: settlement.currencyConversion || null,
  sourceCurrency: settlement.sourceCurrency || settlement.currency,
  originalCurrency: settlement.originalCurrency || settlement.currency,
  originalTotalAmount: settlement.originalTotalAmount,
  journalEntryRoundingAdjustment,
  amazonOrderIds: settlement.amazonOrderIds || [],
  fbaInvoiceSettlementAmounts: settlement.fbaInvoiceSettlementAmounts || [],
  catchAllRows: settlement.catchAllRows || [],
  taxSummary: settlement.taxSummary,
  payload
}];
