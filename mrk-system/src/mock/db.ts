import type { DB } from "@/types";
import { buildSeed, DB_VERSION } from "./seed";
import { todayStr } from "@/lib/dates";

/**
 * Mock DB 보관소. 브라우저 localStorage 에 통째로 저장한다.
 * 저장소를 못 쓰는 환경(사생활 보호 창 등)에서는 메모리에만 두고 그대로 동작한다.
 */
const KEY = "mrk-system-db";
let cache: DB | null = null;

function readStore(): DB | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as DB;
    return db.version === DB_VERSION ? db : null;
  } catch {
    return null;
  }
}

export function getDB(): DB {
  if (!cache) {
    cache = readStore() ?? buildSeed(todayStr());
    saveDB();
  }
  return cache;
}

export function saveDB(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* 저장 공간 부족·차단 — 메모리 데이터로 계속 */
  }
}

/** 시연 데이터를 오늘 날짜 기준으로 다시 만든다 */
export function resetDB(): void {
  cache = buildSeed(todayStr());
  saveDB();
}

/** Mock 의 "오늘" — 데이터를 만든 날로 고정하지 않고 실제 오늘을 쓴다 */
export function today(): string {
  return todayStr();
}

let seq = Date.now() % 100000;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}_n${seq.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
