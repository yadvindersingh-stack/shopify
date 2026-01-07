import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop") || "missing-shop";
  const code = req.nextUrl.searchParams.get("code") || "missing-code";
  const host = req.nextUrl.searchParams.get("host") || "missing-host";
  const state = req.nextUrl.searchParams.get("state") || "";

  const markerShop = `oauth-${Date.now()}.myshopify.com`;

  const { error } = await supabase.from("shops").upsert(
    {
      shop_domain: markerShop,
      access_token: `code:${code}`.slice(0, 200),
      email: "probe@example.com",
      timezone: "UTC",
    },
    { onConflict: "shop_domain" }
  );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hit: "oauth_callback",
    received: { shop, hasCode: code !== "missing-code", host, statePresent: Boolean(state) },
    wrote_marker_row: markerShop,
  });
}
