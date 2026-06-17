// NetSuite: Create Journal Entry
// Minimal update to the current working Step 15.
// Keeps the existing static-mode Journal Entry creation logic and adds tranId
// to the success response so Sales Orders can be updated with "JE24938 - MM/DD/YY".

const payout = ${JSON.stringify(input?.mapNOVA?.[0])};
const payload = payout?.payload;

function toNumber(value) {
  const n = Number(value || 0);
  return isNaN(n) ? 0 : n;
}

function setValueIfPresent(rec, fieldId, value) {
  if (value !== undefined && value !== null && value !== '') {
    rec.setValue({
      fieldId,
      value
    });
  }
}

function setLineValueIfPresent(rec, line, fieldId, value) {
  if (value !== undefined && value !== null && value !== '') {
    rec.setSublistValue({
      sublistId: 'line',
      fieldId,
      line,
      value
    });
  }
}

function parseDateOnly(dateValue) {
  if (!dateValue) return null;

  const str = String(dateValue).trim();
  const datePart = str.split('T')[0];
  const parts = datePart.split('-');

  if (parts.length !== 3) {
    throw new Error('Invalid tranDate format: ' + str);
  }

  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);

  if (!year || !month || !day) {
    throw new Error('Invalid tranDate parts: ' + str);
  }

  return new Date(year, month - 1, day);
}

function getJournalEntryTranId(journalEntryId) {
  const savedJournalEntry = record.load({
    type: record.Type.JOURNAL_ENTRY,
    id: journalEntryId,
    isDynamic: false
  });

  const tranId = savedJournalEntry.getValue({ fieldId: 'tranid' });
  return tranId ? String(tranId) : null;
}

function execute() {
  try {
    if (!payload) {
      throw new Error('Missing payload for Shopify payout Journal Entry');
    }

    const journalEntry = record.create({
      type: record.Type.JOURNAL_ENTRY,
      isDynamic: false
    });

    // Header fields
    setValueIfPresent(journalEntry, 'externalid', payload.externalId);

    if (payload.subsidiary?.id) {
      setValueIfPresent(journalEntry, 'subsidiary', Number(payload.subsidiary?.id));
    }

    if (payload.currency?.id) {
      setValueIfPresent(journalEntry, 'currency', Number(payload.currency?.id));
    }

    if (payload.tranDate) {
      setValueIfPresent(journalEntry, 'trandate', parseDateOnly(payload.tranDate));
    }

    if (payout.storeConfig?.division) {
      setValueIfPresent(journalEntry, 'csegdivision', Number(payout.storeConfig?.division));
    }

    setValueIfPresent(journalEntry, 'memo', payload.memo);

    // Optional header department
    if (payload.department?.id) {
      setValueIfPresent(journalEntry, 'department', Number(payload.department.id));
    }

    // Lines
    const lines = payload.line || [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!line.account?.id) {
        throw new Error('Missing account on journal line ' + i);
      }

      setLineValueIfPresent(journalEntry, i, 'account', line.account.id);
      setLineValueIfPresent(journalEntry, i, 'memo', line.memo);

      if (line.debit !== undefined && line.debit !== null) {
        setLineValueIfPresent(journalEntry, i, 'debit', toNumber(line.debit));
      }

      if (line.credit !== undefined && line.credit !== null) {
        setLineValueIfPresent(journalEntry, i, 'credit', toNumber(line.credit));
      }

      if (line.department?.id) {
        setLineValueIfPresent(journalEntry, i, 'department', Number(line.department.id));
      }

      if (line.class?.id) {
        setLineValueIfPresent(journalEntry, i, 'class', Number(line.class.id));
      }

      if (line.location?.id) {
        setLineValueIfPresent(journalEntry, i, 'location', Number(line.location.id));
      }

      if (line.division?.id) {
        setLineValueIfPresent(journalEntry, i, 'csegdivision', Number(line.division.id));
      }
    }

    const journalEntryId = journalEntry.save({
      enableSourcing: true,
      ignoreMandatoryFields: false
    });

    const tranId = getJournalEntryTranId(journalEntryId);

    return {
      success: true,
      journalEntryId,
      id: journalEntryId,
      tranId,
      journalEntryNumber: tranId,
      externalId: payload.externalId,
      payoutId: payout?.payoutId,
      memo: payload.memo,
      totalDebits: payout?.totalDebits,
      totalCredits: payout?.totalCredits
    };

  } catch (error) {
    return {
      success: false,
      message: error.message,
      error
    };
  }
}

execute();
