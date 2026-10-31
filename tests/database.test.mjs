import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTestDatabase } from "./helpers/postgres.mjs";

const { database } = await createTestDatabase();
after(() => database.close());

test("migration keeps customer information and staff QR records inaccessible to public roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    const { rows: [privileges] } = await database.query(`
      SELECT has_schema_privilege($1, 'customer_connect', 'USAGE') AS schema_access,
        has_table_privilege($1, 'customer_connect.customer_submissions', 'SELECT,INSERT,UPDATE,DELETE') AS submissions_access,
        has_table_privilege($1, 'customer_connect.site_qr_codes', 'SELECT,INSERT,UPDATE,DELETE') AS qr_access
    `, [role]);
    assert.deepEqual(privileges, { schema_access: false, submissions_access: false, qr_access: false });
    await database.exec(`SET ROLE ${role}`);
    try {
      await assert.rejects(database.query("SELECT * FROM customer_connect.customer_submissions"), /permission denied/);
      await assert.rejects(database.query("SELECT * FROM customer_connect.site_qr_codes"), /permission denied/);
    } finally {
      await database.exec("RESET ROLE");
    }
  }
});

test("both private tables also enable RLS without permissive public policies", async () => {
  const { rows } = await database.query(`
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'customer_connect' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  assert.deepEqual(rows, [
    { relname: "customer_submissions", relrowsecurity: true },
    { relname: "site_qr_codes", relrowsecurity: true },
  ]);
  assert.deepEqual((await database.query("SELECT * FROM pg_policies WHERE schemaname = 'customer_connect'")).rows, []);
});

test("migration provisions a private QR bucket with the application upload limits", async () => {
  const { rows: [bucket] } = await database.query("SELECT * FROM storage.buckets WHERE id = 'customer-connect-qr'");
  assert.equal(bucket.public, false);
  assert.equal(Number(bucket.file_size_limit), 1048576);
  assert.deepEqual(bucket.allowed_mime_types.sort(), ["image/png", "image/svg+xml"]);
});

test("QR objects stay private even when the shared Storage schema has a blanket public policy", async () => {
  // Existing Gary projects may grant broader Storage access for other applications.
  await database.exec(`
    GRANT USAGE ON SCHEMA storage TO anon, authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
    CREATE POLICY existing_shared_access ON storage.objects
      AS PERMISSIVE FOR ALL TO anon, authenticated
      USING (true) WITH CHECK (true);
    INSERT INTO storage.objects (id, bucket_id) VALUES
      ('protected-qr', 'customer-connect-qr'), ('existing-public-object', 'another-app');
  `);
  for (const role of ["anon", "authenticated"]) {
    await database.exec(`SET ROLE ${role}`);
    try {
      assert.deepEqual((await database.query("SELECT id FROM storage.objects ORDER BY id")).rows, [{ id: "existing-public-object" }]);
      assert.deepEqual((await database.query("UPDATE storage.objects SET bucket_id = 'another-app' WHERE id = 'protected-qr' RETURNING id")).rows, []);
      assert.deepEqual((await database.query("DELETE FROM storage.objects WHERE id = 'protected-qr' RETURNING id")).rows, []);
      await assert.rejects(database.query("INSERT INTO storage.objects (id, bucket_id) VALUES ($1, 'customer-connect-qr')", [`forbidden-${role}`]), /row-level security/);
      await assert.rejects(database.query("UPDATE storage.objects SET bucket_id = 'customer-connect-qr' WHERE id = 'existing-public-object'"), /row-level security/);

      // Keep the pre-existing policy's behavior for unrelated apps.
      assert.deepEqual((await database.query("INSERT INTO storage.objects (id, bucket_id) VALUES ($1, 'another-app') RETURNING id", [`allowed-${role}`])).rows, [{ id: `allowed-${role}` }]);
      assert.deepEqual((await database.query("UPDATE storage.objects SET bucket_id = 'other-public-app' WHERE id = $1 RETURNING bucket_id", [`allowed-${role}`])).rows, [{ bucket_id: "other-public-app" }]);
      assert.deepEqual((await database.query("DELETE FROM storage.objects WHERE id = $1 RETURNING id", [`allowed-${role}`])).rows, [{ id: `allowed-${role}` }]);
    } finally {
      await database.exec("RESET ROLE");
    }
  }
  assert.deepEqual((await database.query("SELECT id, bucket_id FROM storage.objects WHERE id = 'protected-qr'")).rows, [{ id: "protected-qr", bucket_id: "customer-connect-qr" }]);
});
