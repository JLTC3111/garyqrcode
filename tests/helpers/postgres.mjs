import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile, readdir } from "node:fs/promises";

/** Run the committed migration against real Postgres, with Supabase's host objects. */
export async function createTestDatabase() {
  const database = new PGlite();
  await database.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (
      id text PRIMARY KEY,
      name text NOT NULL,
      public boolean DEFAULT false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    CREATE TABLE storage.objects (
      id text PRIMARY KEY,
      bucket_id text NOT NULL
    );
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  `);
  const migrations = new URL("../../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) {
    await database.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  return { database, db: drizzle(database) };
}

/** Only replace the connection boundary; routes and SQL remain production code. */
export function databaseTestPlugin(globalName) {
  return {
    name: "postgres-test-connection",
    setup(builder) {
      builder.onResolve({ filter: /^@\/db$/ }, () => ({ path: "database", namespace: "test-database" }));
      builder.onLoad({ filter: /.*/, namespace: "test-database" }, () => ({
        contents: `export function getDb() {
          const db = globalThis[${JSON.stringify(globalName)}];
          if (!db) throw new Error("Database unavailable in failure test");
          return db;
        }`,
        loader: "js",
      }));
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "test-server-only" }));
      builder.onLoad({ filter: /.*/, namespace: "test-server-only" }, () => ({ contents: "", loader: "js" }));
    },
  };
}
