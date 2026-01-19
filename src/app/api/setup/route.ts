import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveShop, HttpError } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email : null;
    const daily_enabled = Boolean(body.daily_enabled);
    const weekly_enabled = Boolean(body.weekly_enabled);

    const { error } = await supabase.from("digest_settings").upsert({
      shop_id: shop.id,
      email,
      daily_enabled,
      weekly_enabled,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Setup failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const shop = await resolveShop(req);

    const { data, error } = await supabase
      .from("digest_settings")
      .select("email, daily_enabled, weekly_enabled")
      .eq("shop_id", shop.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data || {});
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Setup fetch failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
