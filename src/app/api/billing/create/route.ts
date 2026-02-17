import { NextRequest, NextResponse } from "next/server";
import { resolveShop } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { plan } = await req.json(); // monthly | yearly
  const shop = await resolveShop(req);

  const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/billing/confirm`;

  const price = plan === "yearly" ? "99.00" : "9.00";
  const interval = plan === "yearly" ? "ANNUAL" : "EVERY_30_DAYS";

  const mutation = `
    mutation appSubscriptionCreate($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!) {
      appSubscriptionCreate(
        name: $name,
        returnUrl: $returnUrl,
        lineItems: $lineItems
      ) {
        confirmationUrl
        userErrors { field message }
      }
    }
  `;

  const data = await shopifyGraphql({
    shop: shop.shop_domain,
    accessToken: shop.access_token,
    query: mutation,
    variables: {
      name: `MerchPulse ${plan}`,
      returnUrl,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: price, currencyCode: "CAD" },
              interval
            }
          }
        }
      ]
    }
  });

  return NextResponse.json({
    confirmationUrl: data.appSubscriptionCreate.confirmationUrl
  });
}
