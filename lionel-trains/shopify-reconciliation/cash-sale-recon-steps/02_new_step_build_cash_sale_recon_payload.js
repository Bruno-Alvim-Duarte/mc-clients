// Build Sales Order Reconciliation Payload
// New map step after NetSuite: Create Journal Entry.
// Builds the payload for the NetSuite step that updates Sales Orders.

const accounting = (input["mapVTMX"] || [])[0] || {};
const jePayload = (input["mapNOVA"] || [])[0] || {};
const nsCreateResult = (input["netsuiteExecuteCustomCodeET8Q"] || [])[0] || {};

const orderGroups = accounting.orderGroups || jePayload.orderGroups || [];
const journalEntryId = nsCreateResult.id || nsCreateResult.journalEntryId || null;
const journalEntryNumber =
  nsCreateResult.tranId ||
  nsCreateResult.tranid ||
  nsCreateResult.journalEntryNumber ||
  null;

if (!journalEntryId) {
  throw new Error(`Missing created Journal Entry internal ID for payout ${accounting.payoutId || jePayload.payoutId || "unknown"}`);
}

if (!journalEntryNumber) {
  throw new Error(`Missing created Journal Entry tranId for payout ${accounting.payoutId || jePayload.payoutId || "unknown"}`);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateMMDDYY(dateValue) {
  if (typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    const [year, month, day] = dateValue.split("-");
    return `${month}/${day}/${year.slice(-2)}`;
  }

  const date = dateValue ? new Date(dateValue) : new Date();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

const reconciliationDateInput =
  input.workflowArguments?.reconciliationDate ||
  null;

const reconciliationDate = formatDateMMDDYY(reconciliationDateInput || new Date());
const reconciliationValue = `${journalEntryNumber} - ${reconciliationDate}`;

const seenOrderNames = new Set();
const orderNames = [];

for (const group of orderGroups) {
  if (group.isNonOrderAdjustment === true) continue;
  if (!group.orderName) continue;

  const orderName = String(group.orderName).trim();
  if (!orderName || seenOrderNames.has(orderName)) continue;

  seenOrderNames.add(orderName);
  orderNames.push(orderName);
}

if (orderNames.length === 0) {
  throw new Error(`No order names available to update Sales Orders for payout ${accounting.payoutId || jePayload.payoutId || "unknown"}`);
}

return [{
  payoutId: accounting.payoutId || jePayload.payoutId || null,
  externalId: accounting.externalId || jePayload.externalId || null,
  issuedAt: accounting.issuedAt || jePayload.issuedAt || null,
  issuedDate: accounting.issuedDate || jePayload.issuedDate || null,
  journalEntryId,
  journalEntryNumber,
  reconciliationDate,
  reconciliationValue,
  orderNames,
  cashSaleTargetFieldId: "custbody_shopify_pymt_recon",
  salesOrderTargetFieldId: "custbody_shopify_pymt_recon",
  shopifyOrderIdFieldId: "custbody_shopify_ord_id"
}];
