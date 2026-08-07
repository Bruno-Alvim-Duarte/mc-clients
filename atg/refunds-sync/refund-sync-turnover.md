# Shopify to NetSuite Refund Sync

## Turnover Readiness

Status: Not ready

Summary:
This workflow will sync Shopify refunds into NetSuite by creating a Credit Memo and then refunding/applying that credit in NetSuite. The workflow scope is limited to refunded item lines and item values only; taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments are out of scope. The main risk is line-level financial accuracy for partial item refunds and multiple refunds against the same order. The original NetSuite transaction type, matching rules, missing customer behavior, missing item behavior, refund amount source, transaction date, cadence, backfill cutoff, and default handling now have initial answers. The main remaining client confirmation is how the Credit Memo should be created.

## Confirmed Understanding

- Source system: Shopify
- Destination system: NetSuite
- Source record: Shopify refund, likely tied to a Shopify order
- Destination record: NetSuite Credit Memo plus refund transaction/application
- Direction: One-way, Shopify -> NetSuite
- Original NetSuite transaction: Sales Order
- Core behavior: Find Shopify refund, create matching NetSuite Credit Memo, then refund/apply it
- Refund process assumption: Use the `Refund` button/action available from the Credit Memo entity, pending Gravity/NetSuite action validation
- Line behavior: Must support partial item refunds at line level
- Out of scope: Taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments
- Item matching key: SKU after normalization with `split(':').pop().trim()` when Shopify sends a colon-delimited item path
- Missing customer behavior: Create the customer
- Missing item behavior: Skip and alert
- NetSuite transaction date: Shopify refund created date
- Trigger/cadence: Every 30 minutes
- Backfill scope: Backfill refunds from July 1, 2026 through deployment
- Optional NetSuite defaults: Do not set undefined defaults unless NetSuite requires them

## Suggested Workflow Shape

1. Poll Shopify for new/updated refunds since the last successful checkpoint.
2. For each refund, fetch the full Shopify order/refund details.
3. Check whether this Shopify refund was already synced to NetSuite.
4. Find the original NetSuite transaction for the Shopify order.
5. Match each refunded Shopify line to the corresponding NetSuite transaction line/item.
6. If the customer does not exist in NetSuite, create it.
7. If a refunded SKU cannot be found in NetSuite, skip that refunded line and send an alert.
8. Build the Credit Memo lines using only Shopify refunded item quantities and item values.
9. Create the NetSuite Credit Memo.
10. Create/apply the NetSuite refund transaction against that Credit Memo.
11. Store Shopify refund ID, Shopify order ID, and NetSuite record IDs for idempotency.
12. Log success/failure and notify on records requiring manual review.

## Blocking Questions

### NetSuite Transaction Source

1. Should the Credit Memo be created from an existing NetSuite transaction or created standalone from scratch?
   Why it matters: A transformed Credit Memo can preserve customer, item, accounting, and original order context. A standalone Credit Memo requires us to map all required financial fields ourselves.
   Implementation impact: Defines whether Gravity searches and transforms an existing Invoice/Cash Sale/Sales Order-related transaction, or creates a new Credit Memo payload manually.

   A: We need to ask the client.

2. What NetSuite transaction represents the original Shopify sale today: Sales Order, Invoice, Cash Sale, or something else?
   Why it matters: The correct refund path depends on how the original Shopify order lands in NetSuite.
   Implementation impact: Determines which NetSuite record we search, which record can be credited, and whether the second step should be Customer Refund, Cash Refund, or another transaction flow.

   A: Sales Order

3. After creating the Credit Memo, what NetSuite transaction/process should issue or apply the refund?
   Why it matters: The workflow must reproduce the correct NetSuite financial action after the Credit Memo exists.
   Implementation impact: Defines whether Gravity can use a NetSuite action equivalent to the Credit Memo `Refund` button, or whether a separate transaction create/apply step is needed.

   A: Assume we should use the `Refund` button/action available from the Credit Memo entity. This is an internal implementation assumption and should be validated against the available NetSuite/Gravity action.

### Matching And Idempotency

4. What field should we use to find the original NetSuite order/transaction from Shopify?
   Why it matters: The workflow needs a stable key such as Shopify order ID, order name, external ID, or a custom NetSuite field.
   Implementation impact: Defines the lookup before creating any financial record.

   A: The order name in shopify is not unique, we need to use shopify order id

5. What field should uniquely identify a synced refund in NetSuite?
   Why it matters: Shopify can have multiple refunds for the same order, so order ID alone is not enough.
   Implementation impact: Recommended key is Shopify refund ID stored on both the Credit Memo and refund transaction, or in a mapping table.

   A: We should store the shopify refund id on the credit memo and refund transaction. We will also need a step that will loop through the refund requests for a given order, on this loop we will check if the refund request has already been processed by checking the existence by search the credit memo with the current refund id. If it has, we will skip it. If it hasn't, we will process it.

### Customer And Item Failures

6. What should happen if the NetSuite customer does not exist?
   Why it matters: Creating a Credit Memo/refund without the correct customer can post against the wrong AR/customer balance.
   Implementation impact: Choose one: fail for review, create customer first, or use a default customer. Failing is the safest default.

   A: Create the customer.

7. What should happen if a refunded SKU/item cannot be found in NetSuite?
   Why it matters: Creating a partial financial transaction with missing items can make NetSuite disagree with Shopify.
   Implementation impact: Recommended default: fail the entire refund before creating anything.

   A: Skip the refunded line and alert.

8. Is SKU the approved matching key for items, or should we use Shopify variant ID, Shopify line item ID, UPC, NetSuite item internal ID, or a custom item field?
   Why it matters: SKUs can change or be duplicated.
   Implementation impact: Defines line-level matching reliability.

   A: Yes, SKU is the matching key, but it needs to be normalized. Sometimes Shopify can send a value like `blackInkRemover : whiteBrush : AG1020A`, where the actual SKU is the last segment. In this format, use `split(':').pop().trim()` before searching NetSuite.

### Item Refund Amounts

9. Should NetSuite use Shopify's refunded item line amount exactly, or should it calculate the amount from refunded quantity and NetSuite item rate?
   Why it matters: The confirmed scope is item value only, but we still need to know whether Shopify or NetSuite controls the refunded item amount.
   Implementation impact: Defines whether the Credit Memo line uses explicit Shopify amounts or relies on NetSuite line pricing.

   A: it should use shopify's refunded item line amount exactly.

### Defaults And Posting Rules

10. Do we have standard NetSuite defaults for subsidiary, division, class, department, location, currency, refund account, and payment method?
    Why it matters: NetSuite may require these fields, and defaults affect GL posting.
    Implementation impact: These values must be mapped from Shopify/store/order data or hardcoded by store/subsidiary.

    A: Yes. We have location and subsidiary maps.

    Location map:

    ```js
    var LOCATION_ID_MAP = {
      // 3D Car Care
      '62581768297':  '137',  // 3D Livonia Store
      '36941856873':  '170',  // 3D Shipping Room Ruether
      '102029197676': '3',    // 3D Shipping Warehouse Ruether
      '60931047529':  '193',  // Farmington Warehouse
      '64440139881':  '144',  // Trade Show - 3D

      // Hi-Tech Industries
      '405504027':    '206',  // Farmington Warehouse

      // P&S Detail Products
      '75113267437':  '192',  // P&S Farmington
      '75113169133':  '192',  // P&S Ruether

      // PRO Wax USA
      '66249818290':  '199',  // PRO Wax USA KY

      // 3D Detroit
      '89853329702':  '137',  // 33169 West 8 Mile Road
      '109228327281': '144',  // 3D Detroit Car Shows
      '101733007729': '160',  // 3D Livonia Plymouth
      '101733040497': '161',  // 3D Sterling Heights
    };
    ```

    Subsidiary map:

    - 3D Car Care -> `1`
    - 3D Detroit -> `1`
    - Hi-Tech Industries -> `2`
    - P & S Detail Products -> `5`
    - Pro Wax USA -> `6`

    For defaults that are not currently defined, do not set them unless NetSuite requires them.

11. What transaction date should be used in NetSuite: Shopify refund created date, processed date, or workflow run date?
    Why it matters: This affects posting period and reconciliation.
    Implementation impact: Defines `trandate` and possible posting-period behavior.

    A: Use Shopify refund created date.

### Workflow Operations

12. Should this process include historical backfill or only refunds after go-live?
    Why it matters: Backfill has higher duplicate and data-quality risk.
    Implementation impact: Backfill should likely run separately with a fixed date range.

    A: Backfill from July 1, 2026 through the moment the workflow is deployed.

13. How often should the workflow run?
    Why it matters: Gravity scheduled workflows have cadence constraints, and refunds may need near-real-time accounting visibility.
    Implementation impact: Determines schedule, checkpointing, and batch limits.

    A: Every 30 minutes.

14. Who should receive failure notifications, and what information should be included?
    Why it matters: Missing customer/item/order cases need manual resolution.
    Implementation impact: Failure emails should include Shopify order ID, refund ID, SKU/line issue, and NetSuite lookup result.

    A: annup AHosamani@appearancetg.com

## Suggested Assumptions To Confirm

- One Shopify refund should create one NetSuite Credit Memo and one NetSuite refund/application transaction. Confirmed.
- Shopify refund ID is the primary idempotency key. Confirmed.
- Shopify is the source of truth for refunded item quantities. Confirmed.
- The workflow only handles refunded item values. Taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments are intentionally out of scope. Confirmed
- If the customer does not exist, create it. Confirmed.
- If a refunded SKU cannot be found in NetSuite, skip the refunded line and alert. Confirmed.
- Refund process should use the `Refund` action available from the Credit Memo entity. Confirmed as implementation assumption, pending technical validation.
- Undefined NetSuite defaults should not be set unless NetSuite requires them. Confirmed.
- NetSuite transaction date should use Shopify refund created date. Confirmed.
- If the original NetSuite transaction cannot be found, the workflow should fail before creating NetSuite records.
- Credit Memo creation method still needs client confirmation: transform from an existing record vs standalone.

## Build-Readiness Checklist

- [x] Original NetSuite transaction type confirmed
- [ ] Credit Memo creation method confirmed: transform vs standalone
- [ ] Refund action/API validated against the Credit Memo `Refund` button behavior
- [x] Shopify refund ID storage/idempotency confirmed
- [x] Shopify order -> NetSuite transaction matching confirmed
- [x] Customer missing behavior confirmed
- [x] Item/SKU matching behavior confirmed
- [x] Item refund amount source confirmed: Shopify item line amount vs NetSuite calculated rate
- [x] Subsidiary/location defaults confirmed
- [x] Optional defaults handling confirmed
- [ ] Mandatory NetSuite defaults validated during implementation
- [x] NetSuite transaction date confirmed
- [x] Trigger/cadence confirmed
- [x] Backfill scope confirmed
- [x] Failure notification recipients confirmed
