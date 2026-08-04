var C = {
  SUBSIDIARY_ID: ${JSON.stringify(input['workflowArguments'].subsidiary)},
  CURRENCY_ID:   '1',
  SHOPIFY_STORE_ID: ${JSON.stringify(input['workflowArguments'].shopifyStoreId)},
  ETAIL_CHANNEL: '101', // custentity_celigo_etail_channel — canal Shopify
  CATEGORY:      '55',  // category — E-Commerce
  ENTITY_STATUS: '13'   // entitystatus — CUSTOMER-Closed Won (confirmar ID no ambiente)
};

function gidToNumeric(gid) {
  return gid ? String(gid).split('/').pop() : null;
}

var result = { success: true };

try {
  var customer = ${JSON.stringify(input['iterateELDR'][0].customer)};

  if (!customer || !customer.id) {
    throw new Error('Input inválido: customer é obrigatório.');
  }

  var shopifyCustomerId = customer.legacyResourceId || gidToNumeric(customer.id);

  if (!shopifyCustomerId) {
    throw new Error('Shopify Customer ID inválido: ' + customer.id);
  }

  var defaultAddr = customer.defaultAddress || {};
  var isCompany   = !customer.firstName && !customer.lastName && !!defaultAddr.company;
  var fullName    = customer.displayName
    || ((customer.firstName || '') + ' ' + (customer.lastName || '')).trim()
    || defaultAddr.name
    || '';

  // Idempotência — busca customer existente pelo Shopify ID
  var existing = search.create({
    type: search.Type.CUSTOMER,
    filters: [
      ['custentity_celigo_etail_cust_id', search.Operator.IS, shopifyCustomerId],
      'AND',
      ['isinactive', search.Operator.IS, 'F']
    ],
    columns: ['internalid']
  }).run().getRange({ start: 0, end: 1 });

  var custRecord;
  var isUpdate = existing.length > 0;

  if (isUpdate) {
    custRecord = record.load({
      type:      record.Type.CUSTOMER,
      id:        existing[0].getValue({ name: 'internalid' }),
      isDynamic: true
    });
  } else {
    custRecord = record.create({
      type:      record.Type.CUSTOMER,
      isDynamic: true
    });

    custRecord.setValue({ fieldId: 'subsidiary',   value: C.SUBSIDIARY_ID });
    custRecord.setValue({ fieldId: 'currency',     value: C.CURRENCY_ID });
    custRecord.setValue({ fieldId: 'entitystatus', value: C.ENTITY_STATUS });
    custRecord.setValue({ fieldId: 'externalid',
      value: 'SHPF-' + C.SHOPIFY_STORE_ID + '-CUST-' + shopifyCustomerId
    });
  }

  // Sempre setados (create e update)
  custRecord.setValue({ fieldId: 'custentity_celigo_etail_cust_id', value: shopifyCustomerId });
  custRecord.setValue({ fieldId: 'custentity_celigo_etail_channel', value: C.ETAIL_CHANNEL });
  custRecord.setValue({ fieldId: 'category',                         value: C.CATEGORY });
  custRecord.setValue({ fieldId: 'creditholdoverride',               value: 'OFF' });

  // Campos de identidade (sempre atualizados)
  if (isCompany) {
    custRecord.setValue({ fieldId: 'isperson',    value: 'F' });
    custRecord.setValue({ fieldId: 'companyname', value: defaultAddr.company || fullName });
  } else {
    custRecord.setValue({ fieldId: 'isperson',  value: 'T' });
    custRecord.setValue({ fieldId: 'firstname', value: customer.firstName || defaultAddr.firstName || '' });
    custRecord.setValue({ fieldId: 'lastname',  value: customer.lastName  || defaultAddr.lastName  || fullName });
  }

  custRecord.setValue({ fieldId: 'email',              value: customer.email || '' });
  custRecord.setValue({ fieldId: 'phone',              value: customer.phone || defaultAddr.phone || '' });
  custRecord.setValue({ fieldId: 'taxexempt',          value: customer.taxExempt ? 'T' : 'F' });
  
  custRecord.setValue({ fieldId: 'tobeemailed',        value: 'F' });

  if (customer.note) {
    custRecord.setValue({ fieldId: 'comments', value: customer.note });
  }

  // Endereço padrão — apenas na criação para não sobrescrever dados mantidos manualmente no NS
  if (!isUpdate && defaultAddr.address1) {
    custRecord.selectNewLine({ sublistId: 'addressbook' });
    custRecord.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'label',           value: 'Default' });
    // custRecord.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'defaultbilling',  value: 'T' });
    // custRecord.setCurrentSublistValue({ sublistId: 'addressbook', fieldId: 'defaultshipping', value: 'T' });

    var addrSub = custRecord.getCurrentSublistSubrecord({
      sublistId: 'addressbook',
      fieldId:   'addressbookaddress'
    });

    addrSub.setValue({ fieldId: 'addressee', value: defaultAddr.name    || fullName });
    addrSub.setValue({ fieldId: 'attention', value: defaultAddr.company || '' });
    addrSub.setValue({ fieldId: 'addr1',     value: defaultAddr.address1 || '' });
    addrSub.setValue({ fieldId: 'addr2',     value: defaultAddr.address2 || '' });
    addrSub.setValue({ fieldId: 'city',      value: defaultAddr.city     || '' });
    addrSub.setValue({ fieldId: 'state',     value: defaultAddr.provinceCode || '' });
    addrSub.setValue({ fieldId: 'zip',       value: defaultAddr.zip      || '' });
    addrSub.setValue({ fieldId: 'country',   value: defaultAddr.countryCodeV2 || '' });
    addrSub.setValue({ fieldId: 'addrphone', value: defaultAddr.phone    || '' });

    custRecord.commitLine({ sublistId: 'addressbook' });
  }

  var customerId = custRecord.save({
    enableSourcing: false,
    ignoreMandatoryFields: false
  });

  result.customerId = String(customerId);
  result.shopifyId  = shopifyCustomerId;
  result.created    = !isUpdate;
  result.updated    = isUpdate;

} catch (e) {
  result = {
    success: false,
    error:   e.message || String(e)
  };
}

result;