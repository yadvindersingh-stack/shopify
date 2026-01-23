export const INSIGHT_CONTEXT_QUERY = `
query InsightContext($ordersQuery: String!) {
  shop { ianaTimezone }

  orders(first: 50, query: $ordersQuery, sortKey: CREATED_AT, reverse: true) {
    edges {
      node {
        id
        createdAt
        cancelledAt
        totalPriceSet { shopMoney { amount } }
        lineItems(first: 10) {
          edges {
            node {
              product { id }
              quantity
              originalTotalSet { shopMoney { amount } }
            }
          }
        }
      }
    }
  }

  # ✅ deterministically fetch the lowest inventory items
  productVariants(first: 50, sortKey: INVENTORY_QUANTITY, reverse: false) {
    edges {
      node {
        id
        inventoryQuantity
        product {
          id
          title
        }
      }
    }
  }
}
`;
