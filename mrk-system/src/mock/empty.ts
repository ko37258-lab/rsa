/**
 * 실사용 시작 — 빈 DB 를 만든다. 시연 데이터 대신 내 지점·룸타입·호실만 들어간 상태.
 * 운영정책·정형 답변·메일 서명 기본값은 시연 데이터의 공통 문구를 그대로 가져온다.
 */
import type { BankAccount, Branch, BranchTerms, Building, DB, Me, Unit, UnitType } from "@/types";
import { buildSeed, DB_VERSION } from "./seed";
import { newId, nowIso } from "./db";
import { HttpError } from "./router";

export interface SetupRoomType {
  key: string; // 화면에서 범위와 이어 주는 임시 키
  name: string;
  area_m2: number;
  list_rent: number;
  list_mgmt: number;
}

export interface SetupRange {
  spec: string; // "101-105, 201-205"
  type_key: string;
}

export interface SetupInput {
  company_name: string;
  branch: {
    name: string;
    name_en: string;
    code?: string;
    address: string;
    phone: string;
    email: string;
    bank: string;
    account_number: string;
    holder: string;
  };
  terms: BranchTerms;
  room_types: SetupRoomType[];
  ranges: SetupRange[];
}

/** "101-105, 201-205, 301" → ["101", …]. 숫자 범위만 펼치고, 나머지는 그대로 한 칸 */
export function expandUnitSpec(spec: string): string[] {
  const out: string[] = [];
  for (const raw of spec.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = raw.match(/^([A-Za-z]*)(\d+)\s*[-~]\s*([A-Za-z]*)(\d+)$/);
    if (m && m[1] === m[3]) {
      const a = Number(m[2]);
      const b = Number(m[4]);
      if (b < a || b - a > 200) throw new HttpError(400, `범위를 다시 확인한다: ${raw}`);
      const width = m[2].length;
      for (let n = a; n <= b; n++) out.push(`${m[1]}${String(n).padStart(width, "0")}`);
    } else {
      if (!/^[A-Za-z0-9-]+$/.test(raw)) throw new HttpError(400, `호실 번호는 영문·숫자·- 만 쓴다: ${raw}`);
      out.push(raw);
    }
  }
  return out;
}

/** 호실 번호의 층 추정: 앞자리(3·4자리면 마지막 두 자리를 뺀 값) */
export function floorOf(code: string): number | null {
  const d = code.replace(/\D/g, "");
  if (d.length >= 3) return Number(d.slice(0, d.length - 2)) || null;
  return null;
}

function check(cond: unknown, msg: string): void {
  if (!cond) throw new HttpError(400, msg);
}

export function validateSetup(s: SetupInput): void {
  check(s.company_name?.trim(), "회사 이름을 적는다");
  check(s.branch?.name?.trim(), "지점 이름을 적는다");
  check(s.room_types?.length >= 1 && s.room_types.length <= 8, "룸타입을 1개 이상 만든다");
  for (const t of s.room_types) {
    check(t.name?.trim(), "룸타입 이름을 적는다");
    check(Number(t.list_rent) > 0, `${t.name} 정가 월세를 적는다`);
  }
  check(s.ranges?.length >= 1, "호실 번호를 적는다");
}

export function buildEmpty(s: SetupInput, me: Me, today: string): DB {
  validateSetup(s);
  const seed = buildSeed(today); // 기본 문구만 가져온다
  const now = nowIso();
  // 지점 코드: 영문 이름에서 브랜드(MR.K)를 뺀 앞 두 글자. "MR.K Inha" → "IN"
  const code = (s.branch.code?.trim() || s.branch.name_en.replace(/^\s*MR\.?\s*K\b/i, "").replace(/[^A-Za-z]/g, "").slice(0, 2) || "BR").toUpperCase();
  const branchId = newId("b");
  const account: BankAccount = {
    id: newId("ac"),
    branch_id: branchId,
    bank: s.branch.bank.trim(),
    number: s.branch.account_number.trim(),
    holder: s.branch.holder.trim(),
    format: null,
  };
  const branch: Branch = {
    id: branchId,
    code,
    name: s.branch.name.trim(),
    name_en: s.branch.name_en.trim(),
    address: s.branch.address.trim(),
    email: s.branch.email.trim(),
    phone: s.branch.phone.trim(),
    opened_on: today,
    commission: { structure: "rate", rate_bp: 0, fixed_amount: 0 },
    bank_account: account.bank || account.number ? `${account.bank} ${account.number}`.trim() : "",
    terms: { ...s.terms },
    accounts: account.bank || account.number ? [account] : [],
  };
  const building: Building = { id: newId("bd"), branch_id: branchId, name: "본관", floors: 1 };
  const typeByKey = new Map<string, UnitType>();
  const unitTypes: UnitType[] = s.room_types.map((t) => {
    const ut: UnitType = {
      id: newId("ut"),
      branch_id: branchId,
      name: t.name.trim(),
      area_m2: Number(t.area_m2) || 0,
      list_rent: Math.round(Number(t.list_rent) || 0),
      list_mgmt: Math.round(Number(t.list_mgmt) || 0),
    };
    typeByKey.set(t.key, ut);
    return ut;
  });

  const units: Unit[] = [];
  const seen = new Set<string>();
  const colByFloor = new Map<number, number>();
  for (const r of s.ranges) {
    const ut = typeByKey.get(r.type_key) ?? unitTypes[0];
    for (const c of expandUnitSpec(r.spec)) {
      if (seen.has(c)) throw new HttpError(409, `호실 번호가 겹친다: ${c}`);
      seen.add(c);
      const floor = floorOf(c);
      const col = (colByFloor.get(floor ?? 0) ?? 0) + 1;
      colByFloor.set(floor ?? 0, col);
      units.push({
        id: newId("u"),
        branch_id: branchId,
        building_id: building.id,
        unit_type_id: ut.id,
        code: c,
        floor,
        area_m2: ut.area_m2,
        facing: null,
        sale_status: "on_sale",
        asking_price: { rent: ut.list_rent, mgmt: ut.list_mgmt },
        layout: { col, span: 1 },
        memo: "",
        created_at: now,
        asking_history: [],
      });
    }
  }
  check(units.length > 0, "호실 번호를 적는다");
  check(units.length <= 500, "호실은 한 번에 500개까지 만든다");
  building.floors = new Set(units.map((u) => u.floor ?? 0)).size;

  return {
    version: DB_VERSION,
    seeded_on: today,
    mode: "real",
    company_name: s.company_name.trim(),
    me: { ...me, permissions: Array.from(new Set([...me.permissions, "integrity_read", "billing_write", "policy_write"])) },
    staff: [{ id: me.id, name: me.name, role: me.role === "owner" ? "대표" : "직원" }],
    branches: [branch],
    buildings: [building],
    unit_types: unitTypes,
    units,
    blocks: [],
    parties: [],
    inquiries: [],
    leases: [],
    charges: [],
    payments: [],
    allocations: [],
    settlements: [],
    qa: [],
    policies: seed.policies.filter((p) => p.scope === "공통").map((p) => ({ ...p, id: newId("po"), updated_at: now })),
    templates: seed.templates.filter((t) => t.branch_id === null).map((t) => ({ ...t, id: newId("tp"), updated_at: now })),
    files: [],
    signatures: seed.signatures.filter((x) => x.branch_id === null).map((x) => ({ ...x, id: newId("sg") })),
    memos: [],
    history: [],
    readiness_confirms: [],
    invoices: [],
    conversations: [],
  };
}
