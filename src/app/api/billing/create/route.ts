import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Plan = "monthly" | "yearly";

const SUB_CREATE = `
mutation appSubscriptionCreate(
  $name: String!,
  $returnUrl: URL!,
  $trialDays: Int,
  $test: Boolean,
  $lineItems: [AppSubscriptionLineItemInput!]!
) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    trialDays: $trialDays
    test: $test
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

    const shop = await resolveShop(req);

    const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");
    if (!APP_URL) return NextResponse.json({ error: "Missing SHOPIFY_APP_URL" }, { status: 500 });

    // Shopify appends charge_id to returnUrl after approval
    const returnUrl = `${APP_URL}/app/billing/confirm?plan=${plan}`;

    const price = plan === "yearly" ? "99.00" : "9.00";
    const interval = plan === "yearly" ? "ANNUAL" : "EVERY_30_DAYS";
    const name = plan === "yearly" ? "MerchPulse Yearly" : "MerchPulse Monthly";

    // Dev store safe default: test charge
    const isDevStore =
      shop.shop_domain.includes(".myshopify.com") &&
      (shop.shop_domain.includes("myshopify") || true);

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: SUB_CREATE,
      variables: {
        name,
        returnUrl,
        trialDays: 7,
        test: isDevStore ? true : false,
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
