// Build Balance Transactions Query
// New map step inside the ELSE branch, immediately after Normalize Shopify Payout.
// Output is consumed by the new Shopify GraphQL balanceTransactions action.

const data = (input["mapPV2R"] || [])[0] || {};

function numericId(value) {
  return String(value || "").split("/").pop();
}

const payoutTransferId =
  data.payoutLegacyResourceId ||
  data.legacyResourceId ||
  numericId(data.payoutGid) ||
  numericId(data.payoutId);

if (!payoutTransferId) {
  throw new Error(`Missing payout transfer id for payout ${data.payoutId || "unknown"}`);
}

// Shopify balanceTransactions supports payments_transfer_id as a search filter.
const balanceTransactionsSearchQuery = `payments_transfer_id:${payoutTransferId}`;

return [{
  payoutId: data.payoutId,
  payoutGid: data.payoutGid || null,
  payoutLegacyResourceId: data.payoutLegacyResourceId || null,
  balanceTransactionsSearchQuery
}];
