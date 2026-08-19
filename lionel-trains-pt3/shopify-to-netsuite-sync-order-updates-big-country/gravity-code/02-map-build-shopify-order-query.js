const normalized = input['mapLR5J']?.[0] || {};

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
            sku
          }
          product {
            id
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
