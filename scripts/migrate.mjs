import nextEnv from "@next/env";
import postgres from "postgres";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL in the environment or .env.local before migrating.");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, connect_timeout: 10 });
try {
  const directory = new URL("../supabase/migrations/", import.meta.url);
  const names = (await readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  // One transaction also makes the first schema setup and concurrent runs safe.
  await client.begin(async sql => {
    await sql`SELECT pg_advisory_xact_lock(731406821)`;
    await sql`CREATE SCHEMA IF NOT EXISTS customer_connect`;
    await sql`REVOKE ALL ON SCHEMA customer_connect FROM PUBLIC, anon, authenticated`;
    await sql`CREATE TABLE IF NOT EXISTS customer_connect.schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`ALTER TABLE customer_connect.schema_migrations ENABLE ROW LEVEL SECURITY`;
    await sql`REVOKE ALL ON customer_connect.schema_migrations FROM PUBLIC, anon, authenticated`;
    for (const name of names) {
      const contents = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(contents).digest("hex");
      const [existing] = await sql`SELECT checksum FROM customer_connect.schema_migrations WHERE name = ${name}`;
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Previously applied migration changed: ${name}`);
        continue;
      }
      await sql.unsafe(contents);
      await sql`INSERT INTO customer_connect.schema_migrations (name, checksum) VALUES (${name}, ${checksum})`;
      console.log(`Applied ${name}`);
    }
  });
  console.log("Database migrations are up to date.");
} catch (error) {
  // Connection errors can include configuration details; do not echo credentials.
  console.error("Database migration failed. Check database access and the committed SQL.");
  if (error.code) console.error(`Postgres error code: ${error.code}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
