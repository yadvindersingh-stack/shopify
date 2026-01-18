import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  console.log("CALLBACK HIT", req.url);
  return NextResponse.json({
    ok: true,
    msg: "callback hit",
    url: req.url,
    params: Object.fromEntries(req.nextUrl.searchParams.entries()),
  });
}
