/**
 * MR.K 관리 시스템 도메인 모델.
 * 홈즈 PMS(/api) 응답 구조를 역공학(REA)해서 정리한 것이다 — 필드 이름은 원본과 맞춘다(snake_case).
 * 금액은 모두 원(KRW) 정수, 날짜는 "yyyy-MM-dd", 시각은 ISO 문자열, 달은 "yyyy-MM".
 */

export type ID = string;
export type DateStr = string;
export type MonthStr = string;

export interface Me {
  id: ID;
  name: string;
  email: string;
  role: "owner" | "manager" | "staff";
  permissions: string[];
}

export interface Staff {
  id: ID;
  name: string;
  role: string;
}

/** 지점 수수료 조건 — 홈즈 매출(위탁 수수료) 계산에 쓴다 */
export interface CommissionTerm {
  structure: "rate" | "fixed_minus";
  rate_bp: number; // 1% = 100bp
  fixed_amount: number;
}

export interface Branch {
  id: ID;
  code: string;
  name: string;
  name_en: string;
  address: string;
  email: string;
  phone: string;
  opened_on: DateStr;
  commission: CommissionTerm;
  bank_account: string;
}

export interface Building {
  id: ID;
  branch_id: ID;
  name: string;
  floors: number;
}

export interface UnitType {
  id: ID;
  branch_id: ID;
  name: string;
  area_m2: number;
  list_rent: number; // 정가 월세
  list_mgmt: number; // 정가 관리비
}

export interface Unit {
  id: ID;
  branch_id: ID;
  building_id: ID;
  unit_type_id: ID | null;
  code: string; // 호실 번호 "301"
  floor: number | null;
  area_m2: number;
  facing: "남" | "동" | "서" | "북" | "남동" | "남서" | null;
  sale_status: "on_sale" | "off_sale"; // 판매 상태
  asking_price: { rent: number; mgmt: number } | null; // 모집가
  layout: { col: number; span: number }; // 배치도 칸
  memo: string;
  created_at: string;
}

/** 호실 일정 블록 — 홀드(문의 고객용 임시 잡기) 또는 운영중지 */
export interface UnitBlock {
  id: ID;
  unit_id: ID;
  kind: "hold" | "suspend";
  from: DateStr;
  until: DateStr | null;
  reason: string;
  inquiry_id: ID | null;
  hold_expires_at: string | null;
  created_at: string;
}

/** 고객(당사자) — 개인 또는 법인 */
export interface Party {
  id: ID;
  kind: "individual" | "corporation";
  name: string;
  phone: string;
  email: string;
  nationality: string; // "KR", "JP", "US" …
  gender: "M" | "F" | null;
  branch_id: ID | null;
  contact_name: string | null; // 법인 담당자
  created_at: string;
  last_activity_at: string;
  retention_until: DateStr | null; // 개인정보 보존 기한
  bank_account: string | null; // 환불 계좌
}

export type InquiryStage = "new" | "tour" | "drafting" | "signing" | "concluded" | "lost";

export type Channel = "phone" | "visit" | "email" | "web" | "kakao" | "platform";

export interface Message {
  id: ID;
  direction: "inbound" | "outbound" | "note";
  body: string;
  at: string;
  author: string;
  via: Channel;
}

export interface Tour {
  id: ID;
  at: string;
  unit_ids: ID[];
  status: "scheduled" | "done" | "no_show" | "cancelled";
  memo: string;
}

export interface Inquiry {
  id: ID;
  branch_id: ID | null;
  kind: "inquiry" | "life"; // 입주문의 / 생활문의(입주자)
  party_id: ID;
  channel: Channel;
  source_group: string; // 유입경로 대분류
  source_detail: string; // 세부 경로
  stage: InquiryStage;
  lost_reason: string | null;
  assignee_id: ID | null;
  desired_move_in: DateStr | null;
  stay_months: number | null;
  monthly_budget: number | null; // 원
  rooms: number;
  message: string;
  unit_id: ID | null; // 생활문의의 호실
  lease_ids: ID[];
  created_at: string;
  first_reply_at: string | null;
  last_activity_at: string;
  closed_at: string | null;
  messages: Message[];
  tours: Tour[];
}

export type LeaseStatus =
  | "draft" // 작성 중
  | "awaiting_signature" // 서명 대기
  | "concluded" // 체결(입주 전)
  | "move_in_confirmed" // 입주 일정 확정
  | "occupied" // 거주 중
  | "closing" // 퇴실·정산 중
  | "closed" // 끝남
  | "cancelled"; // 취소

export type VatMode = "none" | "included" | "excluded";

export interface Lease {
  id: ID;
  branch_id: ID;
  unit_id: ID;
  inquiry_id: ID | null;
  contractor_id: ID; // 계약자
  payer_id: ID; // 납부자(법인 대납 등)
  status: LeaseStatus;
  start_date: DateStr;
  end_date: DateStr;
  move_in_date: DateStr | null;
  move_out_date: DateStr | null;
  deposit: number; // 보증금
  mgmt_deposit: number; // 관리비 보증금
  prepaid_rent: number; // 선납임대료
  contract_fee: number; // 계약금
  rent: number; // 월세
  list_rent: number; // 정가 월세(할인 전)
  mgmt_fee: number; // 관리비
  cleaning_fee: number; // 퇴실청소비
  due_day: number; // 납기일(매월 n일)
  vat: VatMode;
  source_group: string;
  assignee_id: ID | null;
  created_at: string;
  signed_at: string | null;
  closed_at: string | null;
  renewal_of: ID | null;
  memo: string;
}

export type ChargeKind =
  | "rent"
  | "mgmt"
  | "usage" // 전기·가스·인터넷 등 사용료
  | "deposit"
  | "contract_fee"
  | "prepaid_rent"
  | "penalty"
  | "damage"
  | "cleaning"
  | "other";

/** 청구 한 줄. 같은 납부자·같은 달 청구를 묶어 청구서(invoice_no)로 보낸다 */
export interface Charge {
  id: ID;
  branch_id: ID;
  lease_id: ID | null;
  payer_id: ID;
  month: MonthStr; // 청구 달
  kind: ChargeKind;
  label: string;
  amount: number; // VAT 포함 최종 금액
  supply: number; // 공급가
  vat_amount: number;
  period_from: DateStr | null; // 사용기간
  period_to: DateStr | null;
  due_date: DateStr;
  status: "draft" | "scheduled" | "sent" | "cancelled";
  invoice_no: string | null;
  sent_at: string | null;
  sent_via: "email" | "manual" | null;
  created_at: string;
}

/** 은행 입금 · 직접 기록한 입금 */
export interface Payment {
  id: ID;
  branch_id: ID;
  payer_id: ID | null; // 맞춘 납부자
  depositor_name: string;
  amount: number;
  received_at: string;
  account: string;
  method: "bank" | "direct";
  status: "matched" | "unmatched" | "skipped";
  memo: string;
}

/** 입금 → 청구 배분 */
export interface Allocation {
  id: ID;
  payment_id: ID;
  charge_id: ID;
  amount: number;
  at: string;
}

export interface Deduction {
  label: string;
  amount: number;
}

/** 퇴실 정산 — 보증금에서 미납·원상복구 등을 빼고 반환 */
export interface Settlement {
  id: ID;
  lease_id: ID;
  status: "draft" | "confirmed" | "refunded";
  deposit_total: number;
  unpaid: number;
  deductions: Deduction[];
  refund_amount: number;
  refund_account: string;
  confirmed_at: string | null;
  refunded_at: string | null;
}

export interface QaItem {
  id: ID;
  branch_id: ID;
  lease_id: ID | null;
  unit_code: string | null;
  topic: string; // 청구·수납·계약·운영
  question: string;
  answer: string | null;
  state: "open" | "answered" | "confirmed" | "auto_closed";
  created_at: string;
  answered_at: string | null;
  blocks_invoice: boolean; // "청구서 안 나감"
}

export interface Policy {
  id: ID;
  code: string; // "BILL-003"
  scope: "공통" | "지점";
  branch_id: ID | null;
  category: string;
  title: string;
  body: string;
  basis: string; // 근거
  state: "draft" | "confirmed";
  version: number;
  updated_at: string;
}

export interface ReplyTemplate {
  id: ID;
  branch_id: ID | null;
  title: string;
  shortcut: string;
  body: string;
  updated_at: string;
}

export interface PreparedFile {
  id: ID;
  branch_id: ID | null;
  name: string;
  size: number;
  kind: "pdf" | "image" | "doc";
  updated_at: string;
}

export interface Signature {
  id: ID;
  branch_id: ID | null; // null = 공통
  body_ko: string;
  body_en: string | null;
}

export interface Memo {
  id: ID;
  target_kind: "unit" | "inquiry" | "lease" | "customer";
  target_id: ID;
  body: string;
  author: string;
  at: string;
}

export interface HistoryEvent {
  id: ID;
  target_kind: "unit" | "inquiry" | "lease" | "customer";
  target_id: ID;
  at: string;
  author: string;
  text: string;
}

/** 운영 준비 확정 기록(미수·미납을 실제 손실로 확정) */
export interface ReadinessConfirm {
  id: ID;
  lease_id: ID;
  kind: "deposit_short" | "unpaid";
  amount: number;
  reason: string;
  at: string;
}

/** 브라우저 저장소에 통째로 들어가는 Mock DB */
export interface DB {
  version: number;
  seeded_on: DateStr;
  me: Me;
  staff: Staff[];
  branches: Branch[];
  buildings: Building[];
  unit_types: UnitType[];
  units: Unit[];
  blocks: UnitBlock[];
  parties: Party[];
  inquiries: Inquiry[];
  leases: Lease[];
  charges: Charge[];
  payments: Payment[];
  allocations: Allocation[];
  settlements: Settlement[];
  qa: QaItem[];
  policies: Policy[];
  templates: ReplyTemplate[];
  files: PreparedFile[];
  signatures: Signature[];
  memos: Memo[];
  history: HistoryEvent[];
  readiness_confirms: ReadinessConfirm[];
}

/** 화면에 내려보낼 때 이름·호실을 붙인 카드 */
export interface PartyCard {
  id: ID;
  name: string;
  kind: Party["kind"];
  phone: string;
  email: string;
}
