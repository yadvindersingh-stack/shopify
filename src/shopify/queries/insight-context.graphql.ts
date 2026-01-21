export const INSIGHT_CONTEXT_QUERY = `
query InsightContext($ordersQuery: String!) {
  shop { ianaTimezone }

  orders(first: 250, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        createdAt
        cancelledAt
        totalPriceSet { shopMoney { amount } }
      }
    }
  }

  products(first: 100) {
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
