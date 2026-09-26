// `npm run dev`: start a local Postgres (real Postgres binaries from the embedded-postgres package,
// data in .data/pg), make sure the app database exists, then run `next dev`. Ctrl+C stops both cleanly.
// On Vercel none of this runs; DATABASE_URL points at Neon instead.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";

const PORT = 54329;
const DB = "tastebuds";
const USER = "tastebuds";
const PASSWORD = "tastebuds"; // local only
const dataDir = path.resolve(".data/pg");
const url = (db) => `postgres://${USER}:${PASSWORD}@localhost:${PORT}/${db}`;

async function canConnect() {
  const c = new pg.Client({ connectionString: url("postgres") });
  try {
    await c.connect();
    await c.end();
    return true;
  } catch {
    return false;
  }
}

const server = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: PORT,
  user: USER,
  password: PASSWORD,
  persistent: true,
  onLog: () => {},
  onError: (e) => {
    const msg = String(e instanceof Error ? e.message : e);
    if (/ERROR|FATAL|PANIC/.test(msg)) console.error("[postgres]", msg.trim());
  },
});

let startedHere = false;
if (await canConnect()) {
  console.log(`[postgres] already running on port ${PORT}`);
} else {
  if (!existsSync(path.join(dataDir, "PG_VERSION"))) {
    console.log("[postgres] creating local database in .data/pg (first run)…");
    await server.initialise();
  }
  await server.start();
  startedHere = true;
  console.log(`[postgres] started on port ${PORT}`);
}

const admin = new pg.Client({ connectionString: url("postgres") });
await admin.connect();
const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB]);
if (!rowCount) await admin.query(`CREATE DATABASE ${DB}`);
await admin.end();

const next = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? url(DB) },
});

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  if (!next.killed) next.kill("SIGTERM");
  if (startedHere) {
    await server.stop().catch(() => {});
    console.log("[postgres] stopped");
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
next.on("exit", (code) => shutdown(code ?? 0));
