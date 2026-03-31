import { NextRequest, NextResponse } from "next/server";
import { HttpError, resolveShop } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const shop = await resolveShop(req);
    return NextResponse.json({
      ok: true,
      installed: true,
      shop: shop.shop_domain,
      code: "installed",
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json(
        {
          ok: false,
          installed: false,
          shop: null,
          code: error.status === 401 ? "auth_required" : "shop_not_installed",
          error: error.message,
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      { ok: false, installed: false, shop: null, code: "install_status_failed", error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
