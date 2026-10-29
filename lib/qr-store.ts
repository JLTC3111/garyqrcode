import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { siteQrCodes } from "@/db/schema";
import { DEFAULT_QR_DESTINATION, DEFAULT_QR_IMAGE, QR_ID, type PublicQr } from "./qr";

export async function currentQrRecord() {
  const [record] = await getDb().select().from(siteQrCodes).where(eq(siteQrCodes.id, QR_ID)).limit(1);
  return record || null;
}
export function publicQr(record: Awaited<ReturnType<typeof currentQrRecord>>): PublicQr {
  return record ? { destination: record.destination, imageUrl: `/api/qr/image?v=${record.version}`, version: record.version, mode: record.mode, updatedAt: record.updatedAt.toISOString() } : { destination: DEFAULT_QR_DESTINATION, imageUrl: DEFAULT_QR_IMAGE, version: "default", mode: "generate", updatedAt: null };
}
