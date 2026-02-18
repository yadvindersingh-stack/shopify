import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";
import { shopifyGraphql } from "@/lib/shopify-admin";
// Optional: persist to DB if you have a place
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUERY = `
query ActiveSubs {
  currentAppInstallation {
    activeSubscriptions {
      id
      name
      status
    }
  }
}
`;

export async function POST(req: NextRequest) {
  try {
    const shop = await resolveShop(req);
    const { plan } = await req.json().catch(() => ({ plan: "" }));

    const data = await shopifyGraphql({
      shop: shop.shop_domain,
      accessToken: shop.access_token,
      query: QUERY,
      variables: {},
    });

    const subs = data?.currentAppInstallation?.activeSubscriptions || [];
    const active = subs.find((s: any) => s.status === "ACTIVE") || null;

    // Optional persistence (only if you want it now)
    // If you don't have billing columns/table, comment this out.
    // Example: store on shops table if you added columns.
    try {
      await supabase
        .from("shops")
        .update({
          // add these columns if you want; otherwise remove this block
          // billing_plan: plan || null,
          // billing_status: active ? "active" : "inactive",
        } as any)
        .eq("id", shop.id);
    } catch {}

    return NextResponse.json({
      ok: true,
      active: Boolean(active),
      active_subscription: active,
      plan: plan || null,
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
