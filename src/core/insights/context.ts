export type InsightContext = {
  shopId: string;
  shopTimezone: string;

  now: Date;

  orders: {
    id: string;
    created_at: string;
    total_price: number;
    cancelled_at?: string | null;
  }[];

  products: {
    id: string;
    title: string;
    price: number;
    inventory_quantity: number;
    historical_revenue: number;
  }[];
};
