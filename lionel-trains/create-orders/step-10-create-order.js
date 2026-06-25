const order = ${JSON.stringify(input?.mapPOD2?.[0])};
const matchedItemsResult = ${JSON.stringify(input?.netsuiteExecuteCustomCodeVLIS?.[0])};
const customerResult = ${JSON.stringify(input?.netsuiteListCustomersO7B0?.[0])};
const wfArguments = ${JSON.stringify(input?.workflowArguments)}

function execute() {
  try {
    // -----------------------------
    // Config
    // -----------------------------
    const NETSUITE_SUBSIDIARY_ID = 3;
    const NETSUITE_CUSTOM_FORM_ID = 209;
    const NETSUITE_CSEG_DIVISION = wfArguments.divisionID;
    const NETSUITE_ORDER_CLASS_ID = wfArguments.orderClassID;
    const NETSUITE_LOCATION_ID = wfArguments.locationID;
    const NETSUITE_CONCORD_LOCATION_ID = NETSUITE_LOCATION_ID;
    const NETSUITE_AMAZON_LOCATION_ID = 152;
    const DEFAULT_CURRENCY_ID = 1;
    const AMAZON_FBM_DELIVERY_DATE_FIELD_ID = 'custbody_amz_fbm_del_date';
    const SHIP_COMPLETE_FIELD_ID = 'shipcomplete';
    const SHOPIFY_DISCOUNT_PERCENT_FIELD_ID = 'custbody_shopify_disc_pct';
    const MONEY_PRECISION = 2;
    const PERCENT_PRECISION = 2;
    const SHOPIFY_LOCATION_TO_NETSUITE_LOCATION_OVERRIDES = {
      'gid://shopify/Location/72788476094': NETSUITE_AMAZON_LOCATION_ID
    };

    // -----------------------------
    // Helpers
    // -----------------------------
    function getShopifyNumericId(gid) {
      if (!gid) return null;
      return String(gid).split('/').pop();
    }

    function toNumber(value, fallback) {
      const num = Number(value);
      return isNaN(num) ? fallback : num;
    }

    function getLineItems(order) {
      if (Array.isArray(order?.lineItems)) {
        return order.lineItems;
      }

      if (Array.isArray(order?.lineItems?.edges)) {
        return order.lineItems.edges.map(function (edge) {
          return edge.node;
        });
      }

      return [];
    }

    function normalizeConnection(value) {
      if (!value) {
        return [];
      }

      if (Array.isArray(value)) {
        return value;
      }

      if (Array.isArray(value.edges)) {
        return value.edges.map(function (edge) {
          return edge?.node;
        }).filter(Boolean);
      }

      if (Array.isArray(value.nodes)) {
        return value.nodes;
      }

      return [];
    }

    function addLineItemKey(keys, value) {
      if (!value) {
        return;
      }

      const rawValue = String(value);
      const numericValue = getShopifyNumericId(rawValue);

      keys.push(rawValue);

      if (numericValue) {
        keys.push(numericValue);
        keys.push('gid://shopify/LineItem/' + numericValue);
      }
    }

    function getLineItemKeys(lineItem) {
      const keys = [];

      addLineItemKey(keys, lineItem?.id);
      addLineItemKey(keys, lineItem?.lineItemId);
      addLineItemKey(keys, lineItem?.shopifyLineItemId);
      addLineItemKey(keys, lineItem?.line_item_id);

      return keys.filter(function (key, index) {
        return key && keys.indexOf(key) === index;
      });
    }

    function buildFulfillmentOrderLineLocationMap(order) {
      const lineLocationMap = {};

      normalizeConnection(order?.fulfillmentOrders).forEach(function (fulfillmentOrder) {
        const shopifyLocationId =
          fulfillmentOrder?.assignedLocation?.location?.id ||
          fulfillmentOrder?.assignedLocation?.locationId ||
          null;
        const netsuiteLocationId = SHOPIFY_LOCATION_TO_NETSUITE_LOCATION_OVERRIDES[shopifyLocationId];

        if (!netsuiteLocationId) {
          return;
        }

        normalizeConnection(fulfillmentOrder?.lineItems).forEach(function (fulfillmentOrderLineItem) {
          getLineItemKeys(fulfillmentOrderLineItem?.lineItem).forEach(function (key) {
            lineLocationMap[key] = netsuiteLocationId;
          });
        });
      });

      return lineLocationMap;
    }

    function getLineLocationId(lineItem, fulfillmentOrderLineLocationMap) {
      const keys = getLineItemKeys(lineItem);

      for (let i = 0; i < keys.length; i++) {
        if (fulfillmentOrderLineLocationMap[keys[i]]) {
          return fulfillmentOrderLineLocationMap[keys[i]];
        }
      }

      return NETSUITE_LOCATION_ID;
    }

    function hasFulfillmentOrderLocationOverride(fulfillmentOrderLineLocationMap) {
      return Object.keys(fulfillmentOrderLineLocationMap).length > 0;
    }

    function getShopifyOrderClassWithFulfillmentLocations(order, fulfillmentOrderLineLocationMap) {
      if (hasFulfillmentOrderLocationOverride(fulfillmentOrderLineLocationMap)) {
        return '1';
      }

      return getShopifyOrderClass(order);
    }

    function getSourceText(value) {
      if (value === null || value === undefined) return '';
      return String(value).trim().toLowerCase();
    }

    function getOrderSourceName(order) {
      return getSourceText(order?.sourceName);
    }

    function getCustomAttributesText(order) {
      if (!Array.isArray(order?.customAttributes)) {
        return '';
      }

      return order.customAttributes
        .map(function (attribute) {
          return [
            getSourceText(attribute?.key),
            getSourceText(attribute?.value)
          ].filter(Boolean).join(' ');
        })
        .filter(Boolean)
        .join(' ');
    }

    function getShopifyOrderClass(order) {
      const sourceName = getOrderSourceName(order);

      if (sourceName === '71323942913') return '3';
      if (sourceName === 'amazon') return '1';
      if (sourceName === 'ebay') return '2';

      const customAttributesText = getCustomAttributesText(order);

      if (customAttributesText.indexOf('walmart') !== -1) return '3';
      if (customAttributesText.indexOf('amazon') !== -1) return '1';
      if (customAttributesText.indexOf('ebay') !== -1) return '2';

      return '4';
    }

    function orderHasOpenLineFromNetsuiteLocation(lineItems, fulfillmentOrderLineLocationMap, locationId) {
      const openLineItems = lineItems.filter(function (lineItem) {
        return getLineQuantities(lineItem).pendingQuantity > 0;
      });

      if (!locationId || !openLineItems.length) {
        return false;
      }

      return openLineItems.some(function (lineItem) {
        return Number(getLineLocationId(lineItem, fulfillmentOrderLineLocationMap)) === Number(locationId);
      });
    }

    function parseShopifyDateToNetSuiteDate(value) {
      if (!value) return null;

      const date = new Date(value);

      if (isNaN(date.getTime())) {
        return null;
      }

      return date;
    }

    function subtractUtcDays(date, days) {
      if (!date) return null;

      const adjustedDate = new Date(date.getTime());
      adjustedDate.setUTCDate(adjustedDate.getUTCDate() - days);
      adjustedDate.setUTCHours(12, 0, 0, 0);

      return adjustedDate;
    }

    function getAmazonLatestDeliveryDate(order) {
      const amazonLatestDeliveryDateAttribute = (order?.customAttributes || []).find(function (attribute) {
        return attribute?.key === 'Amazon Latest Delivery Date';
      });

      return subtractUtcDays(
        parseShopifyDateToNetSuiteDate(amazonLatestDeliveryDateAttribute?.value),
        1
      );
    }

    function getAmount(value) {
      if (value === null || value === undefined || value === '') return null;
      const amount = Number(value);
      return isNaN(amount) ? null : amount;
    }

    function getFirstNumber(values) {
      for (let i = 0; i < values.length; i++) {
        const value = values[i];

        if (value === null || value === undefined || value === '') {
          continue;
        }

        const num = Number(value);

        if (!isNaN(num)) {
          return num;
        }
      }

      return null;
    }

    function getLineQuantities(lineItem) {
      const orderedQuantity = Math.max(toNumber(lineItem.quantity, 1), 0);
      const rawFulfillableQuantity = getFirstNumber([
        lineItem.fulfillableQuantity,
        lineItem.fulfillable_quantity,
        lineItem.remainingQuantity,
        lineItem.remaining_quantity
      ]);

      const pendingQuantity =
        rawFulfillableQuantity === null
          ? orderedQuantity
          : Math.min(Math.max(rawFulfillableQuantity, 0), orderedQuantity);

      return {
        orderedQuantity: orderedQuantity,
        pendingQuantity: pendingQuantity,
        alreadyFulfilledQuantity: Math.max(orderedQuantity - pendingQuantity, 0)
      };
    }

    function hasLineFulfillableQuantity(lineItem) {
      return getFirstNumber([
        lineItem.fulfillableQuantity,
        lineItem.fulfillable_quantity,
        lineItem.remainingQuantity,
        lineItem.remaining_quantity
      ]) !== null;
    }

    function orderMayBePartiallyFulfilled(order) {
      const fulfillmentStatus = getSourceText(
        order?.fulfillmentStatus ||
        order?.displayFulfillmentStatus ||
        ''
      );

      return fulfillmentStatus.indexOf('partial') !== -1;
    }

    function buildItemMap(matchedItemsResult) {
      const map = {};

      const matchedLineItems =
        matchedItemsResult?.lineItems ||
        matchedItemsResult?.items ||
        [];

      matchedLineItems.forEach(function (line) {
        if (!line?.sku) return;

        map[String(line.sku).trim()] = {
          sku: String(line.sku).trim(),
          netsuiteItemId: line.netsuiteItemId || line.internalId || line.itemId || null,
          netsuiteItem: line.netsuiteItem || null
        };
      });

      return map;
    }

    function getCustomerId(customerResult) {
      return (
        customerResult?.recordId ||
        customerResult?.id ||
        customerResult?.internalId ||
        customerResult?.customerId ||
        null
      );
    }


    function getShopifyDiscountAmount(order) {
      return getAmount(
        order?.currentTotalDiscountsSet?.shopMoney?.amount ||
        order?.totalDiscountsSet?.shopMoney?.amount ||
        0
      ) || 0;
    }

    function roundNumber(value, precision) {
      const factor = Math.pow(10, precision);
      return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
    }

    function getSalesOrderProductSubtotal(salesOrderRec) {
      let subtotal = 0;
      const lineCount = salesOrderRec.getLineCount({ sublistId: 'item' });

      for (let i = 0; i < lineCount; i++) {
        const amount = getAmount(salesOrderRec.getSublistValue({
          sublistId: 'item',
          fieldId: 'amount',
          line: i
        })) || 0;

        if (amount > 0) {
          subtotal += amount;
        }
      }

      return roundNumber(subtotal, MONEY_PRECISION);
    }

    function getShopifyDiscountPercent(productSubtotal, discountAmount) {
      if (!productSubtotal || productSubtotal <= 0) return 0;
      if (!discountAmount || discountAmount <= 0) return 0;

      return roundNumber(
        Math.abs(discountAmount) / productSubtotal * 100,
        PERCENT_PRECISION
      );
    }

    function setShopifyDiscountPercent(salesOrderRec, discountAmount) {
      const productSubtotal = getSalesOrderProductSubtotal(salesOrderRec);
      const discountPercent = getShopifyDiscountPercent(productSubtotal, discountAmount);

      salesOrderRec.setValue({
        fieldId: SHOPIFY_DISCOUNT_PERCENT_FIELD_ID,
        value: discountPercent
      });

      return {
        productSubtotal: productSubtotal,
        discountPercent: discountPercent
      };
    }

    function setNonTaxableItemLine(salesOrderRec) {
      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'isTaxable',
        value: false,
        forceSyncSourcing: true
      });
    }

    function addShopifyDiscountLine(salesOrderRec, discountAmount, isAmazonFbmOrder) {
      const SHOPIFY_DISCOUNT_ITEM_ID = wfArguments.discountID

      if (!discountAmount || discountAmount <= 0) {
        return false;
      }

      salesOrderRec.selectNewLine({
        sublistId: 'item'
      });

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'item',
        value: SHOPIFY_DISCOUNT_ITEM_ID,
        forceSyncSourcing: true
      });

      if (NETSUITE_LOCATION_ID) {
        salesOrderRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'location',
          value: NETSUITE_LOCATION_ID,
          forceSyncSourcing: true
        });
      }

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'quantity',
        value: 1
      });

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'price',
        value: -1
      });

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'rate',
        value: -Math.abs(discountAmount)
      });

      if (isAmazonFbmOrder) {
        setNonTaxableItemLine(salesOrderRec);
      }

      salesOrderRec.commitLine({
        sublistId: 'item'
      });

      return true;
    }

    function getShopifyShippingAmount(order) {
      return getAmount(
        order?.shippingAmount ||
        order?.totalShippingPrice ||
        order?.totalShippingPriceSet?.shopMoney?.amount ||
        0
      ) || 0;
    }

    function addSalesOrderItemLine(salesOrderRec, lineItem, matchedItem, quantity, rate, isClosed, descriptionSuffix, lineLocationId) {
      if (!quantity || quantity <= 0) {
        return false;
      }

      const sku = String(lineItem.sku || '').trim();
      const targetLocationId = lineLocationId || NETSUITE_LOCATION_ID;

      salesOrderRec.selectNewLine({
        sublistId: 'item'
      });

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'item',
        value: Number(matchedItem.netsuiteItemId),
        forceSyncSourcing: true
      });

      if (targetLocationId) {
        salesOrderRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'location',
          value: targetLocationId,
          forceSyncSourcing: true
        });
      }

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'quantity',
        value: quantity,
        forceSyncSourcing: true
      });

      // Use custom price so NetSuite accepts Shopify price.
      if (rate !== null) {
        salesOrderRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'price',
          value: -1,
          forceSyncSourcing: true
        });

        salesOrderRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'rate',
          value: rate,
          forceSyncSourcing: true
        });

        salesOrderRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'amount',
          value: rate * quantity,
          forceSyncSourcing: true
        });
      }

      if (isAmazonFbmOrder) {
        setNonTaxableItemLine(salesOrderRec);
      }

      salesOrderRec.setCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'description',
        value: [lineItem.title || sku, descriptionSuffix].filter(Boolean).join(' - ')
      });

      if (isClosed) {
        salesOrderRec.setCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'isclosed',
          value: true,
          forceSyncSourcing: true
        });
      }

      salesOrderRec.commitLine({
        sublistId: 'item'
      });

      return true;
    }

    function setSalesOrderHeaderLocation(salesOrderRec) {
      if (!NETSUITE_LOCATION_ID) {
        return;
      }

      salesOrderRec.setValue({
        fieldId: 'location',
        value: NETSUITE_LOCATION_ID,
        ignoreFieldChange: true
      });
    }

    function forceSavedSalesOrderHeaderLocation(salesOrderId) {
      if (!NETSUITE_LOCATION_ID) {
        return false;
      }

      record.submitFields({
        type: 'salesorder',
        id: salesOrderId,
        values: {
          location: NETSUITE_LOCATION_ID
        },
        options: {
          enableSourcing: false,
          ignoreMandatoryFields: true
        }
      });

      return true;
    }

    function setTransactionAddress(salesOrderRec, fieldId, addressData) {
      if (!addressData) return;

      const addressSubrecord = salesOrderRec.getSubrecord({
        fieldId: fieldId
      });

      const addressee =
        addressData.name ||
        [addressData.firstName, addressData.lastName].filter(Boolean).join(' ').trim();

      if (addressData.countryCodeV2 || addressData.countryCode || addressData.country) {
        addressSubrecord.setValue({
          fieldId: 'country',
          value: addressData.countryCodeV2 || addressData.countryCode || addressData.country
        });
      }

      if (addressee) {
        addressSubrecord.setValue({
          fieldId: 'addressee',
          value: addressee
        });
      }

      if (addressData.company) {
        addressSubrecord.setValue({
          fieldId: 'attention',
          value: addressData.company
        });
      }

      if (addressData.address1) {
        addressSubrecord.setValue({
          fieldId: 'addr1',
          value: addressData.address1
        });
      }

      if (addressData.address2) {
        addressSubrecord.setValue({
          fieldId: 'addr2',
          value: addressData.address2
        });
      }

      if (addressData.city) {
        addressSubrecord.setValue({
          fieldId: 'city',
          value: addressData.city
        });
      }

      if (addressData.provinceCode || addressData.province) {
        addressSubrecord.setValue({
          fieldId: 'state',
          value: addressData.provinceCode || addressData.province
        });
      }

      if (addressData.zip) {
        addressSubrecord.setValue({
          fieldId: 'zip',
          value: addressData.zip
        });
      }

      if (addressData.phone) {
        addressSubrecord.setValue({
          fieldId: 'addrphone',
          value: addressData.phone
        });
      }
    }

    // -----------------------------
    // Source data
    // -----------------------------
    const shopifyOrderId = getShopifyNumericId(order?.orderNumber);
    const shopifyOrderName = order?.name;
    const lineItems = getLineItems(order);
    const itemMap = buildItemMap(matchedItemsResult);
    const fulfillmentOrderLineLocationMap = buildFulfillmentOrderLineLocationMap(order);
    const shopifyOrderClass = getShopifyOrderClassWithFulfillmentLocations(order, fulfillmentOrderLineLocationMap);
    const originatedFromAmazon = getShopifyOrderClass(order) === '1';
    const isAmazonFbmOrder = shopifyOrderClass === '1';
    const hasConcordFulfillmentLine = orderHasOpenLineFromNetsuiteLocation(lineItems, fulfillmentOrderLineLocationMap, NETSUITE_CONCORD_LOCATION_ID);
    const shouldSetAmazonFbmHeaderFields = originatedFromAmazon && hasConcordFulfillmentLine;
    const amazonFbmDeliveryDate = shouldSetAmazonFbmHeaderFields ? getAmazonLatestDeliveryDate(order) : null;
    const shopifyCreatedAt = order?.createdAt;
    const transactionDate = parseShopifyDateToNetSuiteDate(shopifyCreatedAt);

    const customerId = getCustomerId(customerResult);

    if (!customerId) {
      return {
        success: false,
        message: 'Missing NetSuite customer internal ID. Create or find the customer before creating the Sales Order.',
        customerResult: customerResult
      };
    }

    if (!lineItems.length) {
      return {
        success: false,
        message: 'No Shopify lineItems found on order.',
        orderId: order?.id,
        orderName: order?.name
      };
    }

    if (orderMayBePartiallyFulfilled(order) && !lineItems.some(hasLineFulfillableQuantity)) {
      return {
        success: false,
        message: 'Shopify order is partially fulfilled, but line items do not include fulfillableQuantity/remainingQuantity. Update the Shopify query and mapPOD2 mapping before creating this Sales Order.',
        orderId: order?.id,
        orderName: order?.name,
        fulfillmentStatus: order?.fulfillmentStatus || order?.displayFulfillmentStatus
      };
    }

    // -----------------------------
    // Create Sales Order
    // -----------------------------
    const salesOrderRec = record.create({
      type: 'salesorder',
      isDynamic: true
    });

    // Custom form should be one of the first fields if used
    if (NETSUITE_CUSTOM_FORM_ID) {
      salesOrderRec.setValue({
        fieldId: 'customform',
        value: NETSUITE_CUSTOM_FORM_ID
      });
    }

    salesOrderRec.setValue({
      fieldId: 'entity',
      value: Number(customerId)
    });

    salesOrderRec.setValue({
      fieldId: 'subsidiary',
      value: NETSUITE_SUBSIDIARY_ID
    });

    salesOrderRec.setValue({
      fieldId: 'csegdivision',
      value: NETSUITE_CSEG_DIVISION
    });
    
    if (transactionDate) {
      salesOrderRec.setValue({
        fieldId: 'trandate',
        value: transactionDate
      });
    }

    if (DEFAULT_CURRENCY_ID) {
      salesOrderRec.setValue({
        fieldId: 'currency',
        value: DEFAULT_CURRENCY_ID
      });
    }

    if (NETSUITE_ORDER_CLASS_ID) {
      salesOrderRec.setValue({
        fieldId: 'class',
        value: NETSUITE_ORDER_CLASS_ID
      });
    }

    if (shopifyOrderName) {
      salesOrderRec.setValue({
        fieldId: 'otherrefnum',
        value: shopifyOrderName
      });
    }

    salesOrderRec.setValue({
      fieldId: 'memo',
      value: 'Shopify Order ' + (shopifyOrderName || shopifyOrderId || '')
    });

    salesOrderRec.setValue({
      fieldId: 'custbody_shopify_ord_id',
      value: shopifyOrderId
    });

    salesOrderRec.setValue({
      fieldId: 'paymentmethod',
      value: 60
    });

    salesOrderRec.setValue({
      fieldId: 'custbody_shopify_ord_class',
      value: shopifyOrderClass
    });

    if (shouldSetAmazonFbmHeaderFields) {
      salesOrderRec.setValue({
        fieldId: SHIP_COMPLETE_FIELD_ID,
        value: true
      });

      if (amazonFbmDeliveryDate) {
        salesOrderRec.setValue({
          fieldId: AMAZON_FBM_DELIVERY_DATE_FIELD_ID,
          value: amazonFbmDeliveryDate
        });
      }
    }
    
    //
    // salesOrderRec.setValue({
    //   fieldId: 'custbody_shopify_order_name',
    //   value: shopifyOrderName
    // });

    // -----------------------------
    // Addresses
    // -----------------------------
    if (order?.billingAddress) {
      setTransactionAddress(salesOrderRec, 'billingaddress', order.billingAddress);
    }

    if (order?.shippingAddress) {
      setTransactionAddress(salesOrderRec, 'shippingaddress', order.shippingAddress);
    }

    // -----------------------------
    // Item Lines
    // -----------------------------
    let createdOpenLineCount = 0;
    let createdClosedLineCount = 0;

    lineItems.forEach(function (lineItem) {
      const sku = String(lineItem.sku || '').trim();
      const matchedItem = itemMap[sku];

      const unitPrice = getAmount(
        lineItem.originalUnitPrice
      );

      const rate = unitPrice;
      const quantities = getLineQuantities(lineItem);
      const lineLocationId = getLineLocationId(lineItem, fulfillmentOrderLineLocationMap);

      if (addSalesOrderItemLine(
        salesOrderRec,
        lineItem,
        matchedItem,
        quantities.alreadyFulfilledQuantity,
        rate,
        true,
        'Already fulfilled in Shopify',
        lineLocationId
      )) {
        createdClosedLineCount++;
      }

      if (addSalesOrderItemLine(
        salesOrderRec,
        lineItem,
        matchedItem,
        quantities.pendingQuantity,
        rate,
        false,
        quantities.alreadyFulfilledQuantity > 0 ? 'Pending fulfillment balance' : '',
        lineLocationId
      )) {
        createdOpenLineCount++;
      }
    });

    const discountAmount = getShopifyDiscountAmount(order);

    const discountLineAdded = addShopifyDiscountLine(
      salesOrderRec,
      discountAmount,
      isAmazonFbmOrder
    );

    const discountPercentData = setShopifyDiscountPercent(
      salesOrderRec,
      discountAmount
    );

    const shippingAmount = getShopifyShippingAmount(order);

    if (shippingAmount > 0) {
      salesOrderRec.setValue({
        fieldId: 'shippingcost',
        value: shippingAmount
      });
    }

    setSalesOrderHeaderLocation(salesOrderRec);

    // -----------------------------
    // Save
    // -----------------------------
    const salesOrderId = salesOrderRec.save({
      enableSourcing: true,
      ignoreMandatoryFields: false
    });
    const headerLocationForced = forceSavedSalesOrderHeaderLocation(salesOrderId);

    return {
      success: true,
      recordId: salesOrderId,
      message: 'Sales Order created successfully',
      shopifyOrderId: shopifyOrderId,
      shopifyOrderName: shopifyOrderName,
      customerId: customerId,
      lineCount: lineItems.length,
      createdOpenLineCount: createdOpenLineCount,
      createdClosedLineCount: createdClosedLineCount,
      discountAmount: discountAmount,
      productSubtotal: discountPercentData.productSubtotal,
      discountPercent: discountPercentData.discountPercent,
      discountLineAdded: discountLineAdded,
      shippingAmount,
      headerLocationId: NETSUITE_LOCATION_ID,
      originatedFromAmazon: originatedFromAmazon,
      isAmazonFbmOrder: isAmazonFbmOrder,
      hasConcordFulfillmentLine: hasConcordFulfillmentLine,
      shouldSetAmazonFbmHeaderFields: shouldSetAmazonFbmHeaderFields,
      amazonFbmDeliveryDate: amazonFbmDeliveryDate
    };

  } catch (error) {
    return {
      success: false,
      message: error.message,
      stack: error.stack,
      error: error
    };
  }
}

execute();
