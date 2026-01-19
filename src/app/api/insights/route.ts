import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveShop, HttpError } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const { data, error } = await supabase
      .from("insights")
      .select("*")
      .eq("shop_id", shop.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Failed to list insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
