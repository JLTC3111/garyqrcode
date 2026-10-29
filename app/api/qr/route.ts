import { currentQrRecord, publicQr } from "@/lib/qr-store";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json(publicQr(await currentQrRecord()), { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "The QR code is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
