import type { Inquiry, LeaseStatus, PartyCard, Tour } from "@/types";

/** GET /api/inquiries 한 줄(메시지 본문은 빼고 보낸다) */
export interface InquiryRow extends Omit<Inquiry, "messages"> {
  party: (PartyCard & { contact_name: string | null }) | null;
  assignee_name: string | null;
  branch_name: string | null;
  awaiting: boolean;
  awaiting_minutes: number | null;
  message_count: number;
  last_message: string | null;
  unit_code: string | null;
}

export interface InquiryLeaseSummary {
  id: string;
  status: LeaseStatus;
  unit_id: string;
  unit_code: string;
  start_date: string;
  end_date: string;
  rent: number;
}

/** GET /api/inquiries/:id */
export interface InquiryDetail extends Inquiry {
  party: (PartyCard & { contact_name: string | null; nationality: string; inquiry_count: number; lease_count: number }) | null;
  assignee_name: string | null;
  branch_name: string | null;
  awaiting: boolean;
  unit_code: string | null;
  tours: Array<Tour & { unit_codes: string[] }>;
  leases: InquiryLeaseSummary[];
}

/** POST /api/parties/search */
export type PartyMatch = PartyCard & { contact_name: string | null; inquiry_count: number; lease_count: number };

/** POST /api/inquiries/matches */
export interface UnitMatch {
  unit_id: string;
  code: string;
  branch_id: string;
  branch_name: string;
  type_name: string | null;
  floor: number | null;
  area_m2: number;
  rent: number | null;
  mgmt: number | null;
  free_from: string;
  free_until: string | null;
  over_budget: number; // 예산보다 높은 금액(원), 0 이면 예산 안
  reason: string;
}
