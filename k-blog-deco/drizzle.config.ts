import { defineConfig } from "drizzle-kit";

// 스키마 변경 시: npx drizzle-kit generate → drizzle/ 폴더의 SQL 을 확인 후 Supabase 에 적용
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL || process.env.POSTGRES_URL || "" },
});
