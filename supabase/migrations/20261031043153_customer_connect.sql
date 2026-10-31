-- Separate from the existing Gary Auth/team tables and the exposed public schema.
CREATE SCHEMA IF NOT EXISTS customer_connect;
REVOKE ALL ON SCHEMA customer_connect FROM PUBLIC, anon, authenticated;

CREATE TABLE customer_connect.customer_submissions (
  id text PRIMARY KEY,
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  intent text NOT NULL,
  services jsonb NOT NULL,
  representative_name text NOT NULL,
  representative_company text NOT NULL,
  representative_email text NOT NULL,
  representative_phone text NOT NULL,
  representative_code text NOT NULL,
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  contact_preference text NOT NULL,
  overall_rating integer,
  payload jsonb NOT NULL
);

CREATE TABLE customer_connect.site_qr_codes (
  id text PRIMARY KEY,
  destination text NOT NULL,
  asset_key text NOT NULL,
  mime_type text NOT NULL,
  version text NOT NULL,
  mode text NOT NULL,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL
);

-- Access only through server routes using the privileged DATABASE_URL.
ALTER TABLE customer_connect.customer_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_connect.site_qr_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA customer_connect FROM PUBLIC, anon, authenticated;

-- No public Storage policies: only the server secret can read/write this bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('customer-connect-qr', 'customer-connect-qr', false, 1048576,
        ARRAY['image/png', 'image/svg+xml'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Existing apps may have permissive policies covering all Storage buckets.
-- Restrict this bucket even in that case, without affecting their other objects.
CREATE POLICY customer_connect_qr_server_only ON storage.objects
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'customer-connect-qr')
WITH CHECK (bucket_id <> 'customer-connect-qr');
