import "server-only";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import { ApiError } from "@/lib/api/http";
import * as schema from "./schema";

/**
 * DB 연결
 * - 운영(Vercel): DATABASE_URL 또는 POSTGRES_URL (Supabase 연결 풀러) → postgres.js
 * - 로컬 개발/테스트: 주소가 없으면 내장형 Postgres(PGlite)를 DATA_DIR/pglite 에 만들고 db/*.sql 을 자동 적용
 * 운영 스키마는 db/*.sql 을 번호 순서대로 Supabase 에 적용해 관리합니다.
 */
export type Db = PostgresJsDatabase<typeof schema>;

/** Supabase 에서만 실행하는 파일 (RLS·Storage 버킷). 내장 DB 에는 적용하지 않습니다. */
const SUPABASE_ONLY_SQL = new Set(["0002_rls_storage.sql"]);

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
  // db/*.sql 을 이름 순서대로 모두 적용합니다. 모든 문장이 IF NOT EXISTS 라 기동마다 다시 실행해도 안전합니다.
  const dbDir = path.join(process.cwd(), "db");
  const files = fs.readdirSync(dbDir).filter((f) => f.endsWith(".sql") && !SUPABASE_ONLY_SQL.has(f)).sort();
  for (const f of files) await client.exec(fs.readFileSync(path.join(dbDir, f), "utf8"));
  return drizzle(client, { schema }) as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!env.databaseUrl && process.env.VERCEL) {
    // Vercel 은 디스크에 저장할 수 없으므로 로컬 DB 로 대체하지 않고 설정 안내를 돌려줍니다.
    throw new ApiError(503, "db_not_configured", "DB 연결이 아직 설정되지 않았습니다. Vercel 프로젝트에 Supabase 연동을 켜 주세요.");
  }
  if (!globalForDb.__kbdDb) {
    globalForDb.__kbdDb = env.databaseUrl ? Promise.resolve(connectRemote(env.databaseUrl)) : connectLocal();
  }
  return globalForDb.__kbdDb;
}

export { schema };
