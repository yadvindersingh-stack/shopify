import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = process.env.SHOPIFY_APP_URL!;

function planConfig(plan: string) {
  if (plan === "monthly") {
    return { name: "MerchPulse Monthly", interval: "EVERY_30_DAYS", amount: 9.0 };
  }
  if (plan === "yearly") {
    return { name: "MerchPulse Yearly", interval: "ANNUAL", amount: 99.0 };
  }
  throw new Error("Invalid plan");
}

const MUTATION = `
mutation CreateSubscription($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $test: Boolean!) {
  appSubscriptionCreate(
    name: $name
    returnUrl: $returnUrl
    lineItems: $lineItems
    test: $test
  ) {
    confirmationUrl
    userErrors { field message }
  }
}
`;

export async function POST(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const url = new URL(req.url);
    const plan = url.searchParams.get("plan") || "monthly";
    const host = url.searchParams.get("host") || "";

    const cfg = planConfig(plan);

    // Return URL must be inside your app and include host so App Bridge can load it.
    const returnUrl = `${APP_URL}/app/billing/confirm?plan=${encodeURIComponent(
      plan
    )}&host=${encodeURIComponent(host)}`;

    // In dev stores / review you often want test=true. For production paid installs set false.
    const test = process.env.SHOPIFY_BILLING_TEST_MODE === "true";

    const lineItems = [
      {
        plan: {
          appRecurringPricingDetails: {
            price: { amount: cfg.amount, currencyCode: "CAD" },
            interval: cfg.interval,
          },
        },
      },
    ];

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: MUTATION,
      variables: {
        name: cfg.name,
        returnUrl,
        lineItems,
        test,
      },
    });

    const payload = data?.appSubscriptionCreate;
    const userErrors = payload?.userErrors || [];
    if (userErrors.length) {
      return NextResponse.json(
        { error: "Billing create failed", details: userErrors.map((e: any) => e.message).join("; ") },
        { status: 400 }
      );
    }

    const confirmationUrl = payload?.confirmationUrl;
    if (!confirmationUrl) {
      return NextResponse.json(
        { error: "Billing create failed", details: "Missing confirmationUrl" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, confirmationUrl });
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
