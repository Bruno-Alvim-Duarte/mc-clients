// Gravity map step: Build Runtime Config.
// Keep workflow constants in one place so sandbox/prod values and account IDs
// are changed once and reused by later map and NetSuite custom-code steps.

const workflowArguments = input.workflowArguments || {};

function normalizeText(value) {
  return String(value || "").trim();
}

function toCamelCase(value) {
  const words = normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

const rawFailureStoreName =
  workflowArguments.amazonSettlementFailureStoreName ||
  workflowArguments.amazonSettlementKvStoreName ||
  workflowArguments.failureStoreName ||
  workflowArguments.kvStoreName ||
  workflowArguments.storeName ||
  workflowArguments.environmentStoreName ||
  workflowArguments.environmentName ||
  workflowArguments.environment ||
  input.amazonSettlementFailureStoreName ||
  input.kvStoreName ||
  input.storeName ||
  input.environmentStoreName ||
  input.environmentName ||
  input.environment ||
  input.memory?.environment?.amazonSettlementFailureStoreName ||
  input.memory?.environment?.kvStoreName ||
  input.memory?.environment?.storeName ||
  input.memory?.environment?.name ||
  input.memory?.environment?.id;
const failureStoreName = toCamelCase(rawFailureStoreName);

if (!failureStoreName) {
  throw new Error(
    "Missing environment-specific KV store name for Amazon settlement failures. " +
    "Pass workflowArguments.amazonSettlementFailureStoreName, amazonSettlementKvStoreName, storeName, or environmentName."
  );
}

const failureListBaseKey = "amazon_settlement_failures";
const failureListKey = `${failureStoreName}_${failureListBaseKey}`;

const config = {
  workflowName: "Amazon Settlement Reports to NetSuite Journal Entries",
  reportType: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2",
  cutoffDate: workflowArguments.amazonSettlementCutoffDate || "2026-01-01T00:00:00.000Z",
  errorRecipients: [
    "bruno@mindcloud.co",
    "AMiller@lionel.com",
    "jjones@lionel.com",
    workflowArguments.storePersonEmail
  ].join(", "),
  netsuite: {
    subsidiaryId: "3",
    divisionFieldId: "csegdivision",
    divisionId: workflowArguments.divisionID,
    locationId: workflowArguments.locationID,
    classId: workflowArguments.classID,
    departmentId: "34",
    currencyByCode: {
      "USD": "1"
    },
    accountIds: {
      accountsReceivable: "123",
      cash: "1113", // DIFFERENT IN PRODUCTION ⚠️⚠️
      amazonSellingFees: "336",
      amazonFulfillmentFees: "434",
      amazonStorageFee: "523",
      refunds: "260",
      settlementVarianceFees: "336",
    },
    taxVarianceDepartmentId: "34",
    // Sandbox File Cabinet folder. Replace via workflow argument or update here before production.
    fileCabinetFolderId: 701790
  },
  behavior: {
    allowCatchAllBySign: true,
    recordTaxLines: false,
    routeTaxVarianceToFeeAccount: true,
    failWhenTaxDoesNotNetToZero: false,
    moneyTolerance: 0.01,
    journalEntryRoundingTolerance: 0.05,
    saveSuccessfulSettlementsInMemory: false,
    saveFailedSettlementsInMemory: true
  },
  memory: {
    failureKeyPrefix: "amazon_settlement_failure_",
    failureStoreName,
    failureListBaseKey,
    failureListKey
  },
  checkpoint: input.memory?.environment?.checkpoint
};

return [config];
