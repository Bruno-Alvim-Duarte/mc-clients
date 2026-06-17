// Build Batch Summary
// Aggregates all payout log results from workflow memory.

const MEMORY_KEY = "shopifyPayoutReconciliationLogs";

function readMemoryArray(key) {
  const raw = input.memory?.[key];

  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

const extractionStep = (input["mapBEND"] || [])[0] || {};
const logResults = readMemoryArray(MEMORY_KEY);

const totalFetched =
  extractionStep.totalFetched !== undefined
    ? extractionStep.totalFetched
    : (extractionStep.payouts || []).length || logResults.length;

const totalEligible =
  extractionStep.totalEligible !== undefined
    ? extractionStep.totalEligible
    : (extractionStep.payouts || []).length || logResults.length;

let createdCount = 0;
let skippedCount = 0;
let failedCount = 0;
let partialSalesOrderUpdateCount = 0;
let totalOrdersPosted = 0;
let totalBalanceTransactionsPosted = 0;
let totalSalesOrdersUpdated = 0;
const failedPayouts = [];
const partialPayouts = [];

for (const log of logResults) {
  if (log.resultStatus === "created" || log.resultStatus === "created_cash_sales_partial" || log.resultStatus === "created_sales_orders_partial") {
    createdCount++;
    totalOrdersPosted += Number(log.orderCount || 0);
    totalBalanceTransactionsPosted += Number(log.balanceTransactionCount || 0);
    totalSalesOrdersUpdated += Number(log.salesOrdersUpdated || log.cashSalesUpdated || 0);

    if (log.resultStatus === "created_cash_sales_partial" || log.resultStatus === "created_sales_orders_partial") {
      partialSalesOrderUpdateCount++;
      partialPayouts.push({
        payoutId: log.payoutId,
        externalId: log.externalId,
        missingOrders: log.salesOrdersMissing || log.cashSalesMissing || []
      });
    }
  } else if (log.resultStatus === "skipped_already_processed") {
    skippedCount++;
  } else if (log.resultStatus === "failed") {
    failedCount++;
    failedPayouts.push({
      payoutId: log.payoutId,
      externalId: log.externalId,
      errorStep: log.errorStep,
      errorMessage: log.errorMessage
    });
  } else {
    failedCount++;
    failedPayouts.push({
      payoutId: log.payoutId,
      externalId: log.externalId,
      errorStep: log.errorStep || "Unknown",
      errorMessage: log.errorMessage || "Unknown result status: " + log.resultStatus
    });
  }
}

const runTimestamp = new Date().toISOString();

const summary = {
  runTimestamp,
  totalPayoutsFetched: totalFetched,
  totalEligiblePayouts: totalEligible,
  createdCount,
  skippedCount,
  failedCount,
  partialSalesOrderUpdateCount,
  totalOrdersPosted,
  totalBalanceTransactionsPosted,
  totalSalesOrdersUpdated,
  failedPayouts,
  partialPayouts,
  hasFailures: failedCount > 0,
  summaryMessage: [
    `Shopify Payout Reconciliation Summary (${runTimestamp})`,
    `Total payouts fetched: ${totalFetched}`,
    `Total eligible payouts: ${totalEligible}`,
    `Created: ${createdCount}`,
    `Skipped (already processed): ${skippedCount}`,
    `Failed: ${failedCount}`,
    `Partial Sales Order updates: ${partialSalesOrderUpdateCount}`,
    `Orders posted: ${totalOrdersPosted}`,
    `Balance transactions posted: ${totalBalanceTransactionsPosted}`,
    `Sales Orders updated: ${totalSalesOrdersUpdated}`,
    partialPayouts.length > 0
      ? `\nPartial Sales Order update details:\n` + partialPayouts.map(p =>
          `  - Payout ${p.payoutId} (${p.externalId}): missing orders ${p.missingOrders.join(", ")}`
        ).join("\n")
      : "",
    failedPayouts.length > 0
      ? `\nFailed payout details:\n` + failedPayouts.map(f =>
          `  - Payout ${f.payoutId} (${f.externalId}): [${f.errorStep}] ${f.errorMessage}`
        ).join("\n")
      : ""
  ].filter(Boolean).join("\n")
};

return [summary];
