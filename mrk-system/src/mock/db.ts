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
    if (db.version === DB_VERSION) return db;
    // 실제 운영 데이터는 버전이 바뀌어도 버리지 않고 새 필드를 채워 옮긴다. 시연 데이터는 새로 만든다
    return (db as Partial<DB>).mode === "real" ? migrate(db) : null;
  } catch {
    return null;
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
  saveDB();
}

export function getDB(): DB {
  if (!cache) {
    cache = readStore() ?? buildSeed(todayStr());
    saveDB();
  }
  return cache;
}

export let lastSaveFailed = false;

export function saveDB(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
    lastSaveFailed = false;
  } catch {
    /* 저장 공간 부족·차단 — 메모리 데이터로 계속. 실사용이면 화면에서 백업을 권한다 */
    lastSaveFailed = true;
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
