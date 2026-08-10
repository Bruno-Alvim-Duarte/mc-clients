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
- Refund process: The Credit Memo `Refund` button creates a Customer Refund
- Customer Refund currency: US Dollar, internal ID `1`
- Customer Refund customer: Same customer as the Credit Memo
- Customer Refund custom form: Use NetSuite default
- Customer Refund account/payment method: Ask the client
- Line behavior: Must support partial item refunds at line level
- Out of scope: Taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments
- Item matching key: SKU after normalization with `split(':').pop().trim()` when Shopify sends a colon-delimited item path
- Missing customer behavior: Create the customer
- Missing item behavior: Skip and alert
- NetSuite transaction date: Shopify refund created date
- Trigger/cadence: Every 30 minutes
- Backfill scope: Backfill refunds from July 1, 2026 through deployment
- Mandatory NetSuite fields: Subsidiary, location, customer, and date

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

## Critical Reassessment Before Build

Status: Not build-ready yet.

The plan is close, but a few points should be closed before implementation starts. The biggest issue is the NetSuite transaction path. We know the original transaction is a Sales Order, but that does not automatically mean NetSuite can create a Credit Memo directly from the Sales Order.

### Build Blockers

1. Confirm the Credit Memo source path.
   Current answer: We need to ask the client whether the Credit Memo should be created from an existing record or standalone.

   Critical note: NetSuite's supported SuiteScript transformations show `Sales Order -> Return Authorization` and `Invoice -> Credit Memo`, but not direct `Sales Order -> Credit Memo`. If the original Shopify sale only exists as a Sales Order, the likely build path may need to be one of these:

   - Sales Order -> Return Authorization -> Credit Memo
   - Find the Invoice created from the Sales Order -> Credit Memo
   - Standalone Credit Memo

   Development should not start until this is confirmed, because it changes the record creation logic and the financial/inventory behavior.

2. Confirm Customer Refund account and payment method.
   Current answer: The Credit Memo `Refund` button creates a Customer Refund. Currency is US Dollar (`1`), customer is the same customer from the Credit Memo, and custom form can use the NetSuite default.

   Critical note: Customer Refund still needs an account and payment method. We need the client to confirm which account should be used and whether payment method should be a single default for all refunds or mapped from another Shopify/NetSuite value.

3. Mandatory NetSuite fields are now confirmed.
   Current rule: Mandatory fields for the transaction are subsidiary, location, customer, and date.

   Critical note: This no longer blocks requirements planning, but implementation should still respect any mandatory-field errors returned by NetSuite during testing.

### High-Risk Decisions To Keep Explicit

1. Missing SKU behavior is intentionally not exact-match in failure cases.
   Current answer: Skip the refunded line and alert.

   Risk: If a refund has two item lines and one SKU is missing, NetSuite will only reflect the matched item line. That means the NetSuite refund will not exactly match Shopify for that refund. This is acceptable only if the business intentionally prefers partial processing over blocking the entire refund.

2. Item-only scope excludes Shopify-level refund totals.
   Current answer: Taxes, shipping, discounts, duties, tips, gift cards, store credit, and order-level adjustments are out of scope.

   Risk: NetSuite will only match Shopify item refund values, not the full Shopify refund total when Shopify includes non-item refund components.

3. Customer creation should reuse the existing create-orders logic.
   Current answer: Create the customer if missing.

   Risk: Customer creation needs Shopify customer data. If the refund/order payload does not include enough customer data, the workflow must fetch the full Shopify order/customer before attempting customer creation.

### Technical Design Items To Resolve During Build

1. Shopify refund query strategy:
   - Use a 30-minute scheduled run.
   - Query orders/refunds updated or created since the last checkpoint.
   - Use Shopify refund ID for idempotency.
   - Use a small overlap window or cursor/tie-breaker so refunds sharing the same timestamp are not missed.

2. Refund loop shape:
   - Fetch orders with refund data.
   - Loop through each refund on each order.
   - Search NetSuite Credit Memos by Shopify refund ID.
   - Skip already-processed refunds.
   - Process only refunds without an existing NetSuite Credit Memo.

3. Line matching:
   - Match Shopify refunded line items to Shopify order line items.
   - Normalize SKU using `split(':').pop().trim()`.
   - Search NetSuite items using the normalized SKU.
   - Use Shopify refunded line amount exactly for the NetSuite item line amount.

4. Transformed record line handling:
   - If the Credit Memo is transformed from another NetSuite transaction, remove or zero out non-refunded lines.
   - Set only refunded quantities and Shopify refunded item values.
   - Validate whether NetSuite recalculates rates/taxes despite the item-only scope.

5. Logging and alerts:
   - Include Shopify order ID, Shopify order name, Shopify refund ID, Shopify refund created date, normalized SKU, NetSuite item lookup result, and NetSuite record IDs.
   - Send missing SKU/customer creation/refund creation failures to `AHosamani@appearancetg.com`.

### Minimum Development Gate

Do not start the Gravity build until these are done:

- [ ] Client confirms the Credit Memo source path.
- [ ] Client confirms Customer Refund account and payment method/defaulting behavior.
- [ ] We accept or revise the missing-SKU behavior knowing it breaks exact-match for affected refunds.

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

   A: The Credit Memo `Refund` button creates a Customer Refund. For the Customer Refund, currency will always be US Dollar (`1`), customer will be the same customer as the Credit Memo, and custom form can use the NetSuite default. We need to ask the client which account and payment method should be used.

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

    Mandatory NetSuite fields are subsidiary, location, customer, and date. Defaults that are not currently defined are not mandatory and should not be set for now.

    Customer Refund defaults:

    - Currency -> US Dollar, internal ID `1`
    - Customer -> same customer as the Credit Memo
    - Custom form -> NetSuite default
    - Account -> ask the client
    - Payment method -> ask the client whether to use one default for all refunds or map it from another value

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
- The Credit Memo `Refund` button creates a Customer Refund. Confirmed.
- Customer Refund currency should be US Dollar, internal ID `1`. Confirmed.
- Customer Refund customer should be the same customer as the Credit Memo. Confirmed.
- Customer Refund custom form can use the NetSuite default. Confirmed.
- Mandatory NetSuite fields are subsidiary, location, customer, and date. Confirmed.
- Undefined non-mandatory defaults should not be set for now. Confirmed.
- NetSuite transaction date should use Shopify refund created date. Confirmed.
- If the original NetSuite transaction cannot be found, the workflow should fail before creating NetSuite records.
- Credit Memo creation method still needs client confirmation: transform from an existing record vs standalone.

## Build-Readiness Checklist

- [x] Original NetSuite transaction type confirmed
- [ ] Credit Memo creation method confirmed: transform vs standalone
- [ ] Customer Refund account confirmed
- [ ] Customer Refund payment method confirmed
- [x] Shopify refund ID storage/idempotency confirmed
- [x] Shopify order -> NetSuite transaction matching confirmed
- [x] Customer missing behavior confirmed
- [x] Item/SKU matching behavior confirmed
- [x] Item refund amount source confirmed: Shopify item line amount vs NetSuite calculated rate
- [x] Subsidiary/location defaults confirmed
- [x] Optional defaults handling confirmed
- [x] Mandatory NetSuite fields confirmed
- [x] NetSuite transaction date confirmed
- [x] Trigger/cadence confirmed
- [x] Backfill scope confirmed
- [x] Failure notification recipients confirmed
