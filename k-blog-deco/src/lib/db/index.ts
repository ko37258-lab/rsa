import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { env } from "@/lib/env";
import * as schema from "./schema";

// schema.ts 와 1:1 로 맞춘 초기 테이블. (스키마 변경 시 drizzle-kit generate 로 마이그레이션 관리 권장)
const BOOTSTRAP_SQL = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, provider TEXT NOT NULL, provider_id TEXT NOT NULL,
    name TEXT, nickname TEXT, email TEXT, profile_image TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_provider_uq ON users(provider, provider_id)`,
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL,
    brief TEXT NOT NULL, current_version_id TEXT, last_error TEXT,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS design_versions (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_no INTEGER NOT NULL,
    design TEXT NOT NULL, source TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS versions_project_no_uq ON design_versions(project_id, version_no)`,
  `CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT, kind TEXT NOT NULL,
    label TEXT, filename TEXT, mime TEXT NOT NULL, size INTEGER NOT NULL,
    width INTEGER, height INTEGER, storage_key TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS assets_project_idx ON assets(project_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS assets_key_uq ON assets(storage_key)`,
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL, last_used_at INTEGER, created_at INTEGER NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS api_tokens_hash_uq ON api_tokens(token_hash)`,
  `CREATE TABLE IF NOT EXISTS ai_runs (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT, kind TEXT NOT NULL,
    model TEXT NOT NULL, status TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
    duration_ms INTEGER, error TEXT, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ai_runs_user_idx ON ai_runs(user_id, created_at)`,
];

type Db = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  __kbdDb?: { client: Client; db: Db; ready: Promise<void> };
};

function init() {
  let url = env.databaseUrl;
  if (!url) {
    const dir = path.resolve(env.dataDir);
    fs.mkdirSync(dir, { recursive: true });
    url = `file:${path.join(dir, "app.db")}`;
  }
  const client = createClient({ url, authToken: env.databaseAuthToken || undefined });
  const db = drizzle(client, { schema });
  const ready = (async () => {
    if (url.startsWith("file:")) await client.execute("PRAGMA journal_mode = WAL");
    for (const sql of BOOTSTRAP_SQL) await client.execute(sql);
  })();
  return { client, db, ready };
}

/** DB 인스턴스 (최초 호출 시 테이블 생성까지 보장) */
export async function getDb(): Promise<Db> {
  if (!globalForDb.__kbdDb) globalForDb.__kbdDb = init();
  await globalForDb.__kbdDb.ready;
  return globalForDb.__kbdDb.db;
}

export { schema };
