import { env } from "cloudflare:workers";
import { currentQrRecord } from "@/lib/qr-store";
import { DEFAULT_QR_IMAGE } from "@/lib/qr";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const current = await currentQrRecord();
    if (!current) return new Response(null, { status: 302, headers: { Location: new URL(DEFAULT_QR_IMAGE, request.url).href, "Cache-Control": "no-store" } });
    const etag = `"${current.version}"`;
    const headers = { "Content-Type": current.mimeType, "Cache-Control": "public, max-age=0, must-revalidate", "X-Content-Type-Options": "nosniff", ETag: etag, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const file = await env.BUCKET?.get(current.assetKey);
    if (!file) return new Response("QR unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
    return new Response(file.body, { headers });
  } catch { return new Response("QR unavailable", { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
