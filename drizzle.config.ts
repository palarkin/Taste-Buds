import { defineConfig } from "drizzle-kit";

// Local: the Postgres started by `npm run dev`. Vercel/Neon: set DATABASE_URL (use the unpooled URL for migrations).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "postgres://tastebuds:tastebuds@localhost:54329/tastebuds" },
});
