// Gravity map step: Build Runtime Config.
// Keep workflow constants in one place so sandbox/prod values and account IDs
// are changed once and reused by later map and NetSuite custom-code steps.

const workflowArguments = input.workflowArguments || {};

const config = {
  workflowName: "Amazon Settlement Reports to NetSuite Journal Entries",
  reportType: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2",
  cutoffDate: workflowArguments.amazonSettlementCutoffDate || "2026-07-01T00:00:00.000Z",
  errorRecipients: [
    "bruno@mindcloud.co",
    "AMiller@lionel.com",
    "jjones@lionel.com"
  ],
  netsuite: {
    subsidiaryId: "4",
    divisionFieldId: "csegdivision",
    divisionId: "4",
    locationId: "32",
    classId: "38",
    departmentId: "34",
    currencyByCode: {
      USD: "1"
    },
    accountIds: {
      accountsReceivable: "123",
      cash: "1113",
      amazonSellingFees: "336",
      amazonFulfillmentFees: "434",
      amazonStorageFee: "523",
      refunds: "260",
      tax: workflowArguments.amazonSettlementTaxAccountId || "TODO_TAX_ACCOUNT_ID"
    },
    // Leave null until Lionel confirms an Amazon clearing/balancing account.
    balancingAccountId: workflowArguments.amazonSettlementBalancingAccountId || null,
    // Sandbox File Cabinet folder. Replace via workflow argument or update here before production.
    fileCabinetFolderId: Number(workflowArguments.amazonSettlementFileCabinetFolderId || 701790)
  },
  behavior: {
    allowCatchAllBySign: true,
    recordTaxLines: true,
    failWhenTaxDoesNotNetToZero: true,
    moneyTolerance: 0.01,
    saveSuccessfulSettlementsInMemory: false,
    saveFailedSettlementsInMemory: true
  },
  memory: {
    failureKeyPrefix: "amazon_settlement_failure_"
  }
};

return [config];
