/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */

function execute() {
  const journalEntryIds = {};
  const deleted = [];
  const failed = [];

  const jeSearch = search.load({
    id: 'customsearch8415',
    type: search.Type.TRANSACTION
  });

  const internalIdColumn = jeSearch.columns.find(col =>
    col.name === 'internalid' && col.summary === search.Summary.GROUP
  );

  if (!internalIdColumn) {
    throw new Error('Internal ID GROUP column not found.');
  }

  const pagedData = jeSearch.runPaged({
    pageSize: 1000
  });

  pagedData.pageRanges.forEach(pageRange => {
    const page = pagedData.fetch({
      index: pageRange.index
    });

    page.data.forEach(result => {
      const internalId = result.getValue(internalIdColumn);

      if (internalId) {
        journalEntryIds[String(internalId)] = true;
      }
    });
  });

  const uniqueIds = Object.keys(journalEntryIds);

  uniqueIds.forEach(id => {
    try {
      record.delete({
        type: record.Type.JOURNAL_ENTRY,
        id: id
      });

      deleted.push(id);

    } catch (e) {
      failed.push({
        id: id,
        name: e.name,
        message: e.message,
        stack: e.stack
      });
    }
  });

  let remainingCount = null;

  try {
    remainingCount = jeSearch.runPaged({
      pageSize: 1000
    }).count;
  } catch (e) {
    
  }

  return {
    foundCount: uniqueIds.length,
    foundIds: uniqueIds,

    deletedCount: deleted.length,
    deletedIds: deleted,

    failedCount: failed.length,
    failed: failed,

    remainingCountAfterDelete: remainingCount
  };
}

execute();


// results
// [
//   {
//     "foundCount": 76,
//     "foundIds": [
//       "47461104",
//       "47461293",
//       "47461297",
//       "47461301",
//       "47461418",
//       "47461419",
//       "47461420",
//       "47461421",
//       "47461424",
//       "47461478",
//       "47461482",
//       "47461488",
//       "47461511",
//       "47461512",
//       "47461513",
//       "47461516",
//       "47461517",
//       "47461518",
//       "47461519",
//       "47461586",
//       "47461891",
//       "47461896",
//       "47461912",
//       "47461939",
//       "47461965",
//       "47462003",
//       "47462006",
//       "47462007",
//       "47462012",
//       "47462014",
//       "47462019",
//       "47462021",
//       "47462022",
//       "47462025",
//       "47466395",
//       "47466396",
//       "47466398",
//       "47466498",
//       "47472373",
//       "47472374",
//       "47472375",
//       "47479426",
//       "47479427",
//       "47490729",
//       "47490824",
//       "47495604",
//       "47495605",
//       "47503028",
//       "47503328",
//       "47503329",
//       "47503546",
//       "47511796",
//       "47519256",
//       "47519257",
//       "47527355",
//       "47534840",
//       "47534939",
//       "47541385",
//       "47541387",
//       "47541388",
//       "47541389",
//       "47541485",
//       "47541486",
//       "47541487",
//       "47541488",
//       "47541489",
//       "47545142",
//       "47550677",
//       "47550778",
//       "47550779",
//       "47557936",
//       "47557938",
//       "47561198",
//       "47565141",
//       "47565142",
//       "47565147"
//     ],
//     "deletedCount": 76,
//     "deletedIds": [
//       "47461104",
//       "47461293",
//       "47461297",
//       "47461301",
//       "47461418",
//       "47461419",
//       "47461420",
//       "47461421",
//       "47461424",
//       "47461478",
//       "47461482",
//       "47461488",
//       "47461511",
//       "47461512",
//       "47461513",
//       "47461516",
//       "47461517",
//       "47461518",
//       "47461519",
//       "47461586",
//       "47461891",
//       "47461896",
//       "47461912",
//       "47461939",
//       "47461965",
//       "47462003",
//       "47462006",
//       "47462007",
//       "47462012",
//       "47462014",
//       "47462019",
//       "47462021",
//       "47462022",
//       "47462025",
//       "47466395",
//       "47466396",
//       "47466398",
//       "47466498",
//       "47472373",
//       "47472374",
//       "47472375",
//       "47479426",
//       "47479427",
//       "47490729",
//       "47490824",
//       "47495604",
//       "47495605",
//       "47503028",
//       "47503328",
//       "47503329",
//       "47503546",
//       "47511796",
//       "47519256",
//       "47519257",
//       "47527355",
//       "47534840",
//       "47534939",
//       "47541385",
//       "47541387",
//       "47541388",
//       "47541389",
//       "47541485",
//       "47541486",
//       "47541487",
//       "47541488",
//       "47541489",
//       "47545142",
//       "47550677",
//       "47550778",
//       "47550779",
//       "47557936",
//       "47557938",
//       "47561198",
//       "47565141",
//       "47565142",
//       "47565147"
//     ],
//     "failedCount": 0,
//     "failed": [],
//     "remainingCountAfterDelete": 0,
//     "__meta": {
//       "presentation": {
//         "type": "card",
//         "fields": {},
//         "entityUrl": ""
//       }
//     }
//   }
// ]