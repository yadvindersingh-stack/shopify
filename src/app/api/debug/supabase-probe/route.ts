import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Write a known row
  const markerShop = `probe-${Date.now()}.myshopify.com`;

  const { data: upserted, error: upsertError } = await supabase
    .from("shops")
    .upsert(
      {
        shop_domain: markerShop,
        access_token: "probe",
        email: "probe@example.com",
        timezone: "UTC",
      },
      { onConflict: "shop_domain" }
    )
    .select("shop_domain")
    .single();

  if (upsertError) {
    return NextResponse.json(
      { ok: false, step: "upsert", error: upsertError.message },
      { status: 500 }
    );
  }

  // Read back
  const { data: rows, error: readError } = await supabase
    .from("shops")
    .select("shop_domain")
    .order("created_at", { ascending: false })
    .limit(5);

  if (readError) {
    return NextResponse.json(
      { ok: false, step: "read", error: readError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, inserted: upserted, recent: rows });
}
