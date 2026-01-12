import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const marker = `cb-hit-${Date.now()}.myshopify.com`;
  const { error } = await supabase.from("shops").upsert({
    shop_domain: marker,
    access_token: "marker",
    email: "marker@example.com",
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, marker });
}
