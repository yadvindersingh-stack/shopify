import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeSubscriptionGid(chargeId: string) {
  const raw = (chargeId || "").trim();
  if (!raw) return null;

  // If Shopify already returns a gid, use it
  if (raw.startsWith("gid://shopify/AppSubscription/")) return raw;

  // Sometimes you get a numeric id; convert to gid
  if (/^\d+$/.test(raw)) return `gid://shopify/AppSubscription/${raw}`;

  // Otherwise unknown format
  return null;
}

const SUB_LOOKUP = `
query subLookup($id: ID!) {
  node(id: $id) {
    ... on AppSubscription {
      id
      name
      status
      test
    }
  }
}
`;

export async function POST(req: NextRequest) {
  try {
    const { chargeId, plan } = await req.json();
    const shop = await resolveShop(req);

    const gid = normalizeSubscriptionGid(chargeId);
    if (!gid) {
      return NextResponse.json({ error: "Missing/invalid chargeId" }, { status: 400 });
    }

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: SUB_LOOKUP,
      variables: { id: gid },
    });

    const sub = data?.node;
    if (!sub?.id) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 400 });
    }

    const status = String(sub.status || "").toUpperCase();
    const isActive = status === "ACTIVE";

    // Persist outcome
    const { error } = await supabase
      .from("shops")
      .update({
        billing_status: isActive ? "active" : "inactive",
        plan: plan === "yearly" ? "yearly" : "monthly",
        billing_subscription_id: sub.id,
        billing_activated_at: isActive ? new Date().toISOString() : null,
      })
      .eq("id", shop.id);

    if (error) {
      return NextResponse.json({ error: "Failed to persist billing", details: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status,
      subscriptionId: sub.id,
    });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Billing confirm failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
