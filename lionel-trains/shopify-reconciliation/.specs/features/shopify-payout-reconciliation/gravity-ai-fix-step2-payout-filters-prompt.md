# Gravity AI Fix Prompt: Move Payout Filters Into Shopify GraphQL

Use this prompt in Gravity AI to fix the existing workflow.

````text
You are editing the existing Gravity workflow named "Shopify to NetSuite - Shopify Payout Reconciliation".

Fix only the Shopify payout fetch/filter boundary. Do not rebuild the full workflow. Do not change the accounting calculation, NetSuite duplicate check, NetSuite Journal Entry creation, logging, or batch summary behavior unless a downstream reference must be updated because Step 2 output shape changes.

Current problem:
- Step 2 "Shopify: Fetch Payouts (GraphQL)" fetches the last 50 payouts without server-side payout filters.
- Step 3 "Extract & Filter PAID Payouts" filters `status === "PAID"` and applies the checkpoint window in JavaScript.
- This is wrong for this workflow. `PAID` filtering and checkpoint-window filtering must happen in the Step 2 Shopify GraphQL request, not in Step 3.

Required behavior:
- Step 2 must query Shopify with a `query:` argument on `shopifyPaymentsAccount.payouts`.
- The GraphQL query string must include `status:PAID`.
- When a checkpoint exists, the GraphQL query string must include the issued-at window.
- Step 3 must stop being the primary filter. Step 3 should only extract, flatten, validate, and pass through the payouts returned by Shopify.
- Keep payout `id` as the only idempotency/checkpoint tie-breaker. Do not use `legacyResourceId`.

Shopify GraphQL reference behavior:
- `shopifyPaymentsAccount.payouts` supports a `query` argument.
- Supported payout search filters include `status` and `issued_at`.
- The payout connection default sort key is `ISSUED_AT`; explicitly set `sortKey: ISSUED_AT` anyway so the checkpoint window and pagination are predictable.

Implement the fix this way:

1. Update Step 1 "Resolve Store Config"
   - Keep the existing store config.
   - Keep checkpoint fields:
     - `lastIssuedAt`
     - `lastPayoutId`
   - Add a computed Shopify payout search query string.

   Use this logic as the basis:

   ```javascript
   const storeName = "Big Country Toys";

   const storeConfigs = {
     "Auto World Store": {
       storeName: "Auto World Store",
       division: "30",
       subsidiary: "3",
       currency: "1",
     },
     "Big Country Toys": {
       storeName: "Big Country Toys",
       division: "40",
       subsidiary: "3",
       currency: "1",
     }
   };

   const storeConfig = storeConfigs[storeName];

   if (!storeConfig) {
     throw new Error(`Unknown store: "${storeName}". Supported stores: ${Object.keys(storeConfigs).join(", ")}`);
   }

   // TODO: Replace nulls with persistent checkpoint values in production.
   const checkpoint = {
     lastIssuedAt: null,
     lastPayoutId: null
   };

   const queryParts = ["status:PAID"];

   if (checkpoint.lastIssuedAt) {
     // Use >= so a payout sharing the checkpoint timestamp is not lost.
     // Step 3 may only apply the ID tie-breaker for equal timestamps.
     queryParts.push(`issued_at:>=${checkpoint.lastIssuedAt}`);
   }

   const shopifyPayoutSearchQuery = queryParts.join(" ");

   return [{
     storeConfig,
     checkpoint,
     shopifyPayoutSearchQuery
   }];
   ```

2. Update Step 2 "Shopify: Fetch Payouts (GraphQL)"
   - Replace the broad `payouts(first: 50)` request with a request that passes the search query into GraphQL.
   - Use variables if Gravity supports GraphQL variables.
   - If Gravity does not support variables for this action, dynamically interpolate the Step 1 `shopifyPayoutSearchQuery` into the GraphQL request safely.
   - Keep retrieving the same payout fields needed by downstream steps.
   - Keep `pageInfo { hasNextPage endCursor }`.
   - Use `sortKey: ISSUED_AT`.
   - Use `after` for pagination if an existing pagination loop exists; if not, keep the current first page behavior but do not reintroduce client-side `PAID` or checkpoint filtering.

   Preferred GraphQL shape:

   ```graphql
   query ShopifyPaymentsPayouts($query: String!, $after: String) {
     shopifyPaymentsAccount {
       payouts(
         first: 50
         after: $after
         sortKey: ISSUED_AT
         query: $query
       ) {
         edges {
           cursor
           node {
             id
             issuedAt
             status
             transactionType
             net {
               amount
               currencyCode
             }
             summary {
               adjustmentsFee { amount }
               adjustmentsGross { amount }
               chargesFee { amount }
               chargesGross { amount }
               refundsFee { amount }
               refundsFeeGross { amount }
               reservedFundsFee { amount }
               reservedFundsGross { amount }
               retriedPayoutsFee { amount }
               retriedPayoutsGross { amount }
               advanceFees { amount }
             }
           }
         }
         pageInfo {
           hasNextPage
           endCursor
         }
       }
     }
   }
   ```

   Variables:

   ```json
   {
     "query": "{{Step 1.shopifyPayoutSearchQuery}}",
     "after": null
   }
   ```

   If variables are not supported, the query argument should still be present:

   ```graphql
   payouts(first: 50, sortKey: ISSUED_AT, query: "status:PAID issued_at:>=2026-01-01T00:00:00Z")
   ```

3. Update Step 3 "Extract & Filter PAID Payouts"
   - Rename it to "Extract Payouts from Shopify Response" if possible.
   - Remove the `paidPayouts = allPayouts.filter(p => p.status === "PAID")` primary filtering logic.
   - Remove the checkpoint-window filtering that excludes records based on `issuedAt > lastIssuedAt`.
   - Step 3 should trust Step 2 to return only `PAID` payouts inside the checkpoint window.
   - Step 3 may keep a defensive validation that throws or logs if Shopify returns a non-`PAID` payout, but it must not be the main filter.
   - Step 3 may keep only the ID tie-breaker for same-timestamp checkpoint safety because the GraphQL query uses `issued_at:>=lastIssuedAt`.

   Use this Step 3 JavaScript as the basis:

   ```javascript
   const shopifyRaw = inputData["2WOPwJmOYYYc"] || [];
   const storeConfigStep = inputData["MJ4MVcXzrpvq"] || [];
   const storeConfig = (storeConfigStep[0] || {}).storeConfig || {};
   const checkpoint = (storeConfigStep[0] || {}).checkpoint || {};

   const graphqlResult = shopifyRaw[0] || {};
   const payoutConnection = graphqlResult?.shopifyPaymentsAccount?.payouts || {};
   const edges = payoutConnection.edges || [];
   const pageInfo = payoutConnection.pageInfo || {};

   const allReturnedPayouts = edges.map(edge => edge.node).filter(Boolean);

   const lastIssuedAt = checkpoint.lastIssuedAt || null;
   const lastPayoutId = checkpoint.lastPayoutId || null;

   const eligiblePayouts = allReturnedPayouts.filter(p => {
     if (p.status !== "PAID") {
       throw new Error(`Shopify GraphQL returned non-PAID payout ${p.id} with status ${p.status}; Step 2 query filter is not working`);
     }

     // Step 2 handles the checkpoint window with issued_at:>=lastIssuedAt.
     // This tie-breaker only prevents reprocessing the exact checkpoint payout when issuedAt is equal.
     if (lastIssuedAt && lastPayoutId && p.issuedAt === lastIssuedAt && p.id <= lastPayoutId) {
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
       id: p.id,
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
   ```

4. Check downstream references
   - Step 4 loop must still iterate over Step 3 `payouts`.
   - Step 5 idempotency must still use `externalId = shopify_payout_${payout.id}`.
   - Step 16 checkpoint must still store the latest processed payout using:
     - `lastIssuedAt`
     - `lastPayoutId`

5. Do not make these changes
   - Do not move filtering back into Step 3.
   - Do not fetch all recent payouts and filter them in JavaScript.
   - Do not use `legacyResourceId`.
   - Do not change accounting line logic.
   - Do not change NetSuite account mappings.
   - Do not change the duplicate JE search logic except for downstream field references if needed.

Acceptance checks after the fix:
- Step 2 GraphQL request visibly contains `query: $query` or an equivalent inline `query: "..."`.
- The Step 2 query string contains `status:PAID`.
- When `lastIssuedAt` exists, the Step 2 query string contains `issued_at:>=...`.
- Step 3 no longer performs the primary `status === "PAID"` filtering.
- Step 3 no longer performs the primary `issuedAt > lastIssuedAt` checkpoint-window filtering.
- Step 3 only extracts, flattens, validates, and optionally applies the equal-timestamp payout ID tie-breaker.
- Downstream loop input remains `payouts`.
````

