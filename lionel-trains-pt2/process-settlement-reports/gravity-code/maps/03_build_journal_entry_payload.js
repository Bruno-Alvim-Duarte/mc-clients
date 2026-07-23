// Gravity map step: Build NetSuite Journal Entry payload from parsed settlement.
// Expected input:
// - input.mapBuildRuntimeConfig[0] from "Build Runtime Config"
// - input.mapParseSettlementReportTsv[0]
//
// Replace mapBuildRuntimeConfig and mapParseSettlementReportTsv with actual Gravity step keys.

const runtimeConfig = (input.mapBuildRuntimeConfig || [])[0] || {};
const settlement = (input.mapParseSettlementReportTsv || [])[0] || {};

const CONFIG = {
  subsidiaryId: "4",
  divisionId: "4",
  locationId: "32",
  classId: "38",
  departmentId: "34",
  currencyByCode: {
    USD: "1"
  },
  // Optional. Leave null until Lionel confirms an Amazon clearing account.
  balancingAccountId: null,
  moneyTolerance: 0.01
};

if (runtimeConfig.netsuite) {
  CONFIG.subsidiaryId = runtimeConfig.netsuite.subsidiaryId || CONFIG.subsidiaryId;
  CONFIG.divisionId = runtimeConfig.netsuite.divisionId || CONFIG.divisionId;
  CONFIG.locationId = runtimeConfig.netsuite.locationId || CONFIG.locationId;
  CONFIG.classId = runtimeConfig.netsuite.classId || CONFIG.classId;
  CONFIG.departmentId = runtimeConfig.netsuite.departmentId || CONFIG.departmentId;
  CONFIG.currencyByCode = runtimeConfig.netsuite.currencyByCode || CONFIG.currencyByCode;
  CONFIG.balancingAccountId = runtimeConfig.netsuite.balancingAccountId || CONFIG.balancingAccountId;
}

if (runtimeConfig.behavior) {
  CONFIG.moneyTolerance = runtimeConfig.behavior.moneyTolerance || CONFIG.moneyTolerance;
}

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

function addCategoryLines(lines, category, commonLineFields) {
  const memoBase = `${settlement.memo} - ${category.category}`;

  pushLine(
    lines,
    toSettlementJournalLine(
      category.accountId,
      category.positiveAmount,
      `${memoBase} positive`,
      commonLineFields
    )
  );

  pushLine(
    lines,
    toSettlementJournalLine(
      category.accountId,
      category.negativeAmount,
      `${memoBase} negative`,
      commonLineFields
    )
  );
}

function totalDebits(lines) {
  return roundMoney(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
}

function totalCredits(lines) {
  return roundMoney(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
}

if (!settlement.settlementId) {
  throw new Error("Missing parsed settlement payload");
}

if (!settlement.canCreateJournalEntry) {
  throw new Error(`Settlement ${settlement.settlementId} is not createable: ${(settlement.errors || []).join("; ")}`);
}

const currencyId = CONFIG.currencyByCode[settlement.currency];

if (!currencyId) {
  throw new Error(`Unsupported NetSuite currency for settlement ${settlement.settlementId}: ${settlement.currency}`);
}

const commonLineFields = {
  department: { id: CONFIG.departmentId },
  class: { id: CONFIG.classId },
  location: { id: CONFIG.locationId },
  division: { id: CONFIG.divisionId }
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

if (Math.abs(balanceDifference) > CONFIG.moneyTolerance) {
  if (!CONFIG.balancingAccountId) {
    throw new Error(
      `Unbalanced Journal Entry for settlement ${settlement.settlementId}: debits ${totalDebitsAmount}, credits ${totalCreditsAmount}, difference ${balanceDifference}. Add confirmed CONFIG.balancingAccountId or fix mapping.`
    );
  }

  const balancingLine = balanceDifference > 0
    ? {
        account: { id: String(CONFIG.balancingAccountId) },
        credit: Math.abs(balanceDifference),
        memo: `${settlement.memo} - Balancing line`,
        ...commonLineFields
      }
    : {
        account: { id: String(CONFIG.balancingAccountId) },
        debit: Math.abs(balanceDifference),
        memo: `${settlement.memo} - Balancing line`,
        ...commonLineFields
      };

  lines.push(balancingLine);
  totalDebitsAmount = totalDebits(lines);
  totalCreditsAmount = totalCredits(lines);
  balanceDifference = roundMoney(totalDebitsAmount - totalCreditsAmount);
}

if (Math.abs(balanceDifference) > CONFIG.moneyTolerance) {
  throw new Error(
    `Journal Entry remains unbalanced for settlement ${settlement.settlementId}: debits ${totalDebitsAmount}, credits ${totalCreditsAmount}, difference ${balanceDifference}`
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
  catchAllRows: settlement.catchAllRows || [],
  taxSummary: settlement.taxSummary,
  payload
}];
