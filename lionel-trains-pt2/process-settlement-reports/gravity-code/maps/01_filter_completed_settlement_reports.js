// Gravity map step: Filter completed Amazon settlement reports.
// Expected input:
// - input.mapBuildRuntimeConfig[0] from "Build Runtime Config"
// - input.amazonListFbmReports[0] from Amazon Seller "List FBM Reports"
// - optional Memory/KV get output for key amazon_settlement_failures
// - optional input.workflowArguments for overrides
//
// Replace mapBuildRuntimeConfig and amazonListFbmReports with actual Gravity step keys.

const runtimeConfig = (input.mapF0FK || [])[0] || {};
const listReportsResult = (input.amazonSellerNaNQ9QS || [])[0] || {};
const existingFailureState =
  (input.keyValueStorageGHHQ || [])[0]
const workflowArguments = input.workflowArguments || {};

const REPORT_TYPE = runtimeConfig.reportType || "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE_V2";
const DEFAULT_CUTOFF_DATE = runtimeConfig.cutoffDate || "2026-07-01T00:00:00.000Z";
const cutoffDate = new Date(workflowArguments.amazonSettlementCutoffDate || DEFAULT_CUTOFF_DATE);

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

function extractFailureArray(memoryResult) {
  const candidates = [
    memoryResult,
    memoryResult.value,
    memoryResult.data,
    memoryResult.body,
    memoryResult.result,
    memoryResult.failures
  ];

  for (const candidate of candidates) {
    const parsed = parseMaybeJson(candidate);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.value)) return parsed.value;
    if (parsed && Array.isArray(parsed.failures)) return parsed.failures;
  }

  return [];
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

function dedupeKey(report) {
  if (report.reportDocumentId) return `document:${report.reportDocumentId}`;
  if (report.reportId) return `report:${report.reportId}`;
  if (report.settlementId) return `settlement:${report.settlementId}`;
  return "";
}

const amazonReports = asArray(listReportsResult.reports)
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
    retrySource: "amazon_list",
    externalIdHint: report.reportId ? `amazon_settlement_report_${report.reportId}` : null
  }))
  .filter(report => report.reportId && report.reportDocumentId);

const failedSettlements = extractFailureArray(existingFailureState);
const skippedFailureRetries = [];
const retryReports = failedSettlements
  .filter(item => item && item.status !== "resolved")
  .map(item => {
    const report = {
      reportType: REPORT_TYPE,
      reportId: String(item.reportId || ""),
      reportDocumentId: String(item.reportDocumentId || ""),
      processingEndTime: null,
      dataStartTime: null,
      dataEndTime: null,
      createdTime: null,
      marketplaceIds: [],
      settlementId: String(item.settlementId || ""),
      externalId: item.externalId || (item.settlementId ? `amazon_settlement_${item.settlementId}` : null),
      journalEntryId: item.journalEntryId || null,
      failurePhase: item.failurePhase || null,
      retrySource: "failure_array",
      externalIdHint: item.externalId || (item.settlementId ? `amazon_settlement_${item.settlementId}` : null)
    };

    if (!report.reportDocumentId) {
      skippedFailureRetries.push({
        settlementId: report.settlementId || null,
        reportId: report.reportId || null,
        reason: "Missing reportDocumentId on failure array item"
      });
      return null;
    }

    return report;
  })
  .filter(Boolean);

const reportsByKey = {};

for (const report of retryReports) {
  reportsByKey[dedupeKey(report)] = report;
}

for (const report of amazonReports) {
  reportsByKey[dedupeKey(report)] = report;
}

const reports = Object.keys(reportsByKey)
  .map(key => reportsByKey[key])
  .sort((a, b) => settlementSortValue(a).localeCompare(settlementSortValue(b)));

return [{
  reportType: REPORT_TYPE,
  cutoffDate: cutoffDate.toISOString(),
  reportCount: reports.length,
  amazonReportCount: amazonReports.length,
  retryReportCount: retryReports.length,
  skippedFailureRetryCount: skippedFailureRetries.length,
  reports,
  skippedFailureRetries,
  nextToken: listReportsResult.nextToken || null,
  hasNextToken: Boolean(listReportsResult.nextToken)
}];
