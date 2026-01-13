import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { shopifyGraphql } from "@/lib/shopify-admin";
import { INSIGHT_CONTEXT_QUERY } from "@/lib/queries/insight-context";
import { buildInsightContext } from "@/core/insights/build-context";
import { evaluateSalesRhythmDrift } from "@/core/insights/sales-rhythm-drift";
import { getShopFromRequestAuthHeader } from "@/lib/shopify-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeShop(shop?: string | null) {
  return (shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

export async function POST(req: NextRequest) {
  try {
    // 1) Prefer Shopify session token
    const shopFromToken = getShopFromRequestAuthHeader(req.headers.get("authorization"))?.toLowerCase();

    // 2) Fallback to query param (useful when UI fetch isn't using useApiFetch yet)
    const shopFromQuery = normalizeShop(req.nextUrl.searchParams.get("shop"));

    const shop = shopFromToken || (shopFromQuery || null);

    if (!shop) {
      return NextResponse.json(
        { error: "Missing shop context", hint: "No valid Shopify session token (Authorization) and no shop query param." },
        { status: 401 }
      );
    }

    const { data: shopRow, error: shopErr } = await supabase
      .from("shops")
      .select("access_token")
      .eq("shop_domain", shop)
      .maybeSingle();

    if (shopErr) {
      return NextResponse.json({ error: "Failed to read shop token", details: shopErr.message }, { status: 500 });
    }

    if (!shopRow?.access_token) {
      return NextResponse.json(
        { error: "Shop not installed or missing access token", shop },
        { status: 403 }
      );
    }

 const sinceIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
const ordersQuery = `created_at:>=${sinceIso}`;

const data = await shopifyGraphql({
  shop,
  accessToken: shopRow.access_token,
  query: INSIGHT_CONTEXT_QUERY,
  variables: { ordersQuery },
});


    const ctx = buildInsightContext(shop, new Date(), data);
    const insight = await evaluateSalesRhythmDrift(ctx);

    return NextResponse.json({ insight });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Failed to run insights", details: e?.message || String(e) },
      { status: 500 }
    );
  }
}
