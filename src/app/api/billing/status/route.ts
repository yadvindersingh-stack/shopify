// src/app/api/billing/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BILLING_STATUS_QUERY = `
query BillingStatus {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
    }
  }
}
`;

export async function GET(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: BILLING_STATUS_QUERY,
      variables: {},
    });

    const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
    const active = Array.isArray(subs) && subs.length > 0;

    return NextResponse.json({
      active,
      subscriptions: subs.map((s: any) => ({ name: s?.name, status: s?.status })),
    });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Failed to read billing status", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
