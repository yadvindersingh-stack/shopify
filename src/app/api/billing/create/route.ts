import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Plan = "monthly" | "yearly";

const SUB_CREATE = `
mutation appSubscriptionCreate(
  $name: String!
  $returnUrl: URL!
  $trialDays: Int
  $lineItems: [AppSubscriptionLineItemInput!]!
) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    trialDays: $trialDays
    lineItems: $lineItems
  ) {
    confirmationUrl
    appSubscription { id status }
    userErrors { field message }
  }
}
`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const plan: Plan = body?.plan === "yearly" ? "yearly" : "monthly";
    const host: string = typeof body?.host === "string" ? body.host : "";

    const shop = await resolveShop(req);

    const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
    if (!APP_URL) return NextResponse.json({ error: "Missing SHOPIFY_APP_URL" }, { status: 500 });

    const price = plan === "yearly" ? "99.00" : "9.00";
    const interval = plan === "yearly" ? "ANNUAL" : "EVERY_30_DAYS";
    const name = plan === "yearly" ? "MerchPulse Yearly" : "MerchPulse Monthly";

    // Important: keep host + plan in returnUrl so confirm page can route back cleanly
    const returnUrl =
      `${APP_URL}/app/billing/confirm?plan=${encodeURIComponent(plan)}` +
      (host ? `&host=${encodeURIComponent(host)}` : "");

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: SUB_CREATE,
      variables: {
        name,
        returnUrl,
        trialDays: 7,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: price, currencyCode: "CAD" },
                interval,
              },
            },
          },
        ],
      },
    });

    const payload = data?.appSubscriptionCreate;
    const userErrors = payload?.userErrors || [];
    if (userErrors.length) {
      return NextResponse.json(
        {
          error: "Billing create failed",
          details: userErrors.map((e: any) => e.message).join(" | "),
        },
        { status: 400 }
      );
    }

    const confirmationUrl = payload?.confirmationUrl;
    if (!confirmationUrl) {
      return NextResponse.json({ error: "Missing confirmationUrl from Shopify" }, { status: 500 });
    }

    return NextResponse.json({ confirmationUrl });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Billing create failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
