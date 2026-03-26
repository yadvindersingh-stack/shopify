import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();

  if (!shop) {
    return NextResponse.json(
      { ok: false, installed: false, shop: null, code: "auth_required" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("shops")
    .select("shop_domain")
    .eq("shop_domain", shop)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { ok: false, installed: false, shop, code: "install_status_failed", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    installed: Boolean(data),
    shop,
    code: data ? "installed" : "shop_not_installed",
  });
}
