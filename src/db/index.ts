import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import path from "node:path";
import * as schema from "./schema";

// Local dev: `npm run dev` starts a local Postgres and sets DATABASE_URL (see scripts/dev.mjs).
// On Vercel: DATABASE_URL comes from the Neon integration. See HANDOFF.md.
export const LOCAL_DATABASE_URL = "postgres://tastebuds:tastebuds@localhost:54329/tastebuds";

function create() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, max: process.env.VERCEL ? 3 : 10 });
  return drizzle(pool, { schema });
}

type DB = ReturnType<typeof create>;
const g = globalThis as unknown as { __tbDb?: DB; __tbMigrated?: Promise<void> };

export const db: DB = g.__tbDb ?? (g.__tbDb = create());

export function runMigrations() {
  g.__tbMigrated ??= migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return g.__tbMigrated;
}

export { schema };
