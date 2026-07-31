const normalized = input['REPLACE_WITH_01_MAP_NORMALIZE_WEBHOOK_STEP_KEY']?.[0] || {};

const orderGid =
  normalized.order?.gid ||
  (normalized.order?.numericId ? `gid://shopify/Order/${normalized.order.numericId}` : null);

const query = `
query GetOrderForNetSuiteUpdate($id: ID!) {
  order(id: $id) {
    id
    legacyResourceId
    name
    tags
    createdAt
    updatedAt
    cancelledAt
    cancelReason
    displayFinancialStatus
    displayFulfillmentStatus
    sourceName
    email
    phone
    note
    currentTotalDiscountsSet {
      shopMoney { amount currencyCode }
    }
    totalDiscountsSet {
      shopMoney { amount currencyCode }
    }
    currentTotalPriceSet {
      shopMoney { amount currencyCode }
    }
    totalPriceSet {
      shopMoney { amount currencyCode }
    }
    totalShippingPriceSet {
      shopMoney { amount currencyCode }
    }
    customer {
      id
      legacyResourceId
      firstName
      lastName
      email
      phone
    }
    billingAddress {
      firstName
      lastName
      name
      company
      address1
      address2
      city
      province
      provinceCode
      country
      countryCodeV2
      zip
      phone
    }
    shippingAddress {
      firstName
      lastName
      name
      company
      address1
      address2
      city
      province
      provinceCode
      country
      countryCodeV2
      zip
      phone
    }
    lineItems(first: 250) {
      edges {
        node {
          id
          legacyResourceId
          sku
          title
          name
          quantity
          currentQuantity
          fulfillableQuantity
          requiresShipping
          taxable
          vendor
          originalUnitPriceSet {
            shopMoney { amount currencyCode }
          }
          discountedTotalSet {
            shopMoney { amount currencyCode }
          }
          variant {
            id
            legacyResourceId
            sku
          }
          product {
            id
            legacyResourceId
          }
        }
      }
    }
    fulfillmentOrders(first: 50) {
      edges {
        node {
          id
          status
          assignedLocation {
            location {
              id
              legacyResourceId
              name
            }
          }
          lineItems(first: 250) {
            edges {
              node {
                id
                totalQuantity
                remainingQuantity
                lineItem {
                  id
                  legacyResourceId
                  sku
                }
              }
            }
          }
        }
      }
    }
  }
}`;

return [{
  shouldFetchShopifyOrder: !!normalized.isEdit,
  orderGid,
  query,
  variables: {
    id: orderGid,
  },
}];
