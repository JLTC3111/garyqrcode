import { eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { getDb } from "@/db";
import { customerSubmissions } from "@/db/schema";
import { cleanSubmission, intakeSchema } from "@/lib/intake";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "no-store" };
const reply = (body: unknown, status: number) => Response.json(body, { status, headers: responseHeaders });

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") return reply({ error: "Please send the form from this website." }, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return reply({ error: "This request must contain JSON." }, 415);
  if (Number(request.headers.get("content-length")) > 30_000) return reply({ error: "Your submission is too large. Please shorten your notes." }, 413);
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) return reply({ error: "Please refresh the page and try again." }, 400);

  let payload: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 30_000) return reply({ error: "Your submission is too large. Please shorten your notes." }, 413);
    payload = JSON.parse(raw);
  } catch { return reply({ error: "We couldn’t read your form. Please try again." }, 400); }
  const parsed = intakeSchema.safeParse(payload);
  if (!parsed.success) return reply({ error: "Please check the highlighted fields.", fields: parsed.error.flatten().fieldErrors }, 400);
  if (parsed.data.website) return reply({ error: "We couldn’t accept this submission." }, 400);
  const data = cleanSubmission(parsed.data);
  try {
    const db = getDb();
    const existing = await db.select({ reference: customerSubmissions.reference, payload: customerSubmissions.payload }).from(customerSubmissions).where(eq(customerSubmissions.id, key)).limit(1);
    if (existing.length) {
      if (!isDeepStrictEqual(existing[0].payload, data)) return reply({ error: "This request has already been sent. Start a new request to make changes." }, 409);
      return reply({ reference: existing[0].reference }, 200);
    }
    const reference = `GARY-${key.replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    const inserted = await db.insert(customerSubmissions).values({
      id: key, reference, createdAt: new Date(), intent: data.intent, services: data.services,
      representativeName: data.repName, representativeCompany: data.repCompany, representativeEmail: data.repEmail, representativePhone: data.repPhone, representativeCode: data.repCode,
      customerName: `${data.firstName} ${data.lastName}`.trim(), customerEmail: data.email, customerPhone: data.phone, contactPreference: data.contactPreference,
      overallRating: data.intent === "help" ? null : data.overallRating, payload: data,
    }).onConflictDoNothing({ target: customerSubmissions.id }).returning({ reference: customerSubmissions.reference });
    if (!inserted.length) {
      const [saved] = await db.select({ reference: customerSubmissions.reference, payload: customerSubmissions.payload }).from(customerSubmissions).where(eq(customerSubmissions.id, key)).limit(1);
      if (!saved || !isDeepStrictEqual(saved.payload, data)) return reply({ error: "This request has already been sent. Start a new request to make changes." }, 409);
      return reply({ reference: saved.reference }, 200);
    }
    return reply({ reference }, 201);
  } catch {
    return reply({ error: "Your form hasn’t been saved yet. Please try again in a moment; your answers are still here." }, 503);
  }
}
