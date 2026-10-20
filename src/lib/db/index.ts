import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";

/**
 * One schema, two drivers:
 *  - DATABASE_URL set  → Postgres (Neon in production; use the pooled URL).
 *  - otherwise         → embedded PGlite persisted under .data/ so the full
 *                        Phase 3 product runs locally with zero credentials.
 *                        CLYVRO_DB_MEMORY=1 → in-memory (tests).
 * Migrations (./drizzle) run automatically on first use; for production
 * you can also run them ahead of deploy with `npm run db:migrate`.
 */

export type DB = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

let cached: Promise<DB> | null = null;

export async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 5 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder: MIGRATIONS_DIR });
    return db;
  }
  let client: PGlite;
  if (process.env.CLYVRO_DB_MEMORY === "1") {
    client = new PGlite();
  } else {
    const dir = path.join(process.cwd(), ".data", "pglite");
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

/** Process-wide singleton (fresh instance per test file thanks to Vitest isolation). */
export function getDb(): Promise<DB> {
  cached ??= createDb().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

export const newId = () => crypto.randomUUID();
