import type { Charge, Lease, LeaseStatus, PartyCard, Payment, Settlement, Staff, Unit, UnitType, Allocation } from "@/types";

/** GET /api/leases 한 줄 */
export interface LeaseRow extends Lease {
  unit_code: string;
  unit_type_name: string | null;
  branch_name: string;
  contractor: PartyCard | null;
  payer: PartyCard | null;
  money: { overdue: number; upcoming: number; deposit_held: number };
}

/** GET /api/leases/:id */
export interface LeaseDetail extends LeaseRow {
  unit: Unit | null;
  unit_type: UnitType | null;
  renewal_of_lease: LeaseRow | null;
  next_lease: LeaseRow | null;
  inquiry: { id: string; stage: string; created_at: string; source_group: string; source_detail: string } | null;
  settlement: Settlement | null;
  assignee: Staff | null;
  flow: Array<{ to: LeaseStatus; label: string }>;
}

export type LedgerCharge = Charge & { paid: number; left: number; overdue: boolean };

/** GET /api/leases/:id/ledger */
export interface LeaseLedger {
  charges: LedgerCharge[];
  allocations: Allocation[];
  payments: Array<Payment & { to_this_lease: number }>;
  totals: { billed: number; paid: number; overdue: number; upcoming: number; deposit_held: number; draft: number };
}

export type SettlementView = Settlement & { saved: boolean };

export interface MoveOutRow extends LeaseRow {
  stage: "upcoming" | "settling" | "refund_wait" | "refunded";
  settlement_status: "none" | Settlement["status"];
  deposit_total: number;
  unpaid: number;
  deduction_total: number;
  refund_amount: number;
  refunded_at: string | null;
  days_left: number;
}

export interface RentRollRow {
  id: string;
  unit_code: string;
  status: LeaseStatus;
  kind: "신규" | "재계약" | "법인";
  start_date: string;
  end_date: string;
  contractor_name: string;
  nationality: string;
  gender: "M" | "F" | null;
  phone: string;
  email: string;
  deposit: number;
  mgmt_deposit: number;
  prepaid_rent: number;
  contract_fee: number;
  rent: number;
  mgmt_fee: number;
  cleaning_fee: number;
  month_rent: number;
  month_mgmt: number;
  remaining_rent: number;
  remaining_mgmt: number;
  unpaid: number;
}

/** 돈 숫자가 서로 얽혀 있어 바뀌면 같이 다시 읽는 키 */
export const MONEY_KEYS = [["leases"], ["billing"], ["collections"], ["settle"], ["ledger"], ["units"], ["customers"], ["inquiries"]];
