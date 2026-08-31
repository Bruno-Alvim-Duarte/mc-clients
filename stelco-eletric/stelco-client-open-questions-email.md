## Email Draft — Stelco Open Integration Questions

**To:** Stelco Project Team  
**Subject:** Information Needed to Finalize ServiceTitan to Spectrum Integrations

Hello Stelco Team,

Thank you for the clarifications already provided. We have incorporated them into the design for the Customer, Payment, and Customer Invoice integrations between ServiceTitan and Viewpoint Spectrum.

To finalize the remaining mappings, please provide the information below. We combined questions that apply to multiple integrations to avoid duplicate requests.

When sharing the requested mapping information, it would be helpful to include (or point us to) the identifier used for the relevant item in each system, in addition to its name.

For example, for a Business Unit mapping, the helpful references are the `ServiceTitan Business Unit ID + Name` and the corresponding `Spectrum Income Cost Center Code + Description`. This lets us connect the intended records reliably, even when names are similar or change.

### Shared configuration

1. What single Spectrum `Company_Code` should be used for all Customers, Cash Receipts, and AR Customer Invoices? For Cash Receipts, should the integration explicitly send that value, or should it use the default from the Spectrum Authorization ID?

2. Please confirm the failure-notification recipients. Should `aturner@stelco-electric.com` receive all failure emails, only selected exception types, or should other contacts be included?

3. Please provide the Spectrum tax-zone ID/code (`Sales_Tax_Code`) configured for the tax zone equivalent to ServiceTitan's **In-House Sales** tax zone. This code will be used by the Customer and Customer Invoice integrations.

### Customer synchronization

1. When the integration-owned `externalData` value is blank, please approve the exact Spectrum Customer Code fallback rule: the source first/last-name fields, punctuation and whitespace treatment, uppercase conversion, 10-character treatment, and collision handling. If a collision suffix is needed, may we derive it from the ServiceTitan Customer ID?

2. Please provide the mapping from every ServiceTitan `paymentTermId` and term name to the corresponding Spectrum `Terms_Code` and description, including the required fallback for missing or unmapped terms.

3. Please confirm the customer-update ownership model: which fields should ServiceTitan overwrite in Spectrum, and which manually maintained Spectrum fields must always be preserved? In particular, please confirm the intended behavior when a mapped ServiceTitan field is blank.

### Payment synchronization / Cash Receipts

1. Please confirm the required Spectrum Cash Receipt header/detail structure for a payment applied to multiple invoices. Can all invoice applications be sent in one Cash Receipt request, and which customer code should be supplied on the receipt?

2. Please confirm that the sum of all applied amounts must equal the payment total. If it does not, should the whole payment be skipped and warned rather than creating a partial payment, overpayment, or prepayment?

### Customer Invoice synchronization

1. Please provide the ServiceTitan Business Unit ID and name to Spectrum `Income_Cost_Center` code and description mapping, including the expected behavior for a blank or unmapped Business Unit.

2. Please provide the approved GL-account mapping list. For each ServiceTitan GL account ID/name, identify the corresponding Spectrum `GL_Account` code/description and confirm the behavior when there is no match.

3. For multi-line invoices, how should the invoice-level ServiceTitan tax amount be represented in Spectrum so it is not repeated on every detail line? Please provide an approved example payload or tax-allocation rule.

4. For credit memos, please confirm the approved handling for line amounts, sales-tax amounts, discounts, adjustments, zero-value items, and rounding, including whether values must be sent as positive amounts with `Transaction_Type = C`.

5. What should happen when a source invoice number, description, remark, or GL account exceeds the Spectrum field limit? Please confirm whether the value should be truncated, transformed, or skipped for review. Invoice-number handling must preserve uniqueness.

Please reply inline where convenient, or send the requested mapping files as attachments. Once we receive these items, we can finalize the build.

Thank you,

MindCloud Integration Team
