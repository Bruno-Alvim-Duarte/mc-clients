// Gravity map step: Build Runtime Config.
// Keep workflow constants in one place so sandbox/prod values and account IDs
// are changed once and reused by later map and NetSuite custom-code steps.

const workflowArguments = input.workflowArguments || {};

const config = {
  workflowName: "Amazon Settlement Reports to NetSuite Journal Entries",
  reportType: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2",
  cutoffDate: workflowArguments.amazonSettlementCutoffDate || "2026-01-01T00:00:00.000Z",
  errorRecipients: [
    "bruno@mindcloud.co",
    //"AMiller@lionel.com",
    //"jjones@lionel.com"
  ].join(", "),
  netsuite: {
    subsidiaryId: "4",
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
    },
    // Sandbox File Cabinet folder. Replace via workflow argument or update here before production.
    fileCabinetFolderId: Number(workflowArguments.amazonSettlementFileCabinetFolderId || 701790)
  },
  behavior: {
    allowCatchAllBySign: true,
    recordTaxLines: false,
    failWhenTaxDoesNotNetToZero: true,
    moneyTolerance: 0.01,
    saveSuccessfulSettlementsInMemory: false,
    saveFailedSettlementsInMemory: true
  },
  memory: {
    failureListKey: "amazon_settlement_failures"
  }
};

return [config];
