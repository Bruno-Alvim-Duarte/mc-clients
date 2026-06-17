// Build NetSuite Journal Entry Payload
// Constructs the JE record structure for the NetSuite SuiteScript Execute Custom Code step.
// This version preserves order-level metadata in the map output for logs, but only sends
// NetSuite-supported fields in payload.line[].

const data = (input["mapVTMX"] || [])[0] || {};

if (!data.isBalanced) {
  throw new Error(`Unbalanced journal entry for payout ${data.payoutId}`);
}

const nsLines = (data.lines || []).map(line => {
  const nsLine = {
    account: { id: line.account },
    memo: line.memo
  };

  if (line.debit !== undefined && line.debit > 0) {
    nsLine.debit = line.debit;
  }
  if (line.credit !== undefined && line.credit > 0) {
    nsLine.credit = line.credit;
  }
  if (line.department) {
    nsLine.department = { id: line.department };
  }
  if (line.division) {
    nsLine.division = { id: line.division };
  }

  return nsLine;
});

const payload = {
  externalId: data.externalId,
  subsidiary: { id: "3" },
  currency: { id: "1" },
  tranDate: data.issuedDate,
  memo: data.memo,
  line: nsLines
};

if (data.storeConfig && data.storeConfig.approvalStatus) {
  payload.approvalStatus = data.storeConfig.approvalStatus;
}

return [{
  payoutId: data.payoutId,
  externalId: data.externalId,
  issuedAt: data.issuedAt,
  issuedDate: data.issuedDate,
  memo: data.memo,
  status: data.status,
  transactionType: data.transactionType,
  currencyCode: data.currencyCode,
  netAmount: data.netAmount,
  grossTotal: data.grossTotal,
  feeTotal: data.feeTotal,
  clearingAmount: data.clearingAmount,
  totalDebits: data.totalDebits,
  totalCredits: data.totalCredits,
  balanceTransactionCount: data.balanceTransactionCount,
  orderCount: data.orderCount,
  nonOrderAdjustmentCount: data.nonOrderAdjustmentCount,
  orderGroups: data.orderGroups || [],
  storeConfig: data.storeConfig,
  payload
}];
