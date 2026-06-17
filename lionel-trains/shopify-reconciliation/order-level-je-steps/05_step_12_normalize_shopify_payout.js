// Normalize Shopify Payout
// Validates required fields and normalizes the payout structure for downstream steps.
// Keeps payoutGid and legacyResourceId so balance transactions can be fetched by payout.

const payout = input["iterateJVCA"][0];
const storeConfigStep = input["mapRPVQ"] || [];
const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};

if (!payout?.id) {
  throw new Error("Missing Shopify payout id");
}

if (!payout?.issuedAt) {
  throw new Error(`Missing issuedAt for payout ${payout.id}`);
}

const issuedDate = String(payout.issuedAt).split("T")[0];
const netAmountRaw = payout.net?.amount ?? payout.netAmount;

if (netAmountRaw === undefined || netAmountRaw === null || netAmountRaw === "") {
  throw new Error(`Missing net amount for payout ${payout.id}`);
}

return [{
  payoutId: payout.id,
  payoutGid: payout.payoutGid || null,
  payoutLegacyResourceId: payout.legacyResourceId ? String(payout.legacyResourceId) : null,
  externalId: `shopify_payout_${payout.id}`,
  issuedAt: payout.issuedAt,
  issuedDate,
  memo: `Shopify payout reconciliation ${issuedDate} (${storeConfig.storeName})`,
  status: payout.status || null,
  transactionType: payout.transactionType || payout.type || null,
  currencyCode: payout.currencyCode || payout.net?.currencyCode || null,
  netAmount: Number(netAmountRaw),
  summary: payout.summary || {},
  storeConfig
}];
