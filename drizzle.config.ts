import { defineConfig } from "drizzle-kit";

/** `npm run db:generate` after schema changes; migrations in ./drizzle are committed. */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://unused:unused@localhost:5432/unused" },
});
