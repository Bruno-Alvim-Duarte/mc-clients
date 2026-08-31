// NetSuite Execute Custom Code: Save settlement CSV in File Cabinet and attach it to the JE.
// Expected input:
// - input.mapBuildRuntimeConfig[0]
// - input.mapBuildJournalEntryPayload[0]
// - input.netsuiteCreateJournalEntry[0] OR input.netsuiteSearchExistingJournalEntry[0]
// - input.httpDownloadSettlementReport[0]
//
// Replace step keys with actual Gravity keys after Cloudy creates the workflow.

const runtimeConfig = ${JSON.stringify(input?.mapBuildRuntimeConfig?.[0])};
const settlement = ${JSON.stringify(input?.mapBuildJournalEntryPayload?.[0])};
const createResult = ${JSON.stringify(input?.netsuiteCreateJournalEntry?.[0])};
const searchResult = ${JSON.stringify(input?.netsuiteSearchExistingJournalEntry?.[0])};
const httpResponse = ${JSON.stringify(input?.httpDownloadSettlementReport?.[0])};

const CONFIG = {
  // Sandbox folder. Replace with a production folder internal ID before go-live.
  fileCabinetFolderId:
    runtimeConfig &&
    runtimeConfig.netsuite &&
    runtimeConfig.netsuite.fileCabinetFolderId
      ? Number(runtimeConfig.netsuite.fileCabinetFolderId)
      : 701790
};

function getJournalEntryId() {
  if (createResult && createResult.journalEntryId) return String(createResult.journalEntryId);
  if (createResult && createResult.id) return String(createResult.id);
  if (searchResult && searchResult.existingJournalEntry && searchResult.existingJournalEntry.internalId) {
    return String(searchResult.existingJournalEntry.internalId);
  }
  return null;
}

function getResponseBody(response) {
  if (typeof response === "string") return response;
  if (response && typeof response.body === "string") return response.body;
  if (response && typeof response.data === "string") return response.data;
  if (response && typeof response.content === "string") return response.content;
  if (response && typeof response.responseBody === "string") return response.responseBody;
  if (response && typeof response.text === "string") return response.text;
  throw new Error("Unable to find downloaded settlement report body on HTTP response");
}

function execute() {
  try {
    if (!settlement || !settlement.settlementId) {
      throw new Error("Missing settlement payload for CSV attachment");
    }

    const journalEntryId = getJournalEntryId();

    if (!journalEntryId) {
      throw new Error("Missing Journal Entry ID for CSV attachment");
    }

    const csvContent = getResponseBody(httpResponse);
    const fileName = "amazon-settlement-" + settlement.settlementId + ".txt";

    const settlementFile = file.create({
      name: fileName,
      fileType: file.Type.PLAINTEXT,
      contents: csvContent,
      folder: CONFIG.fileCabinetFolderId,
      description: "Amazon settlement report " + settlement.settlementId
    });

    const fileId = settlementFile.save();

    record.attach({
      record: {
        type: "file",
        id: fileId
      },
      to: {
        type: record.Type.JOURNAL_ENTRY,
        id: journalEntryId
      }
    });

    return {
      success: true,
      settlementId: settlement.settlementId,
      reportId: settlement.reportId,
      reportDocumentId: settlement.reportDocumentId,
      externalId: settlement.externalId,
      journalEntryId,
      fileId: String(fileId),
      fileName
    };
  } catch (error) {
    return {
      success: false,
      settlementId: settlement && settlement.settlementId,
      reportId: settlement && settlement.reportId,
      reportDocumentId: settlement && settlement.reportDocumentId,
      externalId: settlement && settlement.externalId,
      journalEntryId: getJournalEntryId(),
      message: error.message,
      stack: error.stack,
      error
    };
  }
}

execute();
