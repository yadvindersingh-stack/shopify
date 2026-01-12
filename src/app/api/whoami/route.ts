import { NextRequest, NextResponse } from "next/server";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();
  if (!shop) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, shop });
}
