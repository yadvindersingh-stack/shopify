export const INSIGHT_CONTEXT_QUERY = `
query InsightContext($since: DateTime!) {
  shop {
    ianaTimezone
  }

  orders(
    first: 250
    query: $since
    sortKey: CREATED_AT
    reverse: false
  ) {
    edges {
      node {
        id
        createdAt
        cancelledAt
        totalPriceSet {
          shopMoney {
            amount
          }
        }
        lineItems(first: 50) {
          edges {
            node {
              product {
                id
              }
              quantity
              originalTotalSet {
                shopMoney {
                  amount
                }
              }
            }
          }
        }
      }
    }
  }

  products(first: 250) {
    edges {
      node {
        id
        title
        totalInventory
        priceRangeV2 {
          minVariantPrice {
            amount
          }
        }
      }
    }
  }
}
`;
