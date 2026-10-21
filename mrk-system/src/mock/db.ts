import type { DB } from "@/types";
import { buildSeed, DB_VERSION } from "./seed";
import { todayStr } from "@/lib/dates";

/**
 * Mock DB 보관소.
 * 브라우저 IndexedDB 에 통째로 저장한다(localStorage 의 약 5MB 한도가 없다).
 * 앱이 뜰 때 initDB() 로 한 번 읽고, 바뀔 때마다 잠깐 모았다가(debounce) 저장한다.
 * IndexedDB 를 못 쓰면 localStorage, 그것도 안 되면 메모리에만 두고 그대로 동작한다.
 */
const KEY = "mrk-system-db";
const IDB_NAME = "mrk-db";
const IDB_STORE = "kv";
let cache: DB | null = null;

function idb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(): Promise<DB | null> {
  const db = await idb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DB | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(value: DB): Promise<boolean> {
  const db = await idb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, KEY);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/** 버전이 다르면: 실사용 데이터는 옮기고, 시연 데이터는 버린다 */
function accept(db: DB | null): DB | null {
  if (!db) return null;
  if (db.version === DB_VERSION) return db;
  return (db as Partial<DB>).mode === "real" ? migrate(db) : null;
}

function readLocal(): DB | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? accept(JSON.parse(raw) as DB) : null;
  } catch {
    return null;
  }
}

/** 앱 시작 때 한 번 — 저장된 데이터를 읽는다(없으면 시연 데이터를 만든다) */
export async function initDB(): Promise<void> {
  if (cache) return;
  const stored = accept(await idbGet()) ?? readLocal();
  cache = stored ?? buildSeed(todayStr());
  if (!stored) await flushDB();
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => void flushDB());
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && void flushDB());
  }
}

export function getDB(): DB {
  // initDB 전에 불리는 경우(테스트 스크립트 등)에는 시연 데이터로 바로 시작한다
  if (!cache) cache = readLocal() ?? buildSeed(todayStr());
  return cache;
}

export let lastSaveFailed = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** 저장 예약 — 연달아 바뀌어도 한 번만 쓴다 */
export function saveDB(): void {
  if (!cache) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushDB(), 300);
}

/** 지금 바로 저장 */
export async function flushDB(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!cache) return;
  if (await idbPut(cache)) {
    lastSaveFailed = false;
    try {
      localStorage.removeItem(KEY); // 예전 저장 위치 정리
    } catch {
      /* 무시 */
    }
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    lastSaveFailed = false;
  } catch {
    /* 저장 공간 부족·차단 — 메모리 데이터로 계속. 실사용이면 화면에서 백업을 권한다 */
    lastSaveFailed = true;
  }
}

/** 예전 버전 DB 에 새로 생긴 필드를 기본값으로 채운다(실사용 데이터 보존) */
export function migrate(input: DB): DB {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = input as any;
  db.mode ??= "real";
  db.company_name ??= "MR.K";
  for (const k of ["staff", "branches", "buildings", "unit_types", "units", "blocks", "parties", "inquiries", "leases", "charges", "payments", "allocations", "settlements", "qa", "policies", "templates", "files", "signatures", "memos", "history", "readiness_confirms", "invoices", "conversations"])
    db[k] ??= [];
  const defTerms = {
    deposit: 1000000, mgmt_deposit: 100000, contract_fee: 300000, cleaning_fee_small: 80000, cleaning_fee_large: 120000,
    cycle: "anniversary", billing_mode: "prepaid", bill_day: 1, prorate: true, due_days: 0, mgmt_mode: "fixed", vat: "none", send_hour: 9,
  };
  for (const b of db.branches) {
    b.terms = { ...defTerms, ...(b.terms ?? {}) };
    b.accounts ??= [];
  }
  for (const u of db.units) u.asking_history ??= [];
  for (const q of db.inquiries) q.extra_party_ids ??= [];
  for (const l of db.leases) {
    const t = db.branches.find((b: { id: string }) => b.id === l.branch_id)?.terms ?? defTerms;
    l.cycle ??= t.cycle;
    l.billing_mode ??= t.billing_mode;
    l.prorate ??= t.prorate;
    l.due_days ??= t.due_days;
    l.mgmt_mode ??= t.mgmt_mode;
    l.discounts ??= [];
    l.occupant_ids ??= [];
    l.signed_copies ??= [];
  }
  for (const c of db.charges) {
    c.bill_date ??= c.due_date;
    c.invoice_id ??= null;
    c.days ??= null;
    c.month_days ??= null;
    c.needs_amount ??= false;
  }
  for (const p of db.payments) {
    p.account_id ??= null;
    p.platform_fee ??= 0;
    p.pass_through ??= 0;
    p.pass_through_reason ??= null;
    p.bank_row ??= null;
  }
  db.version = DB_VERSION;
  return db as DB;
}

/** 백업 파일 불러오기·빈 상태로 시작 등에서 DB 를 통째로 바꾼다 */
export function replaceDB(next: DB): void {
  cache = next.version === DB_VERSION ? next : migrate(next);
  void flushDB();
}

/** 시연 데이터를 오늘 날짜 기준으로 다시 만든다 */
export function resetDB(): void {
  cache = buildSeed(todayStr());
  void flushDB();
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
