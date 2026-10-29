declare namespace Cloudflare {
  interface Env {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
