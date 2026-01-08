import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseState(state?: string | null): { host?: string } {
  if (!state) return {};
  try {
    const json = Buffer.from(state, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").toLowerCase();
  const code = req.nextUrl.searchParams.get("code") || "";
  const hostParam = req.nextUrl.searchParams.get("host");
  const state = req.nextUrl.searchParams.get("state");

  const stateHost = parseState(state).host;
  const host = hostParam || stateHost || "";

  // MARKER WRITE — proves callback is hit
  const marker = `cb-hit-${Date.now()}.myshopify.com`;

  const { error } = await supabase.from("shops").upsert({
    shop_domain: marker,
    access_token: "marker",
    email: "marker@example.com",
  });

  if (error) {
    return NextResponse.json({ ok: false, step: "upsert_marker", error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hit: "oauth_callback",
    received: { shop, hasCode: Boolean(code), hostPresent: Boolean(host) },
    wrote_marker_row: marker,
  });
}
