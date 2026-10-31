import "server-only";
import { createClient } from "@supabase/supabase-js";

export const QR_BUCKET = "customer-connect-qr";

/** Private bucket access is confined to server routes, after staff authorization for writes. */
export function getQrStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase QR storage is not configured.");
  const storage = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
  }).storage.from(QR_BUCKET);

  return {
    async put(key: string, bytes: Uint8Array, mimeType: string) {
      const { error } = await storage.upload(key, bytes, { contentType: mimeType, upsert: false });
      if (error) throw error;
    },
    async get(key: string) {
      const { data, error } = await storage.download(key);
      if (error) throw error;
      return data;
    },
    async delete(key: string) {
      const { error } = await storage.remove([key]);
      if (error) throw error;
    },
  };
}
