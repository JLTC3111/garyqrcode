import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let database: PostgresJsDatabase<typeof schema> | undefined;

export function getDb() {
  if (database) return database;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for persistent storage.");

  // Supabase's transaction pooler does not support prepared statements.
  // Reuse one bounded pool per function instance; never store data on its filesystem.
  const client = postgres(url, {
    prepare: false,
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    connection: { statement_timeout: 10000 },
  });
  database = drizzle(client, { schema });
  return database;
}
