📦 NetSuite to Shopify — Sync Inventory
Purpose: Automatically synchronizes inventory quantities from NetSuite to Shopify every 5 minutes. It detects items whose available quantity has changed in NetSuite, looks up the corresponding Shopify variant by SKU, calculates the delta, and adjusts Shopify inventory when a difference is found.

Step 10 — 🕐 Run every 5 minutes, daily (Trigger — Schedule)
Type: Schedule Trigger Schedule: Interval-based, every 300,000 ms (5 minutes) Days: Every day of the week (Sun–Sat) Timezone: Not explicitly set

This is the trigger that kicks off the workflow automatically. Every 5 minutes, 7 days a week, the workflow fires and begins the sync process.

Step 1 — 📝 Workflow Vars (Map)
Type: Map (JavaScript) Inputs: None

const lastModifiedDate = "05/01/2026 0:00 am";

return [{ lastModifiedDate }];
Output: [{ lastModifiedDate: "05/01/2026 0:00 am" }]

Defines workflow-level variables. The lastModifiedDate acts as a cutoff date filter for the NetSuite search — only inventory items modified after this date will be retrieved. This value is currently hardcoded and would need to be updated or made dynamic for production use.

Step 2 — 🔍 Locate Changed Inventory (NetSuite — SuiteScript Saved Search)
Type: NetSuite Action (SuiteScript code execution) Credential: Connected NetSuite account Inputs: lastModifiedDate from Step 1

const lastModifiedDate = '${input?.mapP1TY?.[0]?.lastModifiedDate}'
const locationId = '${input?.netsuiteListLocationsA6J7?.[0].id}';

function execute() {
  try {
    const itemSearch = search.create({
      type: search.Type.INVENTORY_ITEM,
      filters: [
        ["type", "anyof", "InvtPart"],
        "AND", ["inventorylocation", "anyof", 32],
        "AND", ["lastQuantityAvailableChange", "after", lastModifiedDate],
      ],
      columns: [
        search.createColumn({ name: "parent" }),
        search.createColumn({
          name: "formulatext",
          formula: "CASE WHEN INSTR({name},': ') <> 0 THEN SUBSTR({name}, INSTR({name},': ')+2) ELSE {name} END"
        }),
        search.createColumn({ name: "upccode" }),
        search.createColumn({ name: "locationquantityonhand" }),
        search.createColumn({ name: "locationquantitycommitted" }),
        search.createColumn({ name: "locationquantityavailable" }),
        search.createColumn({ name: "locationquantitybackordered" }),
        search.createColumn({ name: 'lastQuantityAvailableChange' })
      ]
    });

    const allResults = [];
    const resultSet = itemSearch.run();

    resultSet.each(function (result) {
      allResults.push(result);
      return true;
    });

    return allResults;
  } catch (error) {
    return {
      success: false,
      error,
    }
  }
}

execute();
Search Filters:

Item Type: Inventory Part (InvtPart)
Location: ID 32 (hardcoded warehouse location)
Last Quantity Available Change: After the lastModifiedDate from Step 1
Columns Retrieved:

parent — Parent item reference
formulatext — Extracted SKU name (strips prefix before ": " if present, otherwise uses the full name)
upccode — UPC barcode
locationquantityonhand — On-hand quantity at location
locationquantitycommitted — Committed quantity at location
locationquantityavailable — Available quantity at location
locationquantitybackordered — Backordered quantity at location
lastQuantityAvailableChange — Timestamp of last availability change
Runs a NetSuite Saved Search via SuiteScript to find all inventory items at location 32 whose available quantity has changed since the cutoff date. Returns the full result set for downstream processing.

Step 3 — 🧪 Debug Filter (Transform)
Type: Transform (Filter) Source: Step 2 (Locate Changed Inventory) — Entire Results Filter: values.formulatext equals "201test"

A debug/testing filter that narrows the results down to a single test SKU (201test). This is likely used during development to avoid processing all inventory items. In production, this filter would be removed or adjusted.

Step 4 — 🔁 Loop through Inventory (Iterate)
Type: Iterator / Loop Source: Step 3 (Debug Filter) — Entire Results Active Index: 0

Loops through each inventory item returned by the Debug Filter (or in production, directly from Step 2). For each item, the following steps (5–12) execute as children of this loop.

Step 5 — 🛒 Get Variant by SKU (Shopify — GraphQL)
Type: Shopify GraphQL Action Credential: Connected Shopify account Inside: Loop (child of Step 4)

GraphQL Query:

query ($sku: String!) {
  productVariants(first: 2, query: $sku) {
    edges {
      node {
        id
        sku
        inventoryQuantity
        inventoryItem {
          id
          inventoryLevels(first: 10) {
            edges {
              node {
                id
                quantities(names: ["available", "committed", "on_hand"]) {
                  name
                  quantity
                }
                location {
                  id
                }
              }
            }
          }
        }
        product {
          id
          title
        }
      }
    }
  }
}
Variables: {"sku": "sku:\"201test\""}

Queries Shopify's GraphQL API for product variants matching the current SKU. Intentionally fetches up to 2 variants (first: 2) so the next step can detect duplicates. Returns variant ID, SKU, inventory quantity, inventory item with levels across all locations (available, committed, on_hand), and the parent product info.

⚠️ Note: The variables are currently hardcoded to "201test". In production, this should be dynamically set from the current loop item's formulatext (SKU) value.

Step 6 — 🔢 Count Variant Edges (Map)
Type: Map (JavaScript) Inputs: Step 5 (Get Variant by SKU)

const stepOutput = input["shopifyGraphqlBetaFDO5"];
const result = Array.isArray(stepOutput) ? stepOutput[0] : stepOutput;
const edges = result?.data?.productVariants?.edges || [];
const edgesCount = edges.length;
const hasMultipleVariants = edgesCount > 1;

return [{ edgesCount, hasMultipleVariants }];
Output: [{ edgesCount: <number>, hasMultipleVariants: <boolean> }]

Extracts the edges array from the Shopify GraphQL response and counts how many variant matches were returned. If more than 1 variant matched the SKU, hasMultipleVariants is set to true. This enables the next step to branch and skip ambiguous records.

Step 7 — ❓ If Multiple Variants (edges > 1) (If/Else)
Type: If/Else Conditional Condition: hasMultipleVariants from Step 6 equals true

Then Branch (true): → Step 8 (Log & Alert: Duplicate SKU)
Else Branch (false): → Step 9 (Format Shopify Response) — continues normal processing
Guards against duplicate SKU matches. If Shopify returned more than one variant for a given SKU, the record is skipped to prevent incorrect inventory adjustments, and an alert is sent.

Step 8 — 🚨 Log & Alert: Duplicate SKU (Flow Control — Then Branch)
Type: Flow Control Action: continue (skip to next loop iteration) Inside: Then branch of Step 7 (when duplicates are found)

Log:

Emit Log: ✅ Yes
Log Level: ⚠️ Warning
Log Message: Skipping record - Multiple Shopify variants found for SKU: {{current item's formulatext}}. Found more than 1 edge in productVariants. Record skipped.
Email Alert:

Send Email: ✅ Yes
Recipients: bruno@mindcloud.co, AMiller@lionel.com, jjones@lionel.com
Subject: Inventory Sync Alert: Duplicate Variants Found for SKU
Body: Warning message explaining the SKU was skipped, including the dynamic SKU value, with instructions to review and resolve duplicates in Shopify.
When a duplicate SKU is detected, this step: (1) emits a warning log, (2) sends an email alert to the team, and (3) continues to the next loop iteration — effectively skipping the problematic record.

Step 9 — 🗂️ Format Shopify Response (Map)
Type: Map (JavaScript) Inputs: Step 5 (Get Variant by SKU) Inside: Else branch of Step 7 (normal flow — single variant)

var shopifyData = input.shopifyGraphqlBetaFDO5;

var firstResult = (shopifyData && shopifyData[0] && shopifyData[0].data) || {};
var variants = (firstResult.productVariants && firstResult.productVariants.edges) || [];

function getQuantity(quantities, name) {
  var match = (quantities || []).filter(function(q) { return q.name === name; })[0];
  return match ? match.quantity : null;
}

var results = variants.map(function(edge) {
  var node = edge.node || {};
  var inventoryItem = node.inventoryItem || {};
  var product = node.product || {};
  var levelEdges = (inventoryItem.inventoryLevels && inventoryItem.inventoryLevels.edges) || [];

  var locations = levelEdges.map(function(levelEdge) {
    var loc = levelEdge.node || {};
    var quantities = loc.quantities || [];
    return {
      inventoryLevelId: loc.id || null,
      locationId: (loc.location && loc.location.id) || null,
      available: getQuantity(quantities, 'available'),
      committed: getQuantity(quantities, 'committed'),
      onHand: getQuantity(quantities, 'on_hand')
    };
  });

  return {
    variantId: node.id || null,
    sku: node.sku || null,
    inventoryQuantity: node.inventoryQuantity || 0,
    inventoryItemId: inventoryItem.id || null,
    productId: product.id || null,
    productTitle: product.title || null,
    locations: locations
  };
});

return results;
Output: Flattened array of variant objects, each containing:

variantId, sku, inventoryQuantity, inventoryItemId, productId, productTitle
locations[] — Array of location objects with inventoryLevelId, locationId, available, committed, onHand
Transforms the nested Shopify GraphQL response into a clean, flattened structure. Extracts each variant's core fields and unpacks all inventory levels into a readable locations array with individual quantity values.

Step 10 — ⚖️ Compare & Calculate Delta (Map)
Type: Map (JavaScript) Inputs: Step 4 (current loop item from Iterator), Step 9 (Format Shopify Response)

var TARGET_LOCATION = "gid://shopify/Location/76447547458";

// Current NetSuite item from the iterator
var nsItem = input.iterateFP2S[0] || {};
var nsValues = nsItem.values || {};
var nsAvailable = parseInt(nsValues.locationquantityavailable, 10) || 0;

// Shopify formatted response
var shopifyVariants = input.mapEQQK || [];
var variant = shopifyVariants[0] || {};
var sku = variant.sku;

var shopifyInventoryItemId = variant.inventoryItemId || null;
var shopifyVariantId = variant.variantId || null;
var shopifyProductTitle = variant.productTitle || "";

// Find the target location's available quantity
var shopifyAvailable = 0;
var locationFound = false;
var locations = variant.locations || [];

for (var i = 0; i < locations.length; i++) {
  if (locations[i].locationId === TARGET_LOCATION) {
    shopifyAvailable = locations[i].available || 0;
    locationFound = true;
    break;
  }
}

// Calculate the delta (positive = need to add, negative = need to remove)
var delta = nsAvailable - shopifyAvailable;
var needsAdjustment = delta !== 0;

return [{
  sku,
  netsuiteAvailable: nsAvailable,
  shopifyAvailable: shopifyAvailable,
  delta: delta,
  needsAdjustment: needsAdjustment,
  locationId: TARGET_LOCATION,
  inventoryItemId: shopifyInventoryItemId,
  variantId: shopifyVariantId,
  productTitle: shopifyProductTitle,
  locationFound: locationFound
}];
Target Location: gid://shopify/Location/76447547458 (hardcoded Shopify location ID)

Logic:

Gets NetSuite's locationquantityavailable for the current item
Gets Shopify's available quantity at the target location
Calculates delta = nsAvailable - shopifyAvailable
Flags needsAdjustment = true if delta ≠ 0
Output: [{ sku, netsuiteAvailable, shopifyAvailable, delta, needsAdjustment, locationId, inventoryItemId, variantId, productTitle, locationFound }]

The core comparison engine. Takes the current NetSuite item's available quantity and the Shopify variant's available quantity at a specific location, then computes the difference. A positive delta means NetSuite has more (Shopify needs stock added); a negative delta means NetSuite has less (Shopify needs stock removed).

Step 11 — ❓ If Delta != 0 (If/Else)
Type: If/Else Conditional Condition: delta from Step 10 is not equal to 0

Then Branch (true): → Step 12 (Adjust Shopify Inventory)
Else Branch (false): No action (inventory is already in sync — skip)
Only proceeds with the Shopify inventory adjustment if there's actually a difference. If NetSuite and Shopify quantities already match, the record is silently skipped.

Step 12 — 📦 Adjust Shopify Inventory (Shopify — GraphQL Mutation)
Type: Shopify GraphQL Action Credential: Connected Shopify account Inside: Then branch of Step 11 (only when delta ≠ 0)

GraphQL Mutation:

mutation inventorySetQuantities($input: InventorySetQuantitiesInput!) {
  inventorySetQuantities(input: $input) {
    inventoryAdjustmentGroup {
      createdAt
      reason
      changes {
        name
        delta
        quantityAfterChange
      }
    }
    userErrors {
      field
      message
