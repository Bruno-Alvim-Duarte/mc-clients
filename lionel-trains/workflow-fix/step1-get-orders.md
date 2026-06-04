query ClosedFulfilledOrdersToday($cursor: String) {
  orders(
    first: 100
    after: $cursor
    sortKey: UPDATED_AT
    reverse: true
    query: "updated_at:>=2026-06-01T06:00:00-04:00 (fulfillment_status:fulfilled OR fulfillment_status:partial)"
  ) {
    pageInfo {
      hasNextPage
      endCursor
    }
    edges {
      cursor
      node {
        id
        name
        displayFinancialStatus
        displayFulfillmentStatus
        cancelledAt
        closedAt
        updatedAt

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

        fulfillments(first: 25) {
          id
          status
          displayStatus
          createdAt
          deliveredAt
          trackingInfo {
            number
            url
          }
          fulfillmentLineItems(first: 100) {
            edges {
              node {
                quantity
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


        transactions {
          kind
          status
          processedAt
          amountSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
}
