/**
 * 운영 영역(대시보드·운영 준비·정합성·Q&A·운영정책·응대 자료) API 응답 모양.
 * Mock 핸들러(src/mock/handlers/ops.ts)와 화면이 같이 쓴다.
 */
import type { Lease, Policy, QaItem } from "@/types";

// ── 대시보드 ─────────────────────────────────────────
export type TileId =
  | "units_free"
  | "move_ins_week"
  | "expiring_week"
  | "inquiries_awaiting"
  | "inquiries_unassigned"
  | "inquiries_open"
  | "awaiting_signature"
  | "unscheduled"
  | "move_ins_late"
  | "invoices_to_send"
  | "overdue"
  | "bank_open";

export interface Tile {
  value: number;
  note?: string;
}

export interface MoveRow {
  kind: "in" | "out";
  lease_id: string;
  unit_id: string;
  unit_code: string;
  branch_name: string;
  name: string;
  date: string;
  status: Lease["status"];
}

export interface BranchCompare {
  id: string;
  name: string;
  units: number;
  occupancy_today: number | null;
  contract_rate_month: number | null;
  vacant: number;
  overdue: number;
  overdue_amount: number;
  awaiting: number;
}

export interface DashboardRes {
  as_of: string;
  month: string;
  operated_units: number;
  tiles: Record<TileId, Tile>;
  moves_today: MoveRow[];
  moves_week: MoveRow[];
  branches: BranchCompare[] | null;
}

// ── 분석 ────────────────────────────────────────────
export interface MonthStat {
  month: string;
  operated_units: number;
  occupancy: number | null;
  contract_rate: number | null;
  rent_revenue: number;
  other_revenue: number;
  revpar: number | null;
  amr: number | null;
  vacancy_loss: number | null; // 실사용 시작 전 달은 null
  inquiries: number;
  concluded: number;
  move_ins: number;
  move_outs: number;
  deposits_billed: number; // 계약금·잔금 청구
  received: number; // 수납
  refunded: number; // 반환
  overdue_now: number; // 그 달 납기인데 지금도 미납
  stay_days_avg: number | null; // 그 달 퇴실한 계약의 평균 거주
}

export interface ForwardBucket {
  start: string;
  end: string;
  rate: number | null;
}

export interface TypeLoss {
  unit_type_id: string | null;
  name: string;
  branch_name: string | null;
  units: number;
  list_rent: number;
  vacant_now: number;
  loss_past_90: number;
  loss_next_30: number;
}

export interface FunnelStep {
  stage: "new" | "tour" | "drafting" | "signing" | "concluded";
  label: string;
  count: number;
  /** 바로 앞 단계 대비(계약 작성은 문의 대비) */
  rate_from_prev: number | null;
}

export interface ReplyBucket {
  id: "lt1h" | "lt24h" | "gt24h" | "none";
  label: string;
  inquiries: number;
  concluded: number;
  rate: number | null;
}

export interface SourceRow {
  group: string;
  inquiries: number;
  concluded: number;
  contract_value: number;
  term_months_avg: number | null;
  days_to_conclude: number | null;
  per_inquiry: number | null;
}

export interface HeatCell {
  inquiries: number;
  concluded: number;
  median_minutes: number | null;
}

export interface AnalyticsRes {
  as_of: string;
  since: string; // 깔때기·유입경로·열지도 집계 시작일
  months: MonthStat[]; // 오래된 달 → 최근 달
  forward: { daily: Array<{ date: string; rate: number }>; buckets: ForwardBucket[] };
  type_loss: TypeLoss[];
  funnel: FunnelStep[];
  reply: { buckets: ReplyBucket[]; median_minutes: number | null };
  lost: { reasons: string[]; months: Array<{ month: string; counts: number[] }> };
  sources: SourceRow[];
  sources_total: SourceRow;
  heat: {
    cells: HeatCell[][]; // [요일 0=월][시 0..23]
    in_hours: HeatCell;
    out_hours: HeatCell;
  };
}

// ── 인사이트 ─────────────────────────────────────────
export interface Insight {
  id: string;
  tone: "bad" | "warn" | "good" | "info";
  title: string;
  body: string;
  metric?: string;
  to?: string;
}

// ── 운영 준비 ─────────────────────────────────────────
export type ReadinessKind = "deposit_short" | "unpaid";

export interface ReadinessRow {
  unit_id: string;
  unit_code: string;
  branch_id: string;
  branch_name: string;
  lease_id: string;
  lease_status: Lease["status"];
  contractor_name: string;
  start_date: string;
  end_date: string;
  deposit_short: { amount: number; confirmed: boolean; reason: string | null };
  unpaid: { amount: number; confirmed: boolean; reason: string | null; days: number };
  qa: { count: number; blocks_invoice: boolean };
  renewal: { end_date: string; days_left: number } | null;
  hold: boolean; // 청구서가 Q&A 때문에 막힘
  ready: boolean;
  left: string[];
}

export interface ReadinessRes {
  as_of: string;
  until: string;
  total_units: number;
  contracted_units: number;
  ready_count: number;
  counts: { deposit_short: number; unpaid: number; qa: number; renewal: number };
  rows: ReadinessRow[];
}

// ── 정합성 ─────────────────────────────────────────
export interface IntegrityCheck {
  id: string;
  label: string;
  description: string;
  severity: "critical" | "warning";
  violations: number;
  samples: Array<{ text: string; to?: string }>;
  error?: string;
}

export interface IntegrityRun {
  at: string;
  total: number;
  failing: number;
  by: Record<string, number>;
}

export interface IntegrityRes {
  ran_at: string;
  checks: IntegrityCheck[];
  runs: IntegrityRun[]; // 이 세션에서 돌린 검사(최근 순)
}

// ── Q&A · 정책 ─────────────────────────────────────────
export interface QaRow extends QaItem {
  branch_name: string;
  unit_id: string | null;
  lease_status: Lease["status"] | null;
  contractor_name: string | null;
}

export interface QaRes {
  rows: QaRow[];
  counts: { open: number; answered: number; resolved: number };
}

/** 계약별 Q&A 묶음 */
export interface QaContractRow {
  lease_id: string;
  unit_id: string | null;
  unit_code: string | null;
  contractor_name: string | null;
  lease_status: Lease["status"] | null;
  branch_name: string;
  total: number;
  confirmed: number;
  open: number;
  blocks_invoice: boolean;
  state: "open" | "answered" | "resolved";
  last_at: string;
  items: QaRow[];
}

export interface QaContractsRes {
  rows: QaContractRow[];
  counts: { open: number; answered: number; resolved: number };
}

export interface PolicyRow extends Policy {
  branch_name: string | null;
}
