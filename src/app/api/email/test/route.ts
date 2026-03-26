import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { HttpError, resolveShop } from "@/lib/shopify";
import { sendDailyDigestEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const shop = await resolveShop(req);
    const { data: settings } = await supabase
      .from("digest_settings")
      .select("email")
      .eq("shop_id", shop.id)
      .single();

    if (!settings?.email) {
      return NextResponse.json({ error: "No email set" }, { status: 400 });
    }

    await sendDailyDigestEmail({
      to: settings.email,
      subject: "Test Daily Digest Email",
      body: "This is a test of the daily digest email system.",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "Failed to send test email", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
