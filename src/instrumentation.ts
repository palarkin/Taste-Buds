export async function register() {
  // On Vercel, migrations run during the build ("vercel-build"), not on every cold start.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    // Apply pending migrations on server start (local dev). On Vercel, migrations run in the build step instead.
    const { runMigrations } = await import("./db");
    await runMigrations();
  }
}
