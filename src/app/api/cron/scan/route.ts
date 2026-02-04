import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { runScanForShop } from "@/lib/insights/run-scan";
import { sendDailyDigestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Real auth: Vercel cron requests must include:
 * Authorization: Bearer <CRON_SECRET>
 */
function requireCronAuth(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || process.env.CRON_SECRET;
  if (!secret) {
    // If you haven't set CRON_SECRET yet, fail closed so you don't accidentally expose this in prod.
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

/**
 * Decide if it's time to send the daily email.
 * Simple rule: only send on "auto" run, only if daily_enabled, and only once per day.
 * We'll use scan_runs.last_scan_summary.email_sent_on to prevent duplicates.
 */
function todayKeyUTC() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  try {
    requireCronAuth(req);

    const now = new Date();
    const nowIso = now.toISOString();

    // Fetch all shops + scan_runs + digest_settings in one go (simple + reliable).
    // If you have lots of shops later, you’ll paginate.
    const { data: shops, error: shopsErr } = await supabase
      .from("shops")
      .select("id, shop_domain, access_token");
    if (shopsErr) {
      return NextResponse.json({ error: "Failed to load shops", details: shopsErr.message }, { status: 500 });
    }

    const shopIds = (shops || []).map((s: any) => s.id);

    const { data: runs, error: runsErr } = await supabase
      .from("scan_runs")
      .select("shop_id, last_scan_at, next_scan_at, last_scan_summary")
      .in("shop_id", shopIds);
    if (runsErr) {
      return NextResponse.json({ error: "Failed to load scan_runs", details: runsErr.message }, { status: 500 });
    }

    const { data: settingsRows, error: settingsErr } = await supabase
      .from("digest_settings")
      .select("shop_id, email, daily_enabled")
      .in("shop_id", shopIds);
    if (settingsErr) {
      return NextResponse.json({ error: "Failed to load digest_settings", details: settingsErr.message }, { status: 500 });
    }

    const runByShop = new Map<string, any>();
    for (const r of runs || []) runByShop.set(r.shop_id, r);

    const settingsByShop = new Map<string, any>();
    for (const s of settingsRows || []) settingsByShop.set(s.shop_id, s);

    // Determine due shops:
    // - no scan_runs row => due
    // - next_scan_at null => due
    // - next_scan_at <= now => due
    const dueShops = (shops || []).filter((s: any) => {
      if (!s?.access_token) return false; // not installed / no token
      const r = runByShop.get(s.id);
      if (!r) return true;
      if (!r.next_scan_at) return true;
      return new Date(r.next_scan_at).getTime() <= now.getTime();
    });

    const results: any[] = [];
    const today = todayKeyUTC();

    // Sequential to avoid Shopify throttling while you're early.
    for (const s of dueShops) {
      try {
        const summary = await runScanForShop({
          shopId: s.id,
          shopDomain: s.shop_domain,
          accessToken: s.access_token,
          mode: "auto",
        });

        // Optional: send daily email if configured, but never block scan.
        const ds = settingsByShop.get(s.id);
        const prevRun = runByShop.get(s.id);
        const prevSummary = prevRun?.last_scan_summary || {};
        const lastEmailSentOn = prevSummary?.email_sent_on;

        const shouldEmail =
          ds?.daily_enabled === true &&
          typeof ds?.email === "string" &&
          ds.email.length > 3 &&
          lastEmailSentOn !== today;

        if (shouldEmail) {
          try {
            const inserted = Array.isArray(summary?.keys) ? summary.keys.length : 0;
            const subject =
              inserted > 0
                ? `MerchPulse — ${inserted} new issue${inserted === 1 ? "" : "s"} detected`
                : "MerchPulse — Daily scan complete";

            // Keep body compact for now (you already did compact template).
            const body =
              inserted > 0
                ? `Today’s scan found ${inserted} new item(s):\n\n- ${summary.keys.join("\n- ")}\n\nOpen MerchPulse to see details.`
                : "Today’s scan completed and found no new issues.\n\nOpen MerchPulse to review your latest insights.";

            await sendDailyDigestEmail({ to: ds.email, subject, body });

            // Record that we emailed today in scan_runs.last_scan_summary (non-breaking)
            const mergedSummary = {
              ...(summary || {}),
              email_sent_on: today,
              emailed_to: ds.email,
            };

            await supabase.from("scan_runs").upsert(
              {
                shop_id: s.id,
                last_scan_summary: mergedSummary,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "shop_id" }
            );
          } catch (e: any) {
            console.log("CRON_EMAIL_FAILED", s.shop_domain, e?.message || String(e));
          }
        }

        results.push({ shop: s.shop_domain, ok: true, summary });
      } catch (e: any) {
        results.push({ shop: s.shop_domain, ok: false, error: e?.message || String(e) });
      }
    }

    return NextResponse.json({
      ok: true,
      now: nowIso,
      due: dueShops.length,
      ran: results.length,
      results,
    });
  } catch (e: any) {
    const status = e?.status || (String(e?.message || "").includes("Unauthorized") ? 401 : 500);
    return NextResponse.json({ error: "Cron scan failed", details: e?.message || String(e) }, { status });
  }
}
