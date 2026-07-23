// Gravity map step: Filter completed Amazon settlement reports.
// Expected input:
// - input.mapBuildRuntimeConfig[0] from "Build Runtime Config"
// - input.amazonListFbmReports[0] from Amazon Seller "List FBM Reports"
// - optional input.workflowArguments for overrides
//
// Replace mapBuildRuntimeConfig and amazonListFbmReports with actual Gravity step keys.

const runtimeConfig = (input.mapBuildRuntimeConfig || [])[0] || {};
const listReportsResult = (input.amazonListFbmReports || [])[0] || {};
const workflowArguments = input.workflowArguments || {};

const REPORT_TYPE = runtimeConfig.reportType || "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2";
const DEFAULT_CUTOFF_DATE = runtimeConfig.cutoffDate || "2026-07-01T00:00:00.000Z";
const cutoffDate = new Date(workflowArguments.amazonSettlementCutoffDate || DEFAULT_CUTOFF_DATE);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function settlementSortValue(report) {
  return (
    normalizeDate(report.dataEndTime) ||
    normalizeDate(report.processingEndTime) ||
    normalizeDate(report.createdTime) ||
    ""
  );
}

const reports = asArray(listReportsResult.reports)
  .filter(report => report && report.reportType === REPORT_TYPE)
  .filter(report => report.processingStatus === "DONE")
  .filter(report => {
    const endDate = new Date(report.dataEndTime || report.processingEndTime || report.createdTime || 0);
    return !Number.isNaN(endDate.getTime()) && endDate >= cutoffDate;
  })
  .sort((a, b) => settlementSortValue(a).localeCompare(settlementSortValue(b)))
  .map(report => ({
    reportType: report.reportType,
    reportId: String(report.reportId || ""),
    reportDocumentId: String(report.reportDocumentId || ""),
    processingEndTime: normalizeDate(report.processingEndTime),
    dataStartTime: normalizeDate(report.dataStartTime),
    dataEndTime: normalizeDate(report.dataEndTime),
    createdTime: normalizeDate(report.createdTime),
    marketplaceIds: asArray(report.marketplaceIds),
    externalIdHint: report.reportId ? `amazon_settlement_report_${report.reportId}` : null
  }))
  .filter(report => report.reportId && report.reportDocumentId);

return [{
  reportType: REPORT_TYPE,
  cutoffDate: cutoffDate.toISOString(),
  reportCount: reports.length,
  reports,
  nextToken: listReportsResult.nextToken || null,
  hasNextToken: Boolean(listReportsResult.nextToken)
}];
