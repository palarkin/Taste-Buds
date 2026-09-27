// Applies database migrations during the Vercel build ("vercel-build"), with clear error messages.
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Neon's Vercel integration names these DATABASE_URL* or POSTGRES_URL* depending on setup.
const raw =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;
// Same as src/db/index.ts: keep certificate verification strict across pg versions.
const url = raw?.replace(/([?&])sslmode=(require|prefer|verify-ca)\b/, "$1sslmode=verify-full");

if (!url) {
  console.error(
    "\n✗ No database connection found.\n" +
      "  Connect a Neon database to this project (Vercel → Storage → Neon, all environments),\n" +
      "  then redeploy. Expected DATABASE_URL (or POSTGRES_URL) in the environment.\n",
  );
  process.exit(1);
}

const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable URL)";
  }
})();
console.log(`Applying migrations to ${host}…`);

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 20000 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("✓ Database is up to date");
} catch (e) {
  const cause = e?.cause ?? e;
  const detail = [cause?.code, cause?.message || cause?.errors?.[0]?.message].filter(Boolean).join(" ") || String(e);
  console.error(`\n✗ Migration failed on ${host}: ${detail}\n`);
  process.exit(1);
} finally {
  await pool.end();
}
