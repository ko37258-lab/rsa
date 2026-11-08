import { defineConfig } from "drizzle-kit";

// 스키마 변경 시: npx drizzle-kit generate  →  drizzle/ 폴더에 마이그레이션 SQL 생성
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./data/app.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
