import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runScanForShop } from "@/lib/insights/run-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real auth: Vercel cron requests must include:
 * Authorization: Bearer <CRON_SECRET>
 *
 * For manual testing (browser), you can pass ?secret=... (optional).
 */
function requireCronAuth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed (don’t expose cron in prod accidentally)
    throw new Error("CRON_SECRET not configured");
  }

  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;

  if (auth !== expected) {
    const err = new Error("Unauthorized cron");
    (err as any).status = 401;
    throw err;
  }
}

export async function GET(req: NextRequest) {
  try {
    requireCronAuth(req);

    const now = new Date();

    // 1) Load shops
    const { data: shops, error: shopsErr } = await supabase
      .from("shops")
      .select("id, shop_domain, access_token");

    if (shopsErr) {
      return NextResponse.json(
        { error: "Failed to load shops", details: shopsErr.message },
        { status: 500 }
      );
    }

    const shopIds = (shops || []).map((s: any) => s.id);

    // 2) Load scan_runs so we can find due shops
    const { data: runs, error: runsErr } = await supabase
      .from("scan_runs")
      .select("shop_id, next_scan_at")
      .in("shop_id", shopIds);

    if (runsErr) {
      return NextResponse.json(
        { error: "Failed to load scan_runs", details: runsErr.message },
        { status: 500 }
      );
    }

    const runByShop = new Map<string, any>();
    for (const r of runs || []) runByShop.set(r.shop_id, r);

    // 3) Determine due shops:
    // - has token
    // - scan_runs missing OR next_scan_at missing OR next_scan_at <= now
    const dueShops = (shops || []).filter((s: any) => {
      if (!s?.access_token) return false;
      const r = runByShop.get(s.id);
      if (!r) return true;
      if (!r.next_scan_at) return true;
      return new Date(r.next_scan_at).getTime() <= now.getTime();
    });

    const results: any[] = [];

    // Sequential for now (avoid Shopify throttling)
    for (const s of dueShops) {
      try {
        const summary = await runScanForShop({
          shopId: s.id,
          shopDomain: s.shop_domain,
          accessToken: s.access_token,
          mode: "auto",
        });

        results.push({ shop: s.shop_domain, ok: true, summary });
      } catch (e: any) {
        results.push({ shop: s.shop_domain, ok: false, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({
      ok: true,
      now: now.toISOString(),
      due: dueShops.length,
      ran: results.length,
      results,
    });
  } catch (e: any) {
    const status = e?.status || (String(e?.message || "").includes("Unauthorized") ? 401 : 500);
    return NextResponse.json(
      { error: "Cron scan failed", details: e?.message || String(e) },
      { status }
    );
  }
}
