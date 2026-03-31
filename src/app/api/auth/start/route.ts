import { NextRequest, NextResponse } from "next/server";
import { buildPathWithHost } from "@/lib/host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APP_URL = (process.env.SHOPIFY_APP_URL || "").replace(/\/$/, "");

export async function GET(req: NextRequest) {
  const shop = (req.nextUrl.searchParams.get("shop") || "").trim().toLowerCase();
  const host = (req.nextUrl.searchParams.get("host") || "").trim();

  if (!APP_URL) {
    return NextResponse.json({ ok: false, error: "Missing SHOPIFY_APP_URL" }, { status: 500 });
  }

  const target = new URL(buildPathWithHost("/app", host || undefined, shop || undefined), APP_URL);
  return NextResponse.redirect(target, 302);
}
