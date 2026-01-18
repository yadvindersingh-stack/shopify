import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {

    const shop = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();

    if (!shop) {
      return NextResponse.json({ error: "Missing shop context" }, { status: 401 });
    }

    // Look up the shop row to get its uuid id
    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("id")
      .eq("shop_domain", shop)
      .maybeSingle();

    if (shopErr) {
      return NextResponse.json({ error: "Failed to read shop", details: shopErr.message }, { status: 500 });
    }

    // If shop isn't installed yet, return empty list (not 500)
    if (!shopRow?.id) {
      return NextResponse.json([], { status: 200 });
    }

    const { data: insights, error: insErr } = await supabase
      .from("insights")
      .select("*")
      .eq("shop_id", shopRow.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (insErr) {
      return NextResponse.json({ error: "Failed to list insights", details: insErr.message }, { status: 500 });
    }

    return NextResponse.json(insights || []);
  } catch (e: any) {
        if (e instanceof Response) return e; // ✅ critical
    return NextResponse.json(
      { error: "Failed to list insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
