# MC-21735 - Amazon FBA to NetSuite FBA Invoice Sync Turnover

## Turnover Readiness

Status: Mostly ready with remaining mapping confirmations

Summary:
This is a scheduled Amazon FBA to NetSuite workflow that should create one NetSuite Invoice per shipped FBA order under the default `Amazon Customer`. Most operational decisions are now confirmed: marketplace scope, shipped-only filter, limited go-live/backfill window, Amazon Orders API amounts, SKU item matching, Amazon Order ID duplicate prevention, existing-invoice skip behavior, retry behavior, email recipients, cadence, and NetSuite defaults. The main remaining gaps are the final invoice sample/field mapping and how to represent discounts, promotions, shipping, gift wrap, and tax lines.

## Confirmed Understanding

- Source system: Amazon FBA / Amazon orders
- Destination system: NetSuite
- Source record: shipped FBA order
- Destination record: NetSuite Invoice with invoice lines
- Direction: Amazon to NetSuite
- Trigger/cadence: scheduled polling
- Schedule: every 30 minutes
- Customer: default NetSuite customer `9561387706 Amazon Customer`
- NetSuite customer link: <https://445393.app.netsuite.com/app/common/entity/custjob.nl?id=3793910>
- Current skip rule: if items are missing/mismatched, do not create invoice and alert Lionel Trains
- Amazon region: North America
- Amazon marketplaces: all marketplaces available inside the existing American Amazon connection
- Amazon account/connection: already connected; no additional account discovery needed
- NetSuite defaults: subsidiary `4`, division `4`, class `38`, location `32`
- Failure and mismatch email recipients: `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`

## Blocking Questions

### Amazon Source And Filters

1. Which exact Amazon account, marketplace(s), and region(s) should be included?

   Answer: Region is North America. Include all marketplaces inside the existing American Amazon connection. The Amazon account does not need additional discovery because the connection is already configured.

   Why it matters: FBA orders, currency, tax, and item identifiers can differ by marketplace.

   Implementation impact: Defines Amazon credentials, query filters, currency handling, and NetSuite subsidiary/location defaults.

2. What does "recently updated shipped orders" mean exactly: status `Shipped` only, or also `PartiallyShipped`, canceled-after-shipment, refunded, or replaced orders?

   Answer: `Shipped` only.

   Why it matters: Updated orders may include post-shipment changes that should not always create invoices.

   Implementation impact: Defines Amazon query filters and whether later updates trigger skip, update, or alert behavior.

3. Should this process only new orders after go-live, or is a historical backfill required?

   Answer: Process only new orders, with possible limited backfill of a few days or weeks before go-live. Do not process all historical data.
   
   Why it matters: Backfill changes checkpoint setup, batch volume, and validation risk.
   
   Implementation impact: Determines memory initialization, date filters, and whether a separate backfill run is needed.

### Invoice Mapping

4. Can the client provide the sample invoice and approve the field mapping for header and line fields?

   Answer: Sample invoice is not available yet. For now, assume the invoice mapping is similar to an order. Known default fields:
   - Subsidiary: `4`
   - Division: `4`
   - Location ID: `32`

   Why it matters: The ticket says the client will provide a sample invoice, but it is not attached in Linear.
   Implementation impact: Blocks payload construction for invoice date, memo, external ID, subsidiary, currency, custom form, department/class/location, tax, shipping, discounts, and line amounts.

5. Which Amazon values should drive invoice amounts: Amazon Orders API line amounts, Amazon reports, settlement data, or the sample invoice format?

   Answer: Use Amazon Orders API line amounts.

   Why it matters: Amazon order data and settlement/financial data can differ, especially for tax, discounts, shipping, gift wrap, and fees.
   Implementation impact: Determines whether one Amazon API call is enough or whether additional reports/financial endpoints are required.

### Item Matching

6. How should Amazon items be matched to NetSuite items: Seller SKU, ASIN, UPC, NetSuite item name/number, or a custom field?

   Answer: Match by SKU.

   Why it matters: Item matching is the highest-risk part of creating accurate invoice lines.
   Implementation impact: Defines NetSuite lookup logic and whether SuiteScript/custom search is needed.

7. For discounts, promotions, shipping, gift wrap, and tax lines, should these be separate NetSuite items, accounts, or ignored?

   Answer: Open. This has not been aligned yet.

   Why it matters: Invoice totals will not match Amazon if these components are not mapped.
   Implementation impact: Defines line item construction and required fallback items/accounts.

### Duplicate Prevention And Updates

8. What unique key should be stored on the NetSuite invoice to prevent duplicates: Amazon Order ID as External ID, a custom field, memo, or another value?

   Answer: Use Amazon Order ID as the NetSuite invoice External ID.

   Why it matters: Scheduled polling of recently updated orders can encounter the same order multiple times.
   Implementation impact: Requires a NetSuite search before create, likely through Execute Custom Code/SuiteScript.

9. If an invoice already exists for the Amazon order, should the workflow skip it, update it, or alert for review?

   Answer: Skip it.

   Why it matters: Updated Amazon orders after initial creation need a clear business rule.
   Implementation impact: Defines create-only versus create/update branching.

### Retry, Logs, And Alerts

10. Who exactly should receive error emails and item mismatch alerts?

    Answer: `bruno@mindcloud.co`, `AMiller@lionel.com`, `jjones@lionel.com`

    Why it matters: "Alert Lionel Trains" is not enough to configure operational notifications.
    Implementation impact: Required for Gravity flow-control email recipients and failure handling.

11. How should "retry memory" work for skipped orders: retry every run until resolved, retry for a limited number of attempts, or retry only after manual reset?

    Answer: Retry every run until resolved.

    Why it matters: Persistent item mismatches can create repeated alerts or permanently stuck records.
    Implementation impact: Defines memory keys, retry counters, skip logs, and alert frequency.

## Follow-Up Questions

### Volume And Schedule

1. What schedule should the workflow use, and what is the acceptable delay from Amazon shipment to NetSuite invoice creation?

   Answer: Every 30 minutes.

2. What are expected daily and peak shipped order volumes?

   Answer: Do not worry about this yet.

### NetSuite Defaults

3. Which NetSuite defaults should be applied if not present from Amazon: subsidiary, location, department, class, terms, custom form, and posting period?

   Answer:
   - Class: `38`
   - Subsidiary: `4`
   - Division: `4`
   - Location ID: `32`

4. Can test invoices be created in NetSuite sandbox, and who will approve the final test invoice output?

   Answer: Yes. Ari and Jeff will approve.

## Suggested Assumptions To Confirm

- Use one NetSuite Invoice per Amazon order.
- Use the default NetSuite customer for all invoices.
- Validate all invoice items before creating the invoice; if any item does not match, skip the entire order.
- Use Amazon Order ID as the duplicate-prevention key.
- Use scheduled polling with a memory checkpoint based on Amazon last-updated timestamp plus a tie-breaker.
- Since no sample invoice is available yet, start with an order-like invoice payload and the confirmed NetSuite defaults, then revise once the sample invoice is received.
- Retry skipped/mismatched orders every run until the mismatch is resolved.

## Build-Readiness Checklist

- [ ] Sample invoice received and mapping approved
- [x] Amazon marketplace/account filters confirmed
- [x] Source status/date filters confirmed
- [x] Backfill scope confirmed
- [x] Item matching key and mismatch behavior confirmed
- [ ] Tax/shipping/discount/promotion handling confirmed
- [x] NetSuite invoice defaults confirmed
- [x] Idempotency key and existing-invoice behavior confirmed
- [x] Retry memory behavior confirmed
- [x] Failure email recipients confirmed

Pontos pra melhorar (workflow inicial ja construido):
- O Retry ta setando na memoria uma key por retry, eu quero um array que vai conter todos os records que precisam de retry. Lembrando que pra usar array com memoria pra ler é necessário fazer JSON.parse por que vem em string, para setar o sistema automaticamente faz o stringify
- Sempre usa o email step em vez de usar o flow control para enviar os emails. Deveria usar flow control com a opção de enviar email habilitado
- Step 4 não aceita varios order Ids, vamos precisar fazer um loop pelas orders que precisam de retry, dentro desse loop iremos fazer um get Order único, e iremos adicionar as informações desse resultado a um outro item na memória que será usado pra mergiar com os current orders e deduplicar
