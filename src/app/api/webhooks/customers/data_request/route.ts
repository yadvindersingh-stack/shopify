import { NextRequest } from "next/server";
import { handleShopifyWebhook } from "@/lib/webhooks/handle-shopify-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handleShopifyWebhook(req, "customers/data_request");
}
