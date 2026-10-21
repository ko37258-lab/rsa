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
