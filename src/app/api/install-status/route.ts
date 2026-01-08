import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").toLowerCase();

  if (!shop) return NextResponse.json({ ok: true, installed: false, reason: "missing_shop" });

  const { data, error } = await supabase
    .from("shops")
    .select("shop_domain")
    .eq("shop_domain", shop)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, installed: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, installed: Boolean(data), shop });
}
