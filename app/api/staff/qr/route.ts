import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { siteQrCodes } from "@/db/schema";
import { MAX_QR_UPLOAD, QR_ID, normalizeQrDestination, qrSvg, validateQrPng } from "@/lib/qr";
import { currentQrRecord, publicQr } from "@/lib/qr-store";
import { requireGaryStaff, StaffError, staffErrorResponse } from "@/lib/staff-auth";
export const dynamic = "force-dynamic";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function boundedBody(request: Request, maximum: number) {
  if (Number(request.headers.get("content-length")) > maximum) throw new StaffError("Upload a PNG image up to 1 MB.", 413);
  const reader = request.body?.getReader(); if (!reader) throw new StaffError("Choose a QR code to save.");
  const chunks: Uint8Array[] = []; let length = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > maximum) { await reader.cancel(); throw new StaffError("Upload a PNG image up to 1 MB.", 413); } chunks.push(value); }
  const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
export async function GET(request: Request) {
  try { const staff = await requireGaryStaff(request); return json({ staff, qr: publicQr(await currentQrRecord()) }); }
  catch (error) { return staffErrorResponse(error); }
}
export async function POST(request: Request) {
  let newKey: string | null = null;
  try {
    const staff = await requireGaryStaff(request);
    if (!env.BUCKET) throw new StaffError("QR storage is not available yet.", 503);
    const contentType = request.headers.get("content-type") || "";
    let destination: string; let expectedVersion: unknown; let bytes: Uint8Array; let mimeType: string; let mode: string;
    if (contentType.includes("application/json")) {
      let payload: { destination?: unknown; expectedVersion?: unknown; mode?: unknown };
      try { payload = JSON.parse(new TextDecoder().decode(await boundedBody(request, 4096))); } catch (error) { if (error instanceof StaffError) throw error; throw new StaffError("Choose a QR code to save."); }
      if (payload.mode !== "generate") throw new StaffError("Choose a QR code to save.");
      try { destination = normalizeQrDestination(payload.destination); } catch (error) { throw new StaffError((error as Error).message); }
      expectedVersion = payload.expectedVersion; bytes = new TextEncoder().encode(qrSvg(destination)); mimeType = "image/svg+xml"; mode = "generate";
    } else if (contentType.includes("multipart/form-data")) {
      const raw = await boundedBody(request, MAX_QR_UPLOAD + 16384);
      let form: FormData; try { form = await new Response(raw, { headers: { "Content-Type": contentType } }).formData(); } catch { throw new StaffError("Upload a valid PNG image."); }
      const file = form.get("image");
      if (!(file instanceof File) || file.type !== "image/png" || file.size > MAX_QR_UPLOAD) throw new StaffError("Upload a PNG image up to 1 MB.");
      bytes = new Uint8Array(await file.arrayBuffer());
      try { validateQrPng(bytes); destination = normalizeQrDestination(form.get("destination")); } catch (error) { throw new StaffError((error as Error).message); }
      expectedVersion = form.get("expectedVersion"); mimeType = "image/png"; mode = "upload";
    } else throw new StaffError("Choose a QR code to save.", 415);
    if (typeof expectedVersion !== "string" || expectedVersion.length > 80) throw new StaffError("Reload the current QR code before saving.", 409);
    const existing = await currentQrRecord();
    if ((existing?.version || "default") !== expectedVersion) throw new StaffError("The QR code changed. Reload it before saving your replacement.", 409);
    const version = crypto.randomUUID(); newKey = `qr/${version}.${mode === "upload" ? "png" : "svg"}`;
    await env.BUCKET.put(newKey, bytes, { httpMetadata: { contentType: mimeType } });
    const record = { id: QR_ID, destination, assetKey: newKey, mimeType, version, mode, updatedBy: staff.userId, updatedAt: new Date() };
    const db = getDb();
    const saved = existing ? await db.update(siteQrCodes).set(record).where(and(eq(siteQrCodes.id, QR_ID), eq(siteQrCodes.version, expectedVersion))).returning() : await db.insert(siteQrCodes).values(record).onConflictDoNothing({ target: siteQrCodes.id }).returning();
    if (!saved.length) throw new StaffError("The QR code changed. Reload it before saving your replacement.", 409);
    newKey = null;
    return json({ qr: publicQr(saved[0]) });
  } catch (error) {
    if (newKey) { try { await env.BUCKET?.delete(newKey); } catch { /* A failed cleanup never changes the saved QR pointer. */ } }
    return staffErrorResponse(error);
  }
}
