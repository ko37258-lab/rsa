/**
 * 설정 · 실사용 모드 · 백업 · 지점·직원 관리 · 통합 검색.
 */
import { route, must, HttpError, type Route } from "../router";
import { getDB, newId, replaceDB, resetDB, today, lastSaveFailed } from "../db";
import { DB_VERSION } from "../seed";
import { buildEmpty, type SetupInput } from "../empty";
import { inBranch } from "../logic";
import type { BankAccount, Branch, BranchTerms, CommissionTerm, DB } from "@/types";

export interface SetupStatus {
  mode: DB["mode"];
  company_name: string;
  version: number;
  seeded_on: string;
  last_save_failed: boolean;
  /** 저장하는 데이터 크기(글자 수 ≈ 바이트). 브라우저 저장 한도는 약 5MB */
  data_size: number;
  counts: { branches: number; units: number; leases: number; parties: number; charges: number; payments: number; files: number };
}

export interface BackupFile {
  format: "mrk-backup";
  exported_at: string;
  app_version: number;
  db: DB;
  /** 파일 내용(선택): FileRef id → base64 */
  files?: Record<string, { mime: string; data: string }>;
}

export interface SearchHit {
  group: "unit" | "lease" | "customer" | "inquiry";
  id: string;
  label: string;
  sub: string;
  to: string;
}

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const int = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
};

function countFiles(db: DB): number {
  const ids = new Set<string>();
  for (const l of db.leases) for (const f of l.signed_copies ?? []) ids.add(f.id);
  for (const q of db.inquiries) for (const m of q.messages) for (const f of m.attachments ?? []) ids.add(f.id);
  for (const c of db.conversations ?? []) for (const m of c.messages) for (const f of m.attachments ?? []) ids.add(f.id);
  for (const f of db.files) if (f.file_id) ids.add(f.file_id);
  return ids.size;
}

function status(): SetupStatus {
  const db = getDB();
  return {
    mode: db.mode ?? "demo",
    company_name: db.company_name ?? "MR.K",
    version: db.version,
    seeded_on: db.seeded_on,
    last_save_failed: lastSaveFailed,
    data_size: JSON.stringify(db).length,
    counts: {
      branches: db.branches.length,
      units: db.units.length,
      leases: db.leases.length,
      parties: db.parties.length,
      charges: db.charges.length,
      payments: db.payments.length,
      files: countFiles(db),
    },
  };
}

function cleanTerms(t: Partial<BranchTerms>, base: BranchTerms): BranchTerms {
  const pickEnum = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);
  return {
    deposit: Math.max(0, int(t.deposit, base.deposit)),
    mgmt_deposit: Math.max(0, int(t.mgmt_deposit, base.mgmt_deposit)),
    contract_fee: Math.max(0, int(t.contract_fee, base.contract_fee)),
    cleaning_fee_small: Math.max(0, int(t.cleaning_fee_small, base.cleaning_fee_small)),
    cleaning_fee_large: Math.max(0, int(t.cleaning_fee_large, base.cleaning_fee_large)),
    cycle: pickEnum(t.cycle, ["anniversary", "calendar"] as const, base.cycle),
    billing_mode: pickEnum(t.billing_mode, ["prepaid", "postpaid"] as const, base.billing_mode),
    bill_day: Math.min(31, Math.max(1, int(t.bill_day, base.bill_day))),
    prorate: typeof t.prorate === "boolean" ? t.prorate : base.prorate,
    due_days: Math.min(60, Math.max(0, int(t.due_days, base.due_days))),
    mgmt_mode: pickEnum(t.mgmt_mode, ["fixed", "bill"] as const, base.mgmt_mode),
    vat: pickEnum(t.vat, ["none", "included", "excluded"] as const, base.vat),
    send_hour: Math.min(23, Math.max(0, int(t.send_hour, base.send_hour))),
  };
}

function cleanAccounts(list: unknown, branchId: string): BankAccount[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((a): BankAccount => {
      const f = a?.format;
      const hasFormat = f && (str(f.date) || str(f.name) || str(f.amount));
      return {
        id: str(a?.id) && !str(a?.id).startsWith("ac_new") ? str(a?.id) : newId("ac"), // 화면에서 만든 임시 id 는 새로 붙인다
        branch_id: branchId,
        bank: str(a?.bank, 40),
        number: str(a?.number, 60),
        holder: str(a?.holder, 60),
        format: hasFormat ? { date: str(f.date, 40), name: str(f.name, 40), amount: str(f.amount, 40), memo: str(f.memo, 40) || null } : null,
      };
    })
    .filter((a) => a.bank || a.number);
}

function cleanCommission(c: Partial<CommissionTerm> | undefined, base: CommissionTerm): CommissionTerm {
  if (!c) return base;
  return {
    structure: c.structure === "fixed_minus" ? "fixed_minus" : "rate",
    rate_bp: Math.min(10000, Math.max(0, int(c.rate_bp, base.rate_bp))),
    fixed_amount: Math.max(0, int(c.fixed_amount, base.fixed_amount)),
  };
}

const DEFAULT_TERMS: BranchTerms = {
  deposit: 1000000,
  mgmt_deposit: 100000,
  contract_fee: 300000,
  cleaning_fee_small: 80000,
  cleaning_fee_large: 120000,
  cycle: "anniversary",
  billing_mode: "prepaid",
  bill_day: 1,
  prorate: true,
  due_days: 0,
  mgmt_mode: "fixed",
  vat: "none",
  send_hour: 9,
};

function applyBranchPatch(db: DB, b: Branch, body: Record<string, unknown>): void {
  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (!name) throw new HttpError(400, "지점 이름을 적는다");
    b.name = name;
  }
  if (body.name_en !== undefined) b.name_en = str(body.name_en, 80);
  if (body.address !== undefined) b.address = str(body.address, 200);
  if (body.phone !== undefined) b.phone = str(body.phone, 40);
  if (body.email !== undefined) b.email = str(body.email, 120);
  if (body.code !== undefined) {
    const code = str(body.code, 6).toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) throw new HttpError(400, "지점 코드는 영문·숫자로 적는다");
    if (db.branches.some((x) => x.id !== b.id && x.code === code)) throw new HttpError(409, `다른 지점이 이미 ${code} 코드를 쓴다`);
    b.code = code;
  }
  if (body.terms !== undefined) b.terms = cleanTerms(body.terms as Partial<BranchTerms>, b.terms ?? DEFAULT_TERMS);
  if (body.commission !== undefined) b.commission = cleanCommission(body.commission as Partial<CommissionTerm>, b.commission);
  if (body.accounts !== undefined) {
    b.accounts = cleanAccounts(body.accounts, b.id);
    b.bank_account = b.accounts[0] ? `${b.accounts[0].bank} ${b.accounts[0].number}`.trim() : "";
  }
}

const digits = (s: string) => s.replace(/\D/g, "");

function search(db: DB, qRaw: string, branchId: string | null): SearchHit[] {
  const q = qRaw.trim().toLowerCase();
  if (!q) return [];
  const qd = digits(q);
  const hit = (...xs: Array<string | null | undefined>) =>
    xs.some((x) => {
      if (!x) return false;
      const s = x.toLowerCase();
      return s.includes(q) || (qd.length >= 3 && digits(s).includes(qd));
    });
  const inB = inBranch(branchId);
  const unitById = new Map(db.units.map((u) => [u.id, u]));
  const partyById = new Map(db.parties.map((p) => [p.id, p]));
  const typeById = new Map(db.unit_types.map((t) => [t.id, t]));
  const branchById = new Map(db.branches.map((b) => [b.id, b]));
  const multi = !branchId || branchId === "all";
  const bn = (id: string | null) => (multi && id ? ` · ${branchById.get(id)?.name ?? ""}` : "");
  const out: SearchHit[] = [];
  const LIMIT = 6;

  const units = db.units.filter(inB).filter((u) => hit(u.code, `${u.code}호`, u.unit_type_id ? typeById.get(u.unit_type_id)?.name : null));
  units
    .sort((a, b) => a.code.localeCompare(b.code, "ko", { numeric: true }))
    .slice(0, LIMIT)
    .forEach((u) => out.push({ group: "unit", id: u.id, label: `${u.code}호`, sub: `${(u.unit_type_id && typeById.get(u.unit_type_id)?.name) || "룸타입 미정"}${bn(u.branch_id)}`, to: `/units/${u.id}` }));

  const leases = db.leases.filter(inB).filter((l) => {
    const p = partyById.get(l.contractor_id);
    const u = unitById.get(l.unit_id);
    return hit(u?.code, u ? `${u.code}호` : null, p?.name, p?.phone, p?.email);
  });
  leases
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
    .slice(0, LIMIT)
    .forEach((l) => {
      const u = unitById.get(l.unit_id);
      out.push({ group: "lease", id: l.id, label: `${u?.code ?? "?"}호 · ${partyById.get(l.contractor_id)?.name ?? "계약자"}`, sub: `${l.start_date.replace(/-/g, ".")} ~ ${l.end_date.replace(/-/g, ".")}${bn(l.branch_id)}`, to: `/leases/${l.id}` });
    });

  const customers = db.parties.filter((p) => multi || p.branch_id === branchId || p.branch_id === null).filter((p) => hit(p.name, p.phone, p.email, p.contact_name));
  customers.slice(0, LIMIT).forEach((p) =>
    out.push({ group: "customer", id: p.id, label: p.name, sub: [p.kind === "corporation" ? "법인" : "개인", p.phone, p.email].filter(Boolean).join(" · "), to: `/customers/${p.id}` }),
  );

  const inquiries = db.inquiries.filter((x) => multi || x.branch_id === branchId || x.branch_id === null).filter((x) => hit(partyById.get(x.party_id)?.name, x.message));
  inquiries
    .sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))
    .slice(0, LIMIT)
    .forEach((x) =>
      out.push({
        group: "inquiry",
        id: x.id,
        label: `${partyById.get(x.party_id)?.name ?? "문의자"} ${x.kind === "life" ? "생활문의" : "문의"}`,
        sub: `${x.created_at.slice(0, 10).replace(/-/g, ".")} · ${x.message.slice(0, 40)}`,
        to: `/inquiries/${x.id}`,
      }),
    );
  return out;
}

function validateBackup(raw: unknown): DB {
  const b = raw as Partial<BackupFile> & Partial<DB>;
  const db = (b && typeof b === "object" && "db" in b ? b.db : b) as Partial<DB> | undefined;
  if (!db || typeof db !== "object") throw new HttpError(400, "백업 파일이 아니다");
  if (typeof db.version !== "number" || !Array.isArray(db.units) || !Array.isArray(db.leases) || !Array.isArray(db.branches) || !db.me)
    throw new HttpError(400, "MR.K 백업 파일 형식이 아니다(지점·호실·계약 목록이 없다)");
  if (db.version > DB_VERSION) throw new HttpError(400, "더 새 버전에서 만든 백업이다. 프로그램을 새로 고친 뒤 불러온다");
  return db as DB;
}

export const platformRoutes: Route[] = [
  // ── 실사용 모드 ──
  route("GET /api/setup/status", () => status()),
  route("POST /api/setup/start", ({ body }) => {
    const db = getDB();
    const next = buildEmpty(body as SetupInput, db.me, today());
    replaceDB(next);
    return status();
  }),
  route("POST /api/setup/demo", () => {
    resetDB();
    return status();
  }),

  // ── 백업 ──
  route("GET /api/backup", () => {
    const file: BackupFile = { format: "mrk-backup", exported_at: new Date().toISOString(), app_version: DB_VERSION, db: getDB() };
    return file;
  }),
  route("POST /api/backup/check", ({ body }) => {
    const db = validateBackup(body?.db ?? body);
    return {
      mode: db.mode ?? "real",
      company_name: db.company_name ?? "",
      version: db.version,
      seeded_on: db.seeded_on,
      branches: db.branches.map((b) => b.name),
      units: db.units.length,
      leases: db.leases.length,
      parties: db.parties?.length ?? 0,
      charges: db.charges?.length ?? 0,
    };
  }),
  route("POST /api/backup/restore", ({ body }) => {
    const db = validateBackup(body?.db ?? body);
    replaceDB(db);
    return status();
  }),

  // ── 지점 ──
  route("POST /api/branches", ({ body }) => {
    const db = getDB();
    const name = str(body?.name, 60);
    if (!name) throw new HttpError(400, "지점 이름을 적는다");
    const base = db.branches[0];
    let code = str(body?.code, 6).toUpperCase().replace(/[^A-Z0-9]/g, "") || `B${db.branches.length + 1}`;
    while (db.branches.some((b) => b.code === code)) code = `${code}${db.branches.length + 1}`;
    const id = newId("b");
    const branch: Branch = {
      id,
      code,
      name,
      name_en: str(body?.name_en, 80),
      address: str(body?.address, 200),
      email: str(body?.email, 120),
      phone: str(body?.phone, 40),
      opened_on: today(),
      commission: base ? { ...base.commission } : { structure: "rate", rate_bp: 0, fixed_amount: 0 },
      bank_account: "",
      terms: cleanTerms((body?.terms ?? {}) as Partial<BranchTerms>, base?.terms ?? DEFAULT_TERMS),
      accounts: [],
    };
    db.branches.push(branch);
    db.buildings.push({ id: newId("bd"), branch_id: id, name: "본관", floors: 1 });
    return branch;
  }),
  route("PATCH /api/branches/:id", ({ params, body }) => {
    const db = getDB();
    const b = must(db.branches.find((x) => x.id === params.id), "지점");
    applyBranchPatch(db, b, (body ?? {}) as Record<string, unknown>);
    return b;
  }),

  // ── 직원 ──
  route("GET /api/staff", () => getDB().staff),
  route("POST /api/staff", ({ body }) => {
    const db = getDB();
    const name = str(body?.name, 40);
    if (!name) throw new HttpError(400, "직원 이름을 적는다");
    const s = { id: newId("s"), name, role: str(body?.role, 40) || "매니저" };
    db.staff.push(s);
    return s;
  }),
  route("PATCH /api/staff/:id", ({ params, body }) => {
    const db = getDB();
    const s = must(db.staff.find((x) => x.id === params.id), "직원");
    if (body?.name !== undefined) {
      const name = str(body.name, 40);
      if (!name) throw new HttpError(400, "직원 이름을 적는다");
      s.name = name;
      if (s.id === db.me.id) db.me.name = name;
    }
    if (body?.role !== undefined) s.role = str(body.role, 40);
    return s;
  }),
  route("DELETE /api/staff/:id", ({ params }) => {
    const db = getDB();
    if (params.id === db.me.id) throw new HttpError(400, "내 계정은 지울 수 없다");
    const i = db.staff.findIndex((x) => x.id === params.id);
    if (i < 0) throw new HttpError(404, "직원을 찾지 못했다");
    db.staff.splice(i, 1);
    // 맡던 상담·계약은 담당 없음으로
    for (const q of db.inquiries) if (q.assignee_id === params.id) q.assignee_id = null;
    for (const l of db.leases) if (l.assignee_id === params.id) l.assignee_id = null;
    return { ok: true };
  }),
  route("PATCH /api/me", ({ body }) => {
    const db = getDB();
    if (body?.name !== undefined) {
      const name = str(body.name, 40);
      if (!name) throw new HttpError(400, "이름을 적는다");
      db.me.name = name;
      const s = db.staff.find((x) => x.id === db.me.id);
      if (s) s.name = name;
    }
    if (body?.email !== undefined) db.me.email = str(body.email, 120);
    if (body?.company_name !== undefined) db.company_name = str(body.company_name, 60) || db.company_name;
    return { ...db.me, today: today() };
  }),

  // ── 통합 검색(명령 팔레트) ──
  route("GET /api/search", ({ query }) => search(getDB(), query.get("q") ?? "", query.get("branch_id"))),
];
