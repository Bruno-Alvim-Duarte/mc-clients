// NetSuite Execute Custom Code: Search existing Amazon settlement Journal Entry.
// Expected input:
// - input.mapBuildJournalEntryPayload[0]
//
// Replace mapBuildJournalEntryPayload with the actual Gravity step key after Cloudy creates it.

const settlement = ${JSON.stringify(input?.mapBuildJournalEntryPayload?.[0])};

function execute() {
  try {
    if (!settlement || !settlement.externalId) {
      throw new Error("Missing settlement externalId for Journal Entry duplicate search");
    }

    const results = [];

    const jeSearch = search.create({
      type: search.Type.TRANSACTION,
      filters: [
        ["type", "anyof", "Journal"],
        "AND",
        ["mainline", "is", "T"],
        "AND",
        ["externalidstring", "is", String(settlement.externalId)]
      ],
      columns: [
        search.createColumn({ name: "internalid" }),
        search.createColumn({ name: "tranid" }),
        search.createColumn({ name: "externalid" }),
        search.createColumn({ name: "trandate" }),
        search.createColumn({ name: "memo" })
      ]
    });

    jeSearch.run().each(function(result) {
      results.push({
        internalId: String(result.getValue({ name: "internalid" })),
        tranId: result.getValue({ name: "tranid" }),
        externalId: result.getValue({ name: "externalid" }),
        tranDate: result.getValue({ name: "trandate" }),
        memo: result.getValue({ name: "memo" })
      });

      return results.length < 2;
    });

    return {
      success: true,
      settlementId: settlement.settlementId,
      externalId: settlement.externalId,
      found: results.length > 0,
      duplicateCount: results.length,
      hasMultipleMatches: results.length > 1,
      existingJournalEntry: results.length === 1 ? results[0] : null,
      matches: results
    };
  } catch (error) {
    return {
      success: false,
      settlementId: settlement && settlement.settlementId,
      externalId: settlement && settlement.externalId,
      message: error.message,
      stack: error.stack,
      error
    };
  }
}

execute();
