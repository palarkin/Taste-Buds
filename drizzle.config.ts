import { defineConfig } from "drizzle-kit";

// Local: the Postgres started by `npm run dev`. Vercel/Neon: set DATABASE_URL (use the unpooled URL for migrations).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL || process.env.POSTGRES_URL || "postgres://tastebuds:tastebuds@localhost:54329/tastebuds" },
});
