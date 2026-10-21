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

/** 메시지에서 읽은 값 하나(근거 원문 포함) */
export interface FoundValue<T> {
  value: T;
  text: string;
}

export interface ExtractedFields {
  move_in: FoundValue<string> | null;
  months: FoundValue<number> | null;
  budget: FoundValue<number> | null;
  people: FoundValue<number> | null;
  phone: FoundValue<string> | null;
  email: FoundValue<string> | null;
  first_sentence: string | null;
}

/** GET /api/inquiries/:id/drafts — 고객 메시지에서 읽은 조건과 지금 값 비교 */
export interface InquiryDrafts {
  source: { message_id: string; at: string } | null;
  extracted: ExtractedFields;
  suggestions: Array<{
    field: "desired_move_in" | "stay_months" | "monthly_budget";
    label: string;
    value: string | number;
    display: string;
    current: string | number | null;
    current_display: string;
    text: string; // 근거
  }>;
}

/** 대화함 한 건(GET /api/conversations/unlinked, /:id) */
export interface ConversationRow {
  id: string;
  branch_id: string | null;
  branch_name: string | null;
  inquiry_id: string | null;
  lease_id: string | null;
  channel: import("@/types").Channel;
  from_name: string;
  from_contact: string;
  subject: string;
  created_at: string;
  last_activity_at: string;
  message_count: number;
  preview: string;
  awaiting: boolean;
  extracted: ExtractedFields;
  candidate_count: number;
}

export interface ConversationCandidate {
  kind: "lease" | "inquiry";
  id: string;
  title: string; // "301호 · 홍길동" / "홍길동 문의"
  sub: string;
  reason: string; // "메일 주소가 같다"
  score: number;
}

export interface ConversationDetail extends ConversationRow {
  messages: import("@/types").Message[];
  candidates: ConversationCandidate[];
}

/** GET /api/inquiries/holds */
export interface InquiryHold {
  block_id: string;
  unit_id: string;
  unit_code: string;
  branch_name: string;
  inquiry_id: string | null;
  from: string;
  until: string | null;
  expires_at: string | null;
  expired: boolean;
}

/** GET /api/inquiries/:id/parties */
export interface InquiryParty extends PartyCard {
  contact_name: string | null;
  nationality: string;
  role: "문의자" | "입주 예정";
}
