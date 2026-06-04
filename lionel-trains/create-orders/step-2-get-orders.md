variables: 
{  cursor: null,  batchSize: 100,  query: "-fulfillment_status:fulfilled financial_status:paid tag_not:exported status:open"}

query GetOrdersToExport($cursor: String, $batchSize: Int!, $query: String!) {
  orders(
    first: $batchSize
    after: $cursor
    query: $query
    sortKey: CREATED_AT
    reverse: false
  ) {
    edges {
      cursor
      node {
        id
        name
        createdAt
        updatedAt
        tags
        displayFinancialStatus
        displayFulfillmentStatus
        email
        phone




        sourceName
        sourceIdentifier
        customAttributes {
          key
          value
        }
        totalDiscountsSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalTaxSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        totalShippingPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        billingAddress {
          firstName
          lastName
          name
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

        customer {
          id
          email
          firstName
          lastName
          phone
        }

        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        lineItems(first: 100) {
          edges {
            node {
              id
              title
              sku
              quantity
              fulfillableQuantity
              fulfillmentStatus
              originalUnitPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              discountedTotalSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }



        fulfillmentOrders(first: 10, displayable: false) {
          edges {
            node {
              id
              status
              assignedLocation {
                name
                location {
                  id
                  name
                }
              }
              lineItems(first: 30) {
                edges {
                  node {
                    id
                    totalQuantity
                    remainingQuantity
                    lineItem {
                      id
                      title
                      sku
                      quantity
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
