import type { Charge, Lease, LeaseStatus, PartyCard, Payment, Settlement, Staff, Unit, UnitType, Allocation, BranchTerms, BankAccount, Building, Conversation } from "@/types";
import type { RentCap, ScheduleLine } from "@/mock/schedule";

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
  branch: { id: string; name: string; address: string; phone: string; email: string; bank_account: string; accounts: BankAccount[] } | null;
  building: Building | null;
  renewal_of_lease: LeaseRow | null;
  renewal_lease: LeaseRow | null;
  next_lease: LeaseRow | null;
  rent_cap: (RentCap & { rent: number; exceeds: boolean }) | null;
  billing_summary: string;
  parties: LeaseParty[];
  company_name: string;
  terms: BranchTerms | null;
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
  totals: { billed: number; paid: number; overdue: number; upcoming: number; deposit_held: number; draft: number; needs_amount?: number };
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
  renewal_id?: string | null;
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
  billing?: string;
  occupants?: number;
}

/** 돈 숫자가 서로 얽혀 있어 바뀌면 같이 다시 읽는 키 */
export const MONEY_KEYS = [["leases"], ["billing"], ["collections"], ["settle"], ["ledger"], ["units"], ["customers"], ["inquiries"]];

/** 계약 당사자(계약자·납부자·입주자) */
export interface LeaseParty extends PartyCard {
  roles: Array<"contractor" | "payer" | "occupant">;
  nationality: string;
  bank_account: string | null;
}

/** GET /api/leases/branch-terms */
export type BranchTermsRes = BranchTerms & { branch_id: string; branch_name: string };

/** POST /api/billing/preview */
export interface PreviewRes {
  lines: Array<ScheduleLine & { amount_with_vat: number; vat_amount: number }>;
  first_bill_date: string | null;
  first_bill_total: number;
  totals: { rent: number; mgmt: number; discount: number };
  summary: string;
  needs_amount: boolean;
}

/** GET /api/leases/:id/rent-cap */
export type RentCapRes = (RentCap & { rent: number | null; exceeds: boolean; chain: Array<{ id: string; start_date: string; end_date: string; rent: number }> }) | null;

/** GET /api/billing/leases/:id/gaps (청구 영역) */
export interface GapRow {
  kind: string;
  label: string;
  period_from: string;
  period_to: string;
  amount: number;
  bill_date: string;
  due_date: string;
}

export type LeaseConversation = Conversation;
