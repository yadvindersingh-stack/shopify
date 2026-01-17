import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const marker = `probe-${Date.now()}.myshopify.com`;

  const { error: upsertErr } = await supabase.from("shops").upsert({
    shop_domain: marker,
    access_token: "marker",
    email: "marker@example.com",
    timezone: "UTC",
  });

  const { data, error: readErr } = await supabase
    .from("shops")
    .select("shop_domain, created_at")
    .eq("shop_domain", marker)
    .maybeSingle();

  return NextResponse.json({
    ok: !upsertErr && !readErr && !!data,
    marker,
    upsertErr: upsertErr?.message || null,
    readErr: readErr?.message || null,
    env: {
      SUPABASE_URL_present: Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL),
      SERVICE_ROLE_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    found: data || null,
  });
}
