

export const INSIGHT_CONTEXT_QUERY = `
query InsightContext($ordersQuery: String!) {
  shop { ianaTimezone }

  orders(first: 250, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        createdAt
        cancelledAt
        lineItems(first: 50) {
          edges {
            node {
              product { id }
              quantity
            }
          }
        }
      }
    }
  }

  products(first: 250, sortKey: INVENTORY_QUANTITY, reverse: false) {
    edges {
      node {
        id
        title
        totalInventory
        priceRangeV2 { minVariantPrice { amount } }
      }
    }
  }
}
`;
