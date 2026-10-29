import { env } from "cloudflare:workers";
import { createClient } from "@supabase/supabase-js";

export class StaffError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) { super(message); }
}
export function staffPublicConfig(values: { SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string } = env) {
  const url = values.SUPABASE_URL || ""; const key = values.SUPABASE_PUBLISHABLE_KEY || "";
  let publicKey = key.startsWith("sb_publishable_");
  if (!publicKey && key.split(".").length === 3) { try { publicKey = JSON.parse(atob(key.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).role === "anon"; } catch { /* Reject secret or malformed keys. */ } }
  let validUrl = false; try { validUrl = new URL(url).protocol === "https:"; } catch { /* Configuration is unavailable. */ }
  if (!validUrl || !publicKey) throw new StaffError("Staff sign-in is not configured yet.", 503);
  return { url, key };
}
export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new StaffError("Please send the form from this website.", 403);
}
export async function requireGaryStaff(request: Request) {
  enforceSameOrigin(request);
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 8000) throw new StaffError("Sign in with your Gary staff account to continue.", 401);
  const { url, key } = staffPublicConfig();
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new StaffError(error && (!error.status || error.status >= 500) ? "We couldn’t verify your staff account. Please try again." : "Your session has expired. Please sign in again.", error && (!error.status || error.status >= 500) ? 503 : 401);
  if (!data.user.email_confirmed_at || data.user.is_anonymous) throw new StaffError("Active Gary staff access is required.", 403);
  if (data.user.factors?.some((factor) => factor.status === "verified")) {
    let aal = ""; try { aal = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).aal; } catch { /* The token was checked by getUser; unreadable assurance fails closed. */ }
    if (aal !== "aal2") throw new StaffError("Complete your account verification before managing the QR code.", 403, "mfa_required");
  }
  // Read current membership through the existing Gary RLS policy; never trust user_metadata roles.
  const membership = await db.from("team_members").select("role,active").eq("user_id", data.user.id).eq("active", true).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (membership.error) throw new StaffError("We couldn’t verify your staff permissions. Please try again.", 503);
  if (!membership.data?.active || !["owner", "admin", "manager", "editor"].includes(membership.data.role)) throw new StaffError("Active Gary staff access is required.", 403);
  return { userId: data.user.id, email: data.user.email || "", role: membership.data.role as string };
}
export function staffErrorResponse(error: unknown) {
  return Response.json({ error: error instanceof StaffError ? error.message : "The QR code could not be saved. Please try again.", ...(error instanceof StaffError && error.code ? { code: error.code } : {}) }, { status: error instanceof StaffError ? error.status : 503, headers: { "Cache-Control": "no-store" } });
}
