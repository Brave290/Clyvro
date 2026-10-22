import { mkdirSync } from "node:fs";
import os from "node:os";
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
 *                        Phase 3 product runs locally with zero credentials
 *                        (on read-only serverless filesystems it degrades
 *                        to an ephemeral temp-dir/in-memory database —
 *                        demo-grade only; see pgliteDataDir).
 *                        CLYVRO_DB_MEMORY=1 → in-memory (tests).
 * Migrations (./drizzle) run automatically on first use; for production
 * you can also run them ahead of deploy with `npm run db:migrate`.
 */

export type DB = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/**
 * The connection promise lives on globalThis, not in module scope: Next.js
 * (dev especially) can evaluate this module in more than one layer
 * (instrumentation vs route handlers), and separate module instances would
 * each spin up their own embedded database — accounts registered in one
 * would be invisible to the other. globalThis survives that (and HMR).
 */
const globalStore = globalThis as unknown as { __clyvroDbPromise?: Promise<DB> | null };

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
    const dir = pgliteDataDir();
    client = dir ? new PGlite(dir) : new PGlite();
  }
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_DIR });
  return db;
}

/**
 * First writable directory for the embedded database. Local dev uses
 * `.data/`; serverless hosts (read-only cwd, e.g. Vercel) fall back to
 * the OS temp dir — ephemeral demo storage only: data does not survive
 * cold starts or span instances there. Returns null (→ in-memory) when
 * nothing is writable. Production must set DATABASE_URL (Neon).
 */
function pgliteDataDir(): string | null {
  const candidates = [
    path.join(process.cwd(), ".data", "pglite"),
    path.join(os.tmpdir(), "clyvro-pglite"),
  ];
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      // not writable here — try the next candidate
    }
  }
  return null;
}

/** Process-wide singleton (fresh instance per test file thanks to Vitest isolation). */
async function dbReady(): Promise<DB> {
  globalStore.__clyvroDbPromise ??= createDb().catch((err) => {
    globalStore.__clyvroDbPromise = null;
    throw err;
  });
  return globalStore.__clyvroDbPromise;
}

export async function getDb(): Promise<DB> {
  const db = await dbReady();
  try {
    const { hydratePlanCatalog } = await import("@/lib/services/plan-catalog");
    await hydratePlanCatalog(db);
  } catch {
    // Catalog overlay is an enhancement; defaults stay in force.
  }
  return db;
}

export const newId = () => crypto.randomUUID();
