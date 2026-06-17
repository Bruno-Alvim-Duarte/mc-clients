// Extract Payouts from Shopify Response
// Step 2 handles server-side filtering (status:PAID + checkpoint window via issued_at:>=).
// This step extracts, flattens, validates, keeps the GraphQL payout GID, and applies
// the equal-timestamp ID tie-breaker.

const shopifyRaw = input["shopifyGraphqlBetaYYYC"] || [];
const storeConfigStep = input["mapRPVQ"] || [];
const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};
const checkpoint = (storeConfigStep[0] || {}).checkpoint || {};

const graphqlResult = shopifyRaw[0] || {};
const payoutConnection = graphqlResult?.shopifyPaymentsAccount?.payouts || {};
const edges = payoutConnection.edges || [];
const pageInfo = payoutConnection.pageInfo || {};

const allReturnedPayouts = edges.map(edge => edge.node).filter(Boolean);

const lastIssuedAt = checkpoint.lastIssuedAt || null;
const lastPayoutId = checkpoint.lastPayoutId || null;

function resourceIdFromGid(gid) {
  return String(gid || "").split("/").pop();
}

const eligiblePayouts = allReturnedPayouts.filter(p => {
  if (p.status !== "PAID") {
    throw new Error(`Shopify GraphQL returned non-PAID payout ${p.id} with status ${p.status}; Step 2 query filter is not working`);
  }

  const payoutId = resourceIdFromGid(p.id);

  if (lastIssuedAt && lastPayoutId && p.issuedAt === lastIssuedAt && payoutId <= lastPayoutId) {
    return false;
  }

  return true;
});

const flattenedPayouts = eligiblePayouts.map(p => {
  const summary = p.summary || {};
  const flatSummary = {};

  for (const [key, val] of Object.entries(summary)) {
    flatSummary[key] = val?.amount !== undefined ? val.amount : val;
  }

  return {
    id: resourceIdFromGid(p.id),
    payoutGid: p.id,
    legacyResourceId: p.legacyResourceId ? String(p.legacyResourceId) : null,
    issuedAt: p.issuedAt,
    status: p.status,
    transactionType: p.transactionType || null,
    netAmount: p.net?.amount || "0",
    currencyCode: p.net?.currencyCode || null,
    summary: flatSummary,
    storeConfig
  };
});

return [{
  totalFetched: allReturnedPayouts.length,
  totalPaid: allReturnedPayouts.length,
  totalEligible: flattenedPayouts.length,
  hasNextPage: pageInfo.hasNextPage || false,
  endCursor: pageInfo.endCursor || null,
  payouts: flattenedPayouts
}];
