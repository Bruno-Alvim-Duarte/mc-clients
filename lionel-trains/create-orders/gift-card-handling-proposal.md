# Create Orders - Gift Card Handling Proposal

## Summary

The Create Orders workflow currently exports paid Shopify orders into NetSuite by looking up each Shopify line item SKU as a NetSuite item. This works for regular products, but it fails for Shopify gift cards because gift cards do not have a matching sellable inventory item in NetSuite and should not be fulfilled like physical products.

The proposed solution is to treat Shopify gift card lines as non-inventory revenue lines, identified by Shopify gift card fields instead of SKU naming conventions. Orders that contain only gift cards or other non-inventory/non-fulfillable items should skip the Sales Order path and create a Cash Sale directly. Mixed orders that contain at least one fulfillable product should continue to create a Sales Order.

## Current Behavior

Workflow: `Shopify to NetSuite - Create Orders`

Current flow:

1. The workflow runs on a schedule and fetches paid, open Shopify orders that have not been exported.
2. For each Shopify order, the workflow maps the Shopify order and line item data.
3. The workflow collects all line item SKUs.
4. NetSuite is searched for matching items by `itemid = Shopify SKU`.
5. If any SKU is missing, the workflow skips the order and sends a missing SKU warning.
6. If all SKUs are found, the workflow creates the NetSuite transaction.

This assumes every Shopify line item has a real item in NetSuite that can be found by SKU.

## Issue

Shopify gift cards break the current SKU lookup assumption.

Gift cards:

- Are digital/non-physical products.
- Do not need fulfillment.
- Should not create open fulfillment demand in NetSuite.
- May not have a corresponding NetSuite item per denomination.
- Can be sold in denominations such as `GC25`, `GC50`, and `GC100`.

Today, if a Shopify order contains a gift card SKU that does not exist in NetSuite, the workflow treats it like a missing product SKU and skips the order. That is correct for real products, but incorrect for gift cards.

## Client Concern

The first idea was for Lionel to create one NetSuite non-inventory item per gift card denomination, for example:

- `GC25` for a $25 gift card
- `GC50` for a $50 gift card
- `GC100` for a $100 gift card

With that setup, the current SKU lookup logic would work because the Shopify gift card SKU would match a NetSuite item SKU.

Ari raised a valid concern: Shopify gift cards might not always be clean whole-dollar denominations. For example, there could be a $13.50 gift card.

Based on Shopify's current documentation:

- Gift card products use preset denominations, and each denomination is stored as a product variant.
- A customer cannot freely type a custom gift card amount on the online storefront.
- A gift card product denomination can still be any amount greater than zero, up to Shopify's limit.
- Custom value gift cards can also be created through admin/draft-order style flows.

So the workflow should not depend on a fixed list of whole-dollar SKUs.

References:

- Shopify gift card product denominations: https://help.shopify.com/en/manual/products/gift-card-products/add-update-gift-card-products
- Shopify gift card overview and limits: https://help.shopify.com/en/manual/products/gift-card-products/overview
- Shopify LineItem fields including `isGiftCard` and `requiresShipping`: https://shopify.dev/docs/api/admin-graphql/latest/objects/LineItem

## Proposed Solution

Use one configured NetSuite non-inventory item for Shopify gift card sales, instead of requiring one NetSuite item per gift card denomination.

Example:

- NetSuite item: `SHOPIFY_GIFT_CARD`
- Item type: non-inventory item
- Workflow argument/config value: `giftCardItemId`

When a Shopify line item is identified as a gift card, the workflow should:

1. Use the configured NetSuite gift card item.
2. Set quantity from the Shopify line item quantity.
3. Set `price = -1` in NetSuite so the workflow can use a custom rate.
4. Set the rate from the Shopify gift card line's unit price.
5. Keep the line non-fulfillable/non-inventory.
6. Avoid treating the gift card SKU as a missing SKU.

This supports both normal denominations like `$25.00` and unusual values like `$13.50` without requiring new NetSuite items for every amount.

## Gift Card Identification

Do not identify gift cards using `sku.startsWith("GC")`.

That rule is too fragile because a real product SKU could also start with `GC`.

Preferred identification should come from Shopify line item fields:

- `lineItem.isGiftCard === true`
- `lineItem.requiresShipping === false`
- Optionally `lineItem.nonFulfillableQuantity` as supporting context

The workflow should update the Shopify order query to fetch at least:

```graphql
lineItems(first: 100) {
  edges {
    node {
      id
      title
      sku
      quantity
      isGiftCard
      requiresShipping
      nonFulfillableQuantity
      originalUnitPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      discountedTotalSet {
        shopMoney {
          amount
          currencyCode
        }
      }
    }
  }
}
```

Primary rule:

```js
const isGiftCardLine = lineItem.isGiftCard === true;
```

Fallback rule, only if needed:

```js
const isGiftCardLine =
  lineItem.isGiftCard === true ||
  (
    lineItem.requiresShipping === false &&
    String(lineItem.title || '').toLowerCase().includes('gift card')
  );
```

The fallback should be treated as a temporary safety net, not the main identification method.

## Transaction Type Rule

The workflow should decide between Sales Order and Cash Sale based on whether the order contains any fulfillable product lines.

### Gift Card Only / Non-Inventory Only Orders

If all order lines are gift cards or other non-inventory/non-fulfillable items:

- Do not create a Sales Order.
- Create a Cash Sale directly.
- Do not create fulfillment demand.
- Mark the Shopify order as exported only after the Cash Sale is created successfully.

Reason: there is nothing to fulfill, so a Sales Order adds unnecessary operational work.

### Mixed Orders

If the order has at least one fulfillable product line:

- Continue through the normal Sales Order creation path.
- Add regular products as normal Sales Order item lines.
- Add gift card lines using the configured NetSuite gift card non-inventory item.
- Gift card lines should not create fulfillment demand.

Reason: the physical items still need the existing fulfillment process.

## Suggested Workflow Changes

### 1. Update Shopify Query

Add gift card and fulfillment-related fields to line items:

- `isGiftCard`
- `requiresShipping`
- `nonFulfillableQuantity`
- `fulfillableQuantity`, if available in the selected API version/query path

### 2. Update Mapping Step

Carry the new line item fields into the normalized order object:

```js
{
  lineItemId,
  title,
  sku,
  quantity,
  isGiftCard,
  requiresShipping,
  nonFulfillableQuantity,
  originalUnitPrice,
  discountedTotal,
  currencyCode
}
```

### 3. Update NetSuite Item Lookup

Change the missing SKU check so gift card lines are not searched by SKU.

For each line item:

- If `isGiftCard === true`, enrich the line with `giftCardItemId`.
- If not gift card, search NetSuite by SKU as currently done.

Also include the NetSuite item type in lookup results for regular items, so the workflow can classify whether a line is inventory/fulfillable or non-inventory.

### 4. Add Transaction Type Decision

Before creating the NetSuite transaction, classify lines:

```js
const hasFulfillableProductLine = lineItems.some(function (lineItem) {
  return !lineItem.isGiftCard && lineItem.requiresShipping !== false;
});
```

Recommended production rule should use both Shopify fulfillment fields and NetSuite item type when available:

```js
const hasFulfillableProductLine = lineItems.some(function (lineItem) {
  return lineItem.isGiftCard !== true &&
    lineItem.requiresShipping !== false &&
    lineItem.netsuiteItemType !== 'NonInvtPart';
});
```

Then:

- `hasFulfillableProductLine === true` -> create Sales Order.
- `hasFulfillableProductLine === false` -> create Cash Sale.

### 5. Update Sales Order Line Creation

When creating Sales Order lines:

- Regular product lines use the existing matched NetSuite item.
- Gift card lines use the configured `giftCardItemId`.
- Gift card line rate comes from Shopify's line price.
- Gift card line should be non-taxable if Lionel's accounting rules require that.

### 6. Add Cash Sale Creation Path

For gift-card-only/non-inventory-only orders, create a Cash Sale with:

- Same customer mapping.
- Same Shopify order ID/name fields.
- Same transaction date.
- Same department/class/division fields.
- Gift card/non-inventory item lines.
- Shipping only if Shopify sent a shipping amount, though gift-card-only orders normally should not have shipping.
- Discount handling consistent with the Sales Order path.


## Acceptance Criteria

- A Shopify order with only a `$25` gift card creates a NetSuite Cash Sale and no Sales Order.
- A Shopify order with only a `$13.50` gift card creates a NetSuite Cash Sale using the same configured gift card item and a `$13.50` rate.
- A mixed Shopify order with one physical product and one gift card creates a NetSuite Sales Order.
- Gift card SKUs do not trigger missing SKU warning emails.
- Regular product SKUs still trigger missing SKU warnings when they are not found in NetSuite.
- Gift card identification does not depend on SKU prefix matching.
- Shopify order export tagging happens only after the correct NetSuite transaction is created successfully.
