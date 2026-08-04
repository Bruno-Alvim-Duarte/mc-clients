var LOCATION_MAP = {
  '3D Accurate Freight Systems':       '190',
  '3D Chemical Compounding Warehouse': '216',
  '3D Farmington Internet Orders':     '193',
  '3D FLORENCE KY':                    '202',
  '3D Livonia Plymouth':               '160',
  '3D Livonia Store':                  '137',
  '3D Michigan Shipping Warehouse':    '217',
  '3D Netherlands Shipping Warehouse': '16',
  '3D Shipping Room Ruether Ave':      '170',
  '3D Shipping Warehouse Ruether Ave': '3',
  '3D Sterling Heights':               '161',
  '3D TOC Ontario':                    '209',
  '3D Warehouse Santa Clarita':        '4',
  'American Jetway':                   '120',
  'Anchor Wiping':                     '165',
  'BAF California':                    '153',
  'BAF Farmington':                    '218',
  'BAF Internet Orders':               '199',
  'BAF Kentucky':                      '155',
  'Champions Forever':                 '119',
  'CHEMPAK SOLUTIONS':                 '134',
  'CORYDON CONVERTING':                '168',
  'Drop Ship':                         '6',
  'ECLIPSE PRINT EMPORIUM':            '139',
  'FARMINGTON':                        '20',
  'FOAM FACTORY INC.':                 '149',
  "Foam N' More":                      '123',
  'Go Global':                         '162',
  'HT - DETROIT (RBL)':                '138',
  'HT C/O TOC Logistics - Calgary':    '196',
  'HT Farmington Internet Orders':     '206',
  'HT Ferry Court':                    '26',
  'HT FLORENCE KY':                    '201',
  'HT Santa Clarita Warehouse':        '124',
  'HT SHOWS - Old':                    '121',
  'In Transit Inventory':              '7',
  'INHANCE TECHNOLOGIES':              '122',
  'NEWTON BROOM & BRUSH':              '21',
  'OFF SITE - IN PROCESS':             '25',
  'P&S DMGD':                          '182',
  'P&S Europe':                        '185'
};

var SHIPMETHOD_ID_MAP = {
  // Standard / Generic
  'Free Shipping':                                 '3663',
  'Economy':                                       '3663',
  'Standard Shipping':                             '3663',
  'Free Economy':                                  '3662',
  // USPS
  'USPS':                                          '3941',
  'USPS (Discounted rates from Shopify Shipping)': '3941',
  'Priority Mail':                                 '3941',
  'First Class Mail':                              '3941',
  'USPS First-Class Mail':                         '3941',
  'USPS Priority Mail':                            '3941',
  // UPS
  'UPS® Ground':                                   '3663',
  'UPS 2nd Day Air A.M.®':                         '3675',
  'UPS 2nd Day Air®':                              '3676',
  'UPS 3 Day Select®':                             '3677',
  'UPS Next Day Air Saver®':                       '3678',
  'UPS Next Day Air®':                             '3679',
  'UPS Next Day Air® Early A.M.®':                 '3680',
  'UPS® Standard':                                 '3685',
  'UPS Saver':                                     '3684',
  'UPS Worldwide Expedited®':                      '3681',
  'UPS Worldwide Express Plus®':                   '3682',
  'UPS Worldwide Express®':                        '3683',
  // FedEx
  'FedEx':                                         '3',
  'FedEx Ground':                                  '30825',
  'FedEx 2 Day':                                   '46382',
  'FedEx Express Saver':                           '46383',
  'FedEx Home Delivery':                           '30826',
  'FedEx Priority Overnight':                      '46386',
  'FedEx Standard Overnight':                      '46387',
  // Other carriers
  'DHL':                                           '3942',
  'TNT':                                           '3943',
  'Airborne':                                      '2',
  // Delivery types
  'Expedited Shipping':                            '3672',
  'Expedited':                                     '3672',
  'One-Day Delivery':                              '3665',
  'Two-Day Delivery':                              '3664',
  'Same-Day Delivery':                             '3671',
  'Scheduled':                                     '3673',
  // Pickup
  'Will Call':                                     '3781',
  'Customer Pick Up':                              '3782',
  'Pickup':                                        '3782',
  // Freight / Special
  'LTL Freight':                                   '3783',
  'LCL':                                           '3829',
  'FCL':                                           '3830',
  'Ocean':                                         '4003',
  'FBA':                                           '3666',
};

// Custom form para lojas POS — subsidiaries 1 e 2 só recebem form 95 quando sourceName === 'pos'
var CUSTOM_FORM_POS_MAP = {
  '1': '95',
  '2': '95',
};

// Custom form hardcoded por subsidiary — independente de sourceName
var CUSTOM_FORM_MAP = {
  '5': '257',
  '6': '241',
};

// Gateway Shopify POS → nome do Payment Method no NetSuite
// CONFIRMAR nomes exatos em: NS > Setup > Accounting > Payment Methods
var PAYMENT_METHOD_MAP = {
  'cash':             'Cash',
  'manual':           'Cash',
  'shopify_payments': 'Credit Card',
  'pos':              'Credit Card',
  'paypal':           'PayPal',
  'gift_card':        'Gift Certificate',
  'default':          'Cash',
};

// Shopify risk recommendation → internal ID da lista Risk Rating no NS
var RISK_RATING_MAP = {
  'CANCEL':      '1',  // High
  'INVESTIGATE': '2',  // Medium
  'ACCEPT':      '3',  // Low
};

// Shopify Store ID → internal ID da lista Shopify Store no NS
var SHOPIFY_STORE_MAP = {
  '29604315241': '1',   // 3D Car Care
  '81046241574': '102', // 3D Detroit
  '23189273':    '2',   // Hi-Tech Industries (NEW)
  '31706316932': '202', // P & S Detail Products
  '61092921522': '302', // PRO® Wax USA
};

var C = {
  SUBSIDIARY_ID:       ${JSON.stringify(input['workflowArguments'].subsidiary)},
  RECORD_TYPE:         ${JSON.stringify(input['workflowArguments'].recordType || 'salesorder').toLowerCase()},
  CURRENCY_ID:         '1',
  PRICE_LEVEL:         '-1',
  ETAIL_CHANNEL:       'Shopify',
  PENDING_FULFILLMENT: 'Pending Fulfillment',
  LINE_UNITS:          1,
  SHOPIFY_STORE_ID:    ${JSON.stringify(input['workflowArguments'].shopifyStoreId)},
  DISCOUNT_ITEM_ID:        '3803', // item tipo Discount no NS — confirmado via output Celigo
  SHIPPING_ITEM_ID:        '7239', // Non-inventory Item for Sale para frete — evita Avalara no shipping
  CASH_SALE_CUSTOMER_ID:   '556024', // 3D Detroit POS default customer — usado em todos os Cash Sales
};

var isCashSale = String(C.SUBSIDIARY_ID) === '1' && C.RECORD_TYPE === 'cashsale';

function shopMoney(priceSet) {
  return priceSet && priceSet.shopMoney ? parseFloat(priceSet.shopMoney.amount) || 0 : 0;
}

function gidToNumeric(gid) {
  return gid ? String(gid).split('/').pop() : null;
}

function safeDate(value) {
  if (!value) return new Date();
  var d = new Date(value);
  if (isNaN(d.getTime())) throw new Error('Invalid order date: ' + value);
  return d;
}

var SUBSIDIARY_DEFAULT_LOCATION = {
  '2': '206',
  '5': '192',
  '6': '199',
};

var LOCATION_ID_MAP = {
  // 3D Car Care
  '62581768297':  '137',  // 3D Livonia Store
  '36941856873':  '170',  // 3D Shipping Room Ruether
  '102029197676': '3',    // 3D Shipping Warehouse Ruether
  '60931047529':  '193',  // Farmington Warehouse
  '64440139881':  '144',  // Trade Show - 3D — confirmar ID no NetSuite

  // Hi-Tech Industries
  '405504027':    '206',  // Farmington Warehouse

  // P&S Detail Products
  '75113267437':  '192',  // P&S Farmington
  '75113169133':  '192',  // P&S Ruether

  // PRO® Wax USA
  '66249818290':  '199',  // PRO Wax USA KY

  // 3D Detroit
  '89853329702':  '137',  // 33169 West 8 Mile Road
  '109228327281': '144',  // 3D Detroit Car Shows — confirmar ID no NetSuite
  '101733007729': '160',  // 3D Livonia Plymouth
  '101733040497': '161',  // 3D Sterling Heights
};

function resolveLocation(gid, name) {
  var numericId = gidToNumeric(gid);
  if (numericId && LOCATION_ID_MAP[numericId]) return LOCATION_ID_MAP[numericId];
  if (!name) return null;
  if (LOCATION_MAP[name]) return LOCATION_MAP[name];
  var keys = Object.keys(LOCATION_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(name) !== -1 || name.indexOf(keys[i]) !== -1) return LOCATION_MAP[keys[i]];
  }
  return null;
}

function resolveShipMethod(shopifyTitle) {
  if (!shopifyTitle) return null;
  var id = SHIPMETHOD_ID_MAP[shopifyTitle];
  if (id) return id;
  var keys = Object.keys(SHIPMETHOD_ID_MAP);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i].indexOf(shopifyTitle) !== -1 || shopifyTitle.indexOf(keys[i]) !== -1) {
      return SHIPMETHOD_ID_MAP[keys[i]];
    }
  }
  return null;
}

function resolvePaymentMethod(gateway) {
  var nsName = (gateway && PAYMENT_METHOD_MAP[gateway])
    ? PAYMENT_METHOD_MAP[gateway]
    : PAYMENT_METHOD_MAP['default'];

  var found = search.create({
    type: 'paymentmethod',
    filters: [['name', search.Operator.IS, nsName]],
    columns: ['internalid']
  }).run().getRange({ start: 0, end: 1 });

  return found.length > 0 ? found[0].getValue({ name: 'internalid' }) : null;
}

function normalizeSku(value) {
  return String(value || '').trim();
}

function extractSku(itemId) {
  var parts = String(itemId || '').split(' : ');
  return parts[parts.length - 1].trim();
}

var result = { success: true };

try {
  var order = ${JSON.stringify(input['map6PV3'][0].data.order)};

  if (!order) throw new Error('Invalid Input: order is obrigatory.');

  var shopifyCustomerId = order.customer && order.customer.id
    ? String(order.customer.id).split('/').pop()
    : null;

  var customerInternalId;

  if (isCashSale) {
    // Cash Sale (3D Detroit POS): sempre usa o customer padrão, independente do customer do pedido
    customerInternalId = C.CASH_SALE_CUSTOMER_ID;
  } else {
    if (!shopifyCustomerId) {
      throw new Error('Order ' + order.legacyResourceId + ' with no customer — unable to create record.');
    }

    var custSearch = search.create({
      type: search.Type.CUSTOMER,
      filters: [
        ['custentity_celigo_etail_cust_id', search.Operator.IS, shopifyCustomerId],
        'AND',
        ['isinactive', search.Operator.IS, 'F'],
        'AND',
        ['subsidiary', search.Operator.ANYOF, [String(C.SUBSIDIARY_ID)]]
      ],
      columns: ['internalid']
    }).run().getRange({ start: 0, end: 1 });

    if (custSearch.length === 0) {
      throw new Error('Customer not found in NetSuite for Shopify ID ' + shopifyCustomerId + ' — run customer sync step first.');
    }

    customerInternalId = custSearch[0].getValue({ name: 'internalid' });
  }

  var legacyId     = order.legacyResourceId;
  var billingAddr  = order.billingAddress  || {};
  var shippingAddr = isCashSale
    ? {
        name:          'Shopify - 3D Detroit',
        address1:      '33106 W 8 Mile Road',
        city:          'Farmington',
        provinceCode:  'MI',
        zip:           '48336',
        countryCodeV2: 'US',
      }
    : (order.shippingAddress || {});
  var lineEdges    = order.lineItems && Array.isArray(order.lineItems.edges) ? order.lineItems.edges : [];
  var fulfillments = order.fulfillments    || [];
  var tagsStr      = Array.isArray(order.tags) ? order.tags.join(', ') : (order.tags || '');

  if (order.displayFinancialStatus !== 'PAID') {
    throw new Error(
      'Order ' + legacyId + ' Ignored — Financial status: ' + order.displayFinancialStatus
    );
  }

  // --- Idempotência --- //
  var idempotencyFilters = isCashSale
    ? [
        ['custbody_celigo_etail_order_id', search.Operator.IS, String(legacyId)],
        'AND',
        ['mainline', search.Operator.IS, 'T']
      ]
    : [
        ['custbody_celigo_etail_order_id', search.Operator.IS, String(legacyId)],
        'AND',
        ['mainline', search.Operator.IS, 'T'],
        'AND',
        ['status', search.Operator.ANYOF, ['SalesOrd:A', 'SalesOrd:B', 'SalesOrd:D', 'SalesOrd:F']]
      ];

  var existing = search.create({
    type: isCashSale ? 'cashsale' : search.Type.SALES_ORDER,
    filters: idempotencyFilters,
    columns: ['internalid', 'tranid']
  }).run().getRange({ start: 0, end: 1 });

  if (existing.length > 0) {
    result.recordId     = existing[0].getValue({ name: 'internalid' });
    result.recordNumber = existing[0].getValue({ name: 'tranid' });
    result.recordType   = isCashSale ? 'cashsale' : 'salesorder';
    result.duplicate    = true;
  } else {
    var locationId = null;
    var foNodes = (order.fulfillmentOrders && order.fulfillmentOrders.nodes) || [];

    if (foNodes.length > 0 && foNodes[0].assignedLocation && foNodes[0].assignedLocation.location) {
      locationId = resolveLocation(
        foNodes[0].assignedLocation.location.id,
        foNodes[0].assignedLocation.location.name
      );
    }

    if (!locationId) {
      for (var f = 0; f < fulfillments.length; f++) {
        if (fulfillments[f].location) {
          locationId = resolveLocation(fulfillments[f].location.id, fulfillments[f].location.name);
          if (locationId) break;
        }
      }
    }

    if (!locationId && SUBSIDIARY_DEFAULT_LOCATION[String(C.SUBSIDIARY_ID)]) {
      locationId = SUBSIDIARY_DEFAULT_LOCATION[String(C.SUBSIDIARY_ID)];
    }

    var skuMap        = {};
    var itemUomStatus = {}; // internalId → unit ID string to use | 'skip' (sem units field)
    var skusNeeded = lineEdges
      .map(function(edge) { return edge && edge.node ? normalizeSku(edge.node.sku) : ''; })
      .filter(function(sku) { return !!sku; });

    var uniqueSkus = skusNeeded.filter(function(sku, index) {
      return skusNeeded.indexOf(sku) === index;
    });

    if (uniqueSkus.length === 0) throw new Error('No SKU found on order lines ' + legacyId + '.');

    var skuFilters = [];
    uniqueSkus.forEach(function(sku, index) {
      if (index > 0) skuFilters.push('OR');
      skuFilters.push(['itemid', search.Operator.IS, normalizeSku(sku)]);
    });

    search.create({
      type: search.Type.ITEM,
      filters: [skuFilters, 'AND', ['isinactive', search.Operator.IS, 'F']],
      columns: ['internalid', 'itemid', 'displayname', 'parent', 'unitstype', 'stockunit', 'purchaseunit', 'saleunit', 'consumptionunit']
    }).run().getRange({ start: 0, end: 1000 }).forEach(function(r) {
      var id          = r.getValue({ name: 'internalid' });
      var unitstypeId = r.getValue({ name: 'unitstype' });
      var hasUom      = !!unitstypeId;

      var unitToUse = 'skip';

      if (hasUom) {
        if (String(unitstypeId) === '1') {
          // Unit group 1 neste ambiente → unidade Each = ID '1'
          unitToUse = '1';
        } else {
          // Busca nos primary unit fields por um cujo nome seja exatamente 'EACH'
          var primaryFields = ['stockunit', 'purchaseunit', 'saleunit', 'consumptionunit'];
          for (var p = 0; p < primaryFields.length; p++) {
            if (r.getText({ name: primaryFields[p] }) === 'EACH') {
              var foundId = r.getValue({ name: primaryFields[p] });
              if (foundId) { unitToUse = String(foundId); break; }
            }
          }
          // Se nenhum primary field for 'EACH': marca como 'default' → NS usa saleunit configurado
          // 'default' é distinto de 'skip' (sem UOM) — permite reportar essas SKUs no result
          if (unitToUse === 'skip') unitToUse = 'default';
        }
      }

      skuMap[extractSku(r.getValue({ name: 'itemid' }))] = id;
      itemUomStatus[id] = unitToUse;
    });

    var missing = uniqueSkus.filter(function(sku) { return !skuMap[normalizeSku(sku)]; });
    if (missing.length > 0) throw new Error('SKUs not found on NetSuite: ' + missing.join(', '));

    var totalPrice   = shopMoney(order.totalPriceSet);
    var shippingCost = shopMoney(order.totalShippingPriceSet);
    var poNum        = '#' + order.number;
    var memo         = 'Shopify - ' + (order.note || order.name);
    var contactEmail = order.email || order.contactEmail || '';

    // isDynamic: false — sem field events nas linhas; rate e amount ficam exatamente o que setamos
    var txRecord = record.create({
      type: isCashSale ? 'cashsale' : record.Type.SALES_ORDER,
      isDynamic: false
    });

    // Custom form: hardcoded para subsidiaries 5/6; POS-only para subsidiaries 1/2
    var subsidStr    = String(C.SUBSIDIARY_ID);
    var customFormId = CUSTOM_FORM_MAP[subsidStr]
      || (order.sourceName === 'pos' ? CUSTOM_FORM_POS_MAP[subsidStr] : null);
    if (customFormId) txRecord.setValue({ fieldId: 'customform', value: customFormId });

    txRecord.setValue({ fieldId: 'entity',     value: customerInternalId });
    txRecord.setValue({ fieldId: 'subsidiary', value: C.SUBSIDIARY_ID });
    txRecord.setValue({ fieldId: 'currency',   value: C.CURRENCY_ID });
    txRecord.setValue({ fieldId: 'trandate',   value: safeDate(order.createdAt) });

    var shipDateSrc = fulfillments.length > 0 && fulfillments[0].createdAt
      ? fulfillments[0].createdAt
      : order.createdAt;

    txRecord.setValue({ fieldId: 'custbody6',   value: safeDate(shipDateSrc) });
    txRecord.setValue({ fieldId: 'otherrefnum', value: poNum });
    txRecord.setValue({ fieldId: 'externalid',  value: 'SHPF-' + C.SHOPIFY_STORE_ID + '-' + String(legacyId) });
    txRecord.setValue({ fieldId: 'memo',        value: memo });
    txRecord.setValue({ fieldId: 'email',       value: contactEmail });
    txRecord.setValue({ fieldId: 'tobeemailed',                      value: false });
    txRecord.setValue({ fieldId: 'custbody_celigo_etail_channel',    value: '101' });
    txRecord.setValue({ fieldId: 'custbody_celigo_shopify_store_id', value: C.SHOPIFY_STORE_ID });
    var nsStoreId = SHOPIFY_STORE_MAP[String(C.SHOPIFY_STORE_ID)];
    if (nsStoreId) txRecord.setValue({ fieldId: 'custbody_celigo_shopify_store', value: nsStoreId });
    txRecord.setValue({ fieldId: 'istaxable', value: true });
    txRecord.setValue({ fieldId: 'location',  value: locationId });

    // shipmethod antes de shippingcost — em dynamic mode o NS recalcularia o frete ao setar shipmethod;
    // mantida a ordem correta mesmo em isDynamic: false por consistência
    var shippingTitle = order.shippingLines && order.shippingLines.nodes && order.shippingLines.nodes.length > 0
      ? order.shippingLines.nodes[0].title
      : null;

    var shipMethodId = resolveShipMethod(shippingTitle);
    if (shipMethodId) txRecord.setValue({ fieldId: 'shipmethod',    value: shipMethodId });
    txRecord.setValue({ fieldId: 'shippingcost', value: 0 }); // frete vai como line item (item 7239) para evitar Avalara no shipping

    txRecord.setValue({ fieldId: 'custbody_celigo_etail_order_id',    value: String(legacyId) });
    txRecord.setValue({ fieldId: 'custbody_celigo_shopify_order_no',  value: String(order.number) });
    txRecord.setValue({ fieldId: 'custbody_celigo_shpfy_updatedtime', value: safeDate(order.updatedAt) });
    txRecord.setValue({ fieldId: 'custbody_celigo_etail_order_date',  value: safeDate(order.createdAt) });

    if (order.risk && order.risk.recommendation) {
      var riskFacts = [];
      (order.risk.assessments || []).forEach(function(assessment) {
        (assessment.facts || []).forEach(function(fact) {
          if (fact.description) riskFacts.push(fact.description);
        });
      });
      var riskRatingId = RISK_RATING_MAP[order.risk.recommendation];
      if (riskRatingId) txRecord.setValue({ fieldId: 'custbody_celigo_etail_risk_rating',   value: riskRatingId });
      if (riskFacts.length > 0) txRecord.setValue({ fieldId: 'custbody_celigo_etail_risk_analysis', value: riskFacts.join('; ') });
    }

    var shpfyTxIds = [];
    var giftCardId = null;

    (order.transactions || []).forEach(function(t) {
      if (t.status !== 'SUCCESS') return;
      shpfyTxIds.push(gidToNumeric(t.id));
      if (t.gateway === 'gift_card' && t.receiptJson && !giftCardId) {
        try {
          var receipt = JSON.parse(t.receiptJson);
          giftCardId = receipt.gift_card_id || receipt.id || null;
        } catch (e) {}
      }
    });

    if (shpfyTxIds.length > 0) {
      txRecord.setValue({ fieldId: 'custbody_celigo_shpfy_transaction_ids', value: shpfyTxIds.join(', ') });
      txRecord.setValue({ fieldId: 'custbody_celigo_etail_transaction_ids', value: shpfyTxIds.join(', ') });
    }
    if (giftCardId) txRecord.setValue({ fieldId: 'custbody_celigo_shopify_giftcard_id', value: String(giftCardId) });

    var discountCode  = order.discountCodes && order.discountCodes.length > 0
      ? order.discountCodes[0] : null;
    var totalDiscount = shopMoney(order.totalDiscountsSet);
    if (discountCode) txRecord.setValue({ fieldId: 'custbody_shopify_discount_code', value: discountCode });

    var isPickup = false;
    (order.customAttributes || []).forEach(function(a) {
      if (a.key === 'isPickupOrder' && a.value === 'true') isPickup = true;
    });
    if (isPickup) txRecord.setValue({ fieldId: 'custbody_celigo_shpfy_ispickup', value: true });

    txRecord.setValue({ fieldId: 'billaddr1',     value: billingAddr.address1      || '' });
    txRecord.setValue({ fieldId: 'billaddr2',     value: billingAddr.address2      || '' });
    txRecord.setValue({ fieldId: 'billaddressee', value: billingAddr.name          || '' });
    txRecord.setValue({ fieldId: 'billattn',      value: billingAddr.company       || '' });
    txRecord.setValue({ fieldId: 'billcity',      value: billingAddr.city          || '' });
    txRecord.setValue({ fieldId: 'billstate',     value: billingAddr.provinceCode  || '' });
    txRecord.setValue({ fieldId: 'billzip',       value: billingAddr.zip           || '' });
    txRecord.setValue({ fieldId: 'billphone',     value: billingAddr.phone         || '' });
    txRecord.setValue({ fieldId: 'billcountry',   value: billingAddr.countryCodeV2 || '' });

    // shipoverride: true — desvincula o ship-to do address book do customer.
    // Sem isso, o NS usa o endereço padrão do customer (da primeira ordem) em vez do endereço do pedido atual.
    txRecord.setValue({ fieldId: 'shipoverride',  value: true });
    txRecord.setValue({ fieldId: 'shipaddressee', value: shippingAddr.name          || '' });
    txRecord.setValue({ fieldId: 'shipattn',      value: shippingAddr.company       || '' });
    txRecord.setValue({ fieldId: 'shipaddr1',     value: shippingAddr.address1      || '' });
    txRecord.setValue({ fieldId: 'shipaddr2',     value: shippingAddr.address2      || '' });
    txRecord.setValue({ fieldId: 'shipcity',      value: shippingAddr.city          || '' });
    txRecord.setValue({ fieldId: 'shipstate',     value: shippingAddr.provinceCode  || '' });
    txRecord.setValue({ fieldId: 'shipzip',       value: shippingAddr.zip           || '' });
    txRecord.setValue({ fieldId: 'shipphone',     value: shippingAddr.phone         || '' });
    txRecord.setValue({ fieldId: 'shipcountry',   value: shippingAddr.countryCodeV2 || '' });

    if (order.note) txRecord.setValue({ fieldId: 'message', value: order.note });

    // --- Campos exclusivos do Cash Sale --- //
    if (isCashSale) {
      var gateway       = order.transactions && order.transactions.length > 0 ? order.transactions[0].gateway : null;
      var paymentMethod = resolvePaymentMethod(gateway);

      if (paymentMethod) txRecord.setValue({ fieldId: 'paymentmethod', value: paymentMethod });
      txRecord.setValue({ fieldId: 'payment', value: totalPrice });
    }

    // --- Line items: setSublistValue com lineIndex (isDynamic: false) --- //
    // Sem selectNewLine / commitLine — o índice controla a linha diretamente
    // rate e amount são setados explicitamente sem risco de override pelo NS
    var defaultUnitSkus = [];

    lineEdges.forEach(function(edge, lineIndex) {
      var li        = edge.node;
      var sku       = normalizeSku(li.sku);
      var itemId    = skuMap[sku];

      if (!itemId) throw new Error('Item without internal ID resolved — SKU: ' + li.sku + ', Line ID: ' + li.id);

      // Preço original — o desconto total aparece como linha separada ao final
      var unitPrice = shopMoney(li.originalUnitPriceSet);

      var lineTax = (li.taxLines || []).reduce(function(sum, t) {
        return sum + shopMoney(t.priceSet);
      }, 0);

      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'item',        line: lineIndex, value: itemId });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'quantity',    line: lineIndex, value: li.quantity });
      var unitToSet = itemUomStatus[itemId];
      if (unitToSet !== 'skip' && unitToSet !== 'default') {
        txRecord.setSublistValue({ sublistId: 'item', fieldId: 'units', line: lineIndex, value: unitToSet });
      } else if (unitToSet === 'default') {
        defaultUnitSkus.push(sku);
      }
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'price',       line: lineIndex, value: C.PRICE_LEVEL });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'rate',        line: lineIndex, value: unitPrice });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'amount',      line: lineIndex, value: parseFloat((unitPrice * li.quantity).toFixed(2)) });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'description', line: lineIndex, value: li.title || li.name });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_celigo_etail_order_line_id',  line: lineIndex, value: gidToNumeric(li.id) });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_celigo_etail_fulfillment_serv', line: lineIndex, value: li.fulfillmentService || '' });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_celigo_etail_order_line_tax', line: lineIndex, value: lineTax });
      var taxTitle = li.taxLines && li.taxLines.length > 0 ? li.taxLines[0].title : null;
      if (taxTitle) txRecord.setSublistValue({ sublistId: 'item', fieldId: 'custcol_shopify_tax_title', line: lineIndex, value: taxTitle });
    });

    // Linha de frete: Non-inventory Item 7239 com o valor exato do Shopify
    // shippingcost no header está zerado para que Avalara não tribute o frete
    if (shippingCost > 0) {
      var shipLineIndex = lineEdges.length;
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'item',        line: shipLineIndex, value: C.SHIPPING_ITEM_ID });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'quantity',    line: shipLineIndex, value: 1 });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'price',       line: shipLineIndex, value: C.PRICE_LEVEL });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'rate',        line: shipLineIndex, value: shippingCost });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'amount',      line: shipLineIndex, value: shippingCost });
      txRecord.setSublistValue({ sublistId: 'item', fieldId: 'description', line: shipLineIndex, value: shippingTitle || 'Shipping' });
    }

    // Header discount: discountitem + discountrate negativo (SuiteScript 2.x)
    // Celigo chama de "discounttotal" no REST API, mas em SuiteScript o campo writable é "discountrate"
    // Item 3803 é flat-rate → discountrate aceita valor em dólares (negativo = desconto)
    if (totalDiscount > 0) {
      txRecord.setValue({ fieldId: 'discountitem', value: C.DISCOUNT_ITEM_ID });
      txRecord.setValue({ fieldId: 'discountrate', value: -totalDiscount });
    }

    // enableSourcing: false — impede re-sourcing de rate/amount durante o save
    var recId = txRecord.save({ enableSourcing: false, ignoreMandatoryFields: false });

    var recLookup = search.lookupFields({
      type: isCashSale ? 'cashsale' : record.Type.SALES_ORDER,
      id:   recId,
      columns: ['tranid']
    });

    result.recordId     = String(recId);
    result.recordNumber = recLookup.tranid || String(recId);
    result.recordType   = isCashSale ? 'cashsale' : 'salesorder';
    result.created      = true;
    result.defaultLength = defaultUnitSkus.length
    if (defaultUnitSkus.length > 0) result.defaultUnitSkus = defaultUnitSkus;
    
  }
} catch (e) {
  result = {
    success: false,
    error: e.message || String(e)
  };
}

result;