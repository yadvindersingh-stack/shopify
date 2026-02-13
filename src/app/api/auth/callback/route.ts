import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { exchangeCodeForToken, signSessionCookie } from "@/lib/shopify";
import { verifyCallbackHmac } from "@/lib/shopify-verify";
import { registerMandatoryWebhooks } from "@/lib/shopify-webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Validate Shopify callback signature
  const ok = verifyCallbackHmac(url);
  if (!ok) {
    return NextResponse.json({ error: "Invalid callback HMAC" }, { status: 401 });
  }

  const shop = (url.searchParams.get("shop") || "").toLowerCase();
  const code = url.searchParams.get("code") || "";
  const host = url.searchParams.get("host") || "";

  if (!shop || !code || !host) {
    return NextResponse.json(
      { error: "Missing required params", shopPresent: !!shop, codePresent: !!code, hostPresent: !!host },
      { status: 400 }
    );
  }

  // Exchange code for access token
  const accessToken = await exchangeCodeForToken(shop, code);

  // Persist token
  const { error: upsertErr } = await supabase
    .from("shops")
    .upsert(
      {
        shop_domain: shop,
        access_token: accessToken,
        email: null,
        timezone: "UTC",
      },
      { onConflict: "shop_domain" }
    );

  if (upsertErr) {
    return NextResponse.json({ error: "Failed to store shop token", details: upsertErr.message }, { status: 500 });
  }

  // Register mandatory compliance webhooks (Shopify review gate)
  await registerMandatoryWebhooks({ shop, accessToken });

  // Set session cookie so your API routes resolveShop works even without bearer header
  const cookie = await signSessionCookie(shop);

  // MUST redirect into embedded app UI immediately
  const redirectTo = `${process.env.SHOPIFY_APP_URL}/app?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}`;

  const res = NextResponse.redirect(redirectTo);
  res.headers.set("Set-Cookie", cookie);
  return res;
}
