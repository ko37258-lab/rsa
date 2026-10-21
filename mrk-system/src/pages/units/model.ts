import type { LeaseStatus, Unit, UnitBlock, UnitType } from "@/types";
import type { Tone } from "@/lib/codes";

/** GET /api/units 한 줄 */
export type UnitState = "occupied" | "reserved" | "vacant" | "suspended" | "hold" | "off_sale";

export interface UnitRow extends Unit {
  type_name: string | null;
  building_name: string | null;
  branch_name: string;
  today: { state: UnitState; free_from: string | null; free_until: string | null; block: UnitBlock | null };
  current: { lease_id: string; contractor_name: string; end_date: string; start_date: string; status: LeaseStatus } | null;
  next: { lease_id: string; contractor_name: string; start_date: string; status: LeaseStatus } | null;
  /** period_start·months 를 줬을 때만: 그 기간 내내 비어 있나 */
  fits?: boolean;
}

export interface UnitLeaseSummary {
  id: string;
  status: LeaseStatus;
  start_date: string;
  end_date: string;
  move_out_date: string | null;
  contractor_name: string;
  rent: number;
}

/** GET /api/units/:id */
export interface UnitDetail extends UnitRow {
  unit_type: UnitType | null;
  leases: UnitLeaseSummary[];
  blocks: UnitBlock[];
}

export interface CalendarSegment {
  kind: "lease" | "hold" | "suspend";
  id: string;
  from: string;
  to: string;
  label: string;
  status: string;
}

/** GET /api/branches/:id/calendar */
export interface CalendarData {
  from: string;
  to: string;
  units: Array<{ id: string; code: string; floor: number | null; branch_id: string; branch_name: string; type_name: string | null; sale_status: Unit["sale_status"]; segments: CalendarSegment[] }>;
}

export const UNIT_STATE: Record<UnitState, { label: string; tone: Tone }> = {
  vacant: { label: "판매 가능", tone: "good" },
  occupied: { label: "계약 중", tone: "navy" },
  reserved: { label: "입주 예정", tone: "info" },
  hold: { label: "홀드", tone: "warn" },
  suspended: { label: "운영중지", tone: "bad" },
  off_sale: { label: "판매 중지", tone: "neutral" },
};

export const UNIT_STATE_ORDER: UnitState[] = ["vacant", "occupied", "reserved", "hold", "suspended", "off_sale"];

/** GET /api/leases/sales-board — 기간(on~until) 동안 호실별 판매 가능 여부 */
export interface SalesBoardRow {
  unit_id: string;
  code: string;
  branch_id: string;
  /** on 날짜 기준 상태 */
  state: UnitState;
  /** on~until 내내 비어 판매할 수 있나 */
  fits: boolean;
  free_from: string | null; // 이날부터 비어 판매 가능
  next_from: string | null; // 이날부터 다음 일정(계약·운영중지)
  hold: { block_id: string; expires_at: string | null; inquiry_id: string | null } | null;
  suspend: { until: string | null; reason: string } | null;
  note: string; // "기간 안 맞음 · 11.3부터 일정", "10.31까지 빔", "11.3부터 판매", "11.3까지 운영중지", "10.22 18:00까지 홀드"
}

export interface SalesBoard {
  on: string;
  until: string;
  rows: SalesBoardRow[];
}

/** GET /api/branches/:id/unit-views — 배치도 칸 */
export interface UnitView {
  unit_id: string;
  code: string;
  floor: number | null;
  col: number;
  span: number;
}

/** GET /api/units/:id/asking-prices */
export interface AskingPrices {
  asking_price: { rent: number; mgmt: number } | null;
  list_price: { rent: number; mgmt: number } | null;
  history: Array<{ at: string; rent: number; mgmt: number; by: string }>;
}
