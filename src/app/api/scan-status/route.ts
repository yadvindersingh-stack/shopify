import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveShop, HttpError } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const { data, error } = await supabase
      .from("scan_runs")
      .select("last_scan_at,next_scan_at,last_scan_status,last_scan_summary")
      .eq("shop_id", shop.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      last_scan_at: data?.last_scan_at ?? null,
      next_scan_at: data?.next_scan_at ?? null,
      last_scan_status: data?.last_scan_status ?? null,
      last_scan_summary: data?.last_scan_summary ?? null,
    });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Failed to read scan status", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
