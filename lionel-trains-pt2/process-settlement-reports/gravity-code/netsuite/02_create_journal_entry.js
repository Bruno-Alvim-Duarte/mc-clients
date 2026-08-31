// NetSuite Execute Custom Code: Create Amazon settlement Journal Entry.
// Expected input:
// - input.mapBuildJournalEntryPayload[0]
//
// Replace mapBuildJournalEntryPayload with the actual Gravity step key after Cloudy creates it.

const settlement = ${JSON.stringify(input?.mapWLLK?.[0])};
const payload = settlement && settlement.payload;

function toNumber(value) {
  const n = Number(value || 0);
  return isNaN(n) ? 0 : n;
}

function setValueIfPresent(rec, fieldId, value) {
  if (value !== undefined && value !== null && value !== "") {
    rec.setValue({
      fieldId,
      value
    });
  }
}

function setLineValueIfPresent(rec, line, fieldId, value) {
  if (value !== undefined && value !== null && value !== "") {
    rec.setSublistValue({
      sublistId: "line",
      fieldId,
      line,
      value
    });
  }
}

function parseDateOnly(dateValue) {
  if (!dateValue) return null;

  const str = String(dateValue).trim();
  const normalized = str.indexOf("T") >= 0 ? str.split("T")[0] : str.split(" ")[0];
  const parts = normalized.split("-");

  if (parts.length !== 3) {
    throw new Error("Invalid tranDate format: " + str);
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    throw new Error("Invalid tranDate parts: " + str);
  }

  return new Date(year, month - 1, day);
}

function getJournalEntryTranId(journalEntryId) {
  const savedJournalEntry = record.load({
    type: record.Type.JOURNAL_ENTRY,
    id: journalEntryId,
    isDynamic: false
  });

  const tranId = savedJournalEntry.getValue({ fieldId: "tranid" });
  return tranId ? String(tranId) : null;
}

function execute() {
  try {
    if (!settlement || !payload) {
      throw new Error("Missing payload for Amazon settlement Journal Entry");
    }

    if (!payload.externalId) {
      throw new Error("Missing externalId for Amazon settlement Journal Entry");
    }

    const lines = payload.line || [];

    if (lines.length < 2) {
      throw new Error("Journal Entry payload must contain at least two lines");
    }

    const journalEntry = record.create({
      type: record.Type.JOURNAL_ENTRY,
      isDynamic: false
    });

    setValueIfPresent(journalEntry, "externalid", payload.externalId);

    if (payload.subsidiary && payload.subsidiary.id) {
      setValueIfPresent(journalEntry, "subsidiary", Number(payload.subsidiary.id));
    }

    if (payload.currency && payload.currency.id) {
      setValueIfPresent(journalEntry, "currency", Number(payload.currency.id));
    }

    if (payload.tranDate) {
      setValueIfPresent(journalEntry, "trandate", parseDateOnly(payload.tranDate));
    }

    if (payload.memo) {
      setValueIfPresent(journalEntry, "memo", payload.memo);
    }

    if (payload.department && payload.department.id) {
      setValueIfPresent(journalEntry, "department", Number(payload.department.id));
    }

    if (payload.class && payload.class.id) {
      setValueIfPresent(journalEntry, "class", Number(payload.class.id));
    }

    if (payload.location && payload.location.id) {
      setValueIfPresent(journalEntry, "location", Number(payload.location.id));
    }

    if (payload.division && payload.division.id) {
      setValueIfPresent(journalEntry, "csegdivision", Number(payload.division.id));
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.account || !line.account.id) {
        throw new Error("Missing account on journal line " + i);
      }

      setLineValueIfPresent(journalEntry, i, "account", Number(line.account.id));
      setLineValueIfPresent(journalEntry, i, "memo", line.memo);

      if (line.debit !== undefined && line.debit !== null) {
        setLineValueIfPresent(journalEntry, i, "debit", toNumber(line.debit));
      }

      if (line.credit !== undefined && line.credit !== null) {
        setLineValueIfPresent(journalEntry, i, "credit", toNumber(line.credit));
      }

      if (line.department && line.department.id) {
        setLineValueIfPresent(journalEntry, i, "department", Number(line.department.id));
      }

      if (line.class && line.class.id) {
        setLineValueIfPresent(journalEntry, i, "class", Number(line.class.id));
      }

      if (line.location && line.location.id) {
        setLineValueIfPresent(journalEntry, i, "location", Number(line.location.id));
      }

      if (line.division && line.division.id) {
        setLineValueIfPresent(journalEntry, i, "csegdivision", Number(line.division.id));
      }

      // The "Name" column on a NetSuite Journal Entry line is the entity field.
      if (line.entity && line.entity.id) {
        setLineValueIfPresent(journalEntry, i, "entity", Number(line.entity.id));
      }
    }

    const journalEntryId = journalEntry.save({
      enableSourcing: true,
      ignoreMandatoryFields: false
    });

    const tranId = getJournalEntryTranId(journalEntryId);

    return {
      success: true,
      settlementId: settlement.settlementId,
      reportId: settlement.reportId,
      reportDocumentId: settlement.reportDocumentId,
      externalId: payload.externalId,
      journalEntryId: String(journalEntryId),
      id: String(journalEntryId),
      tranId,
      journalEntryNumber: tranId,
      memo: payload.memo,
      totalDebits: settlement.totalDebits,
      totalCredits: settlement.totalCredits,
      lineCount: lines.length
    };
  } catch (error) {
    return {
      success: false,
      settlementId: settlement && settlement.settlementId,
      reportId: settlement && settlement.reportId,
      reportDocumentId: settlement && settlement.reportDocumentId,
      externalId: payload && payload.externalId,
      message: error.message,
      stack: error.stack,
      error
    };
  }
}

execute();
