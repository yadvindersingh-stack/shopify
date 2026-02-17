import { NextRequest, NextResponse } from "next/server";
import { resolveShop } from "@/lib/shopify";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { chargeId } = await req.json();
  const shop = await resolveShop(req);

  // For now we trust approval if Shopify redirected.
  // (Production: verify subscription status via GraphQL)

  await supabase
    .from("shops")
    .update({
      billing_status: "active",
      plan: "monthly" // or detect yearly via metadata if needed
    })
    .eq("id", shop.id);

  return NextResponse.json({ ok: true });
}
