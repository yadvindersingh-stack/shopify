import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const shop = req.nextUrl.searchParams.get("shop");
  const code = req.nextUrl.searchParams.get("code");
  const host = req.nextUrl.searchParams.get("host");
  const state = req.nextUrl.searchParams.get("state");

  // This response will show directly in the browser during install if callback is hit.
  return NextResponse.json({
    ok: true,
    hit: "callback",
    shop,
    hasCode: Boolean(code),
    host,
    statePresent: Boolean(state),
    path: req.nextUrl.pathname,
  });
}
