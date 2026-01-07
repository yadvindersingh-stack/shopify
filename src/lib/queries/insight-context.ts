export const INSIGHT_CONTEXT_QUERY = `
query InsightContext($ordersQuery: String!) {
  shop {
    ianaTimezone
  }

  orders(first: 250, query: $ordersQuery, sortKey: CREATED_AT, reverse: false) {
    edges {
      node {
        id
        createdAt
        cancelledAt
        totalPriceSet {
          shopMoney { amount }
        }
        lineItems(first: 50) {
          edges {
            node {
              quantity
              product { id }
              originalTotalSet {
                shopMoney { amount }
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
          minVariantPrice { amount }
        }
      }
    }
  }
}
`;
