# Shopify to NetSuite Refund Sync

## Turnover Readiness

Status: Not ready

Summary:
This workflow will sync Shopify refunds into NetSuite by creating a Credit Memo and then refunding/applying that credit in NetSuite. The workflow scope is limited to refunded item lines and item values only; taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments are out of scope. The main risk is line-level financial accuracy for partial item refunds and multiple refunds against the same order. The build is blocked until we confirm the source NetSuite transaction, matching rules, fallback behavior, and required NetSuite defaults.

## Confirmed Understanding

- Source system: Shopify
- Destination system: NetSuite
- Source record: Shopify refund, likely tied to a Shopify order
- Destination record: NetSuite Credit Memo plus refund transaction/application
- Direction: One-way, Shopify -> NetSuite
- Core behavior: Find Shopify refund, create matching NetSuite Credit Memo, then refund/apply it
- Line behavior: Must support partial item refunds at line level
- Out of scope: Taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments
- Trigger/cadence: Not confirmed
- Backfill scope: Not confirmed

## Suggested Workflow Shape

1. Poll Shopify for new/updated refunds since the last successful checkpoint.
2. For each refund, fetch the full Shopify order/refund details.
3. Check whether this Shopify refund was already synced to NetSuite.
4. Find the original NetSuite transaction for the Shopify order.
5. Match each refunded Shopify line to the corresponding NetSuite transaction line/item.
6. Build the Credit Memo lines using only Shopify refunded item quantities and item values.
7. Create the NetSuite Credit Memo.
8. Create/apply the NetSuite refund transaction against that Credit Memo.
9. Store Shopify refund ID, Shopify order ID, and NetSuite record IDs for idempotency.
10. Log success/failure and notify on records requiring manual review.

## Blocking Questions

### NetSuite Transaction Source

1. Should the Credit Memo be created from an existing NetSuite transaction or created standalone from scratch?
   Why it matters: A transformed Credit Memo can preserve customer, item, accounting, and original order context. A standalone Credit Memo requires us to map all required financial fields ourselves.
   Implementation impact: Defines whether Gravity searches and transforms an existing Invoice/Cash Sale/Sales Order-related transaction, or creates a new Credit Memo payload manually.

2. What NetSuite transaction represents the original Shopify sale today: Sales Order, Invoice, Cash Sale, or something else?
   Why it matters: The correct refund path depends on how the original Shopify order lands in NetSuite.
   Implementation impact: Determines which NetSuite record we search, which record can be credited, and whether the second step should be Customer Refund, Cash Refund, or another transaction flow.

   A: Sales Order

### Matching And Idempotency

3. What field should we use to find the original NetSuite order/transaction from Shopify?
   Why it matters: The workflow needs a stable key such as Shopify order ID, order name, external ID, or a custom NetSuite field.
   Implementation impact: Defines the lookup before creating any financial record.

   A: The order name in shopify is not unique, we need to use shopify order id

4. What field should uniquely identify a synced refund in NetSuite?
   Why it matters: Shopify can have multiple refunds for the same order, so order ID alone is not enough.
   Implementation impact: Recommended key is Shopify refund ID stored on both the Credit Memo and refund transaction, or in a mapping table.

   A: We should store the shopify refund id on the credit memo and refund transaction. We will also need a step that will loop through the refund requests for a given order, on this loop we will check if the refund request has already been processed by checking the existence by search the credit memo with the current refund id. If it has, we will skip it. If it hasn't, we will process it.

### Customer And Item Failures

5. What should happen if the NetSuite customer does not exist?
   Why it matters: Creating a Credit Memo/refund without the correct customer can post against the wrong AR/customer balance.
   Implementation impact: Choose one: fail for review, create customer first, or use a default customer. Failing is the safest default.

6. What should happen if a refunded SKU/item cannot be found in NetSuite?
   Why it matters: Creating a partial financial transaction with missing items can make NetSuite disagree with Shopify.
   Implementation impact: Recommended default: fail the entire refund before creating anything.

7. Is SKU the approved matching key for items, or should we use Shopify variant ID, Shopify line item ID, UPC, NetSuite item internal ID, or a custom item field?
   Why it matters: SKUs can change or be duplicated.
   Implementation impact: Defines line-level matching reliability.

### Item Refund Amounts

8. Should NetSuite use Shopify's refunded item line amount exactly, or should it calculate the amount from refunded quantity and NetSuite item rate?
   Why it matters: The confirmed scope is item value only, but we still need to know whether Shopify or NetSuite controls the refunded item amount.
   Implementation impact: Defines whether the Credit Memo line uses explicit Shopify amounts or relies on NetSuite line pricing.

   A: it should use shopify's refunded item line amount exactly.

### Defaults And Posting Rules

9. Do we have standard NetSuite defaults for subsidiary, division, class, department, location, currency, refund account, and payment method?
    Why it matters: NetSuite may require these fields, and defaults affect GL posting.
    Implementation impact: These values must be mapped from Shopify/store/order data or hardcoded by store/subsidiary.

10. What transaction date should be used in NetSuite: Shopify refund created date, processed date, or workflow run date?
    Why it matters: This affects posting period and reconciliation.
    Implementation impact: Defines `trandate` and possible posting-period behavior.

### Workflow Operations

11. Should this process include historical backfill or only refunds after go-live?
    Why it matters: Backfill has higher duplicate and data-quality risk.
    Implementation impact: Backfill should likely run separately with a fixed date range.

    A: Backfill up to a certain date from the moment the workflow is deployed.

12. How often should the workflow run?
    Why it matters: Gravity scheduled workflows have cadence constraints, and refunds may need near-real-time accounting visibility.
    Implementation impact: Determines schedule, checkpointing, and batch limits.

13. Who should receive failure notifications, and what information should be included?
    Why it matters: Missing customer/item/order cases need manual resolution.
    Implementation impact: Failure emails should include Shopify order ID, refund ID, SKU/line issue, and NetSuite lookup result.

## Suggested Assumptions To Confirm

- One Shopify refund should create one NetSuite Credit Memo and one NetSuite refund/application transaction. Confirmed.
- Shopify refund ID is the primary idempotency key. Confirmed.
- Shopify is the source of truth for refunded item quantities. Confirmed.
- The workflow only handles refunded item values. Taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments are intentionally out of scope. Confirmed
- If customer, original transaction, or any refunded item line cannot be matched, the workflow should fail before creating NetSuite records.
- Credit Memo should be created from the original NetSuite transaction when possible, not standalone.

## Build-Readiness Checklist

- [ ] Original NetSuite transaction type confirmed
- [ ] Credit Memo creation method confirmed: transform vs standalone
- [ ] Refund transaction type confirmed
- [ ] Shopify refund ID storage/idempotency confirmed
- [ ] Shopify order -> NetSuite transaction matching confirmed
- [ ] Customer missing behavior confirmed
- [ ] Item/SKU matching behavior confirmed
- [ ] Item refund amount source confirmed: Shopify item line amount vs NetSuite calculated rate
- [ ] Subsidiary/class/department/location/defaults confirmed
- [ ] Trigger/cadence confirmed
- [ ] Backfill scope confirmed
- [ ] Failure notification recipients confirmed
