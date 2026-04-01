import { NextRequest, NextResponse } from "next/server";
import { resolveShop, HttpError } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const host = typeof body?.host === "string" ? body.host : "";

    const shop = await resolveShop(req);

    const params = new URLSearchParams();
    if (host) params.set("host", host);
    params.set("shop", shop.shop_domain);

    const pricingUrl = new URL(`/api/billing/redirect?${params.toString()}`, req.nextUrl.origin).toString();

    return NextResponse.json({ pricingUrl });
  } catch (e: any) {
    if (e instanceof HttpError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: "Billing redirect failed", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
