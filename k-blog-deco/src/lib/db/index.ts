import "server-only";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * DB 연결
 * - 운영(Vercel): DATABASE_URL 또는 POSTGRES_URL (Supabase 연결 풀러) → postgres.js
 * - 로컬 개발/테스트: 주소가 없으면 내장형 Postgres(PGlite)를 DATA_DIR/pglite 에 만들고 스키마를 자동 적용
 * 운영 스키마는 db/*.sql 을 Supabase 에 적용해 관리합니다.
 */
export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __kbdDb?: Promise<Db> };

function connectRemote(url: string): Db {
  // 연결 문자열의 부가 파라미터(예: supa=…)는 서버 설정으로 전달되면 오류가 나므로 제거하고 SSL 은 명시합니다.
  const u = new URL(url);
  const sslOff = u.searchParams.get("sslmode") === "disable" || process.env.DB_SSL === "false";
  u.search = "";
  const client = postgres(u.toString(), {
    ssl: sslOff ? false : "require",
    prepare: false, // 트랜잭션 모드 풀러(6543) 호환
    max: 5,
    idle_timeout: 20,
  });
  return drizzlePg(client, { schema });
}

async function connectLocal(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = path.resolve(env.dataDir, "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "0001_init.sql"), "utf8");
  await client.exec(sql);
  return drizzle(client, { schema }) as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!globalForDb.__kbdDb) {
    globalForDb.__kbdDb = env.databaseUrl ? Promise.resolve(connectRemote(env.databaseUrl)) : connectLocal();
  }
  return globalForDb.__kbdDb;
}

export { schema };
