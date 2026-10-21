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

/** 지점 계약 조건 기본값(원본 /api/leases/branch-terms) — 계약 작성 때 채워진다 */
export interface BranchTerms {
  deposit: number;
  mgmt_deposit: number;
  contract_fee: number;
  cleaning_fee_small: number; // 25㎡ 이하
  cleaning_fee_large: number;
  cycle: BillingCycle;
  billing_mode: BillingMode;
  bill_day: number; // 달력 주기의 청구일(1~31, 그 달에 없으면 말일)
  prorate: boolean; // 첫·마지막 달 일할
  due_days: number; // 청구일부터 납기까지 일수
  mgmt_mode: MgmtMode;
  vat: VatMode;
  send_hour: number; // 청구서 메일이 나가는 시각(청구일 9시)
}

/** 입금 계좌와 은행 엑셀 읽는 법(원본 /api/billing/branch-accounts, bank-format) */
export interface BankAccount {
  id: ID;
  branch_id: ID;
  bank: string;
  number: string;
  holder: string;
  /** 은행 엑셀의 머리글 이름. 비어 있으면 올릴 때 자동으로 찾는다 */
  format: { date: string; name: string; amount: string; memo: string | null } | null;
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
  bank_account: string; // 대표 계좌 표시용 문자열
  terms: BranchTerms;
  accounts: BankAccount[];
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
  /** 모집가 바뀐 기록(원본 /api/units/:id/asking-prices) */
  asking_history: Array<{ at: string; rent: number; mgmt: number; by: string }>;
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
  subject?: string | null;
  attachments?: FileRef[];
}

/** 첨부·서명본 파일. 내용은 브라우저 IndexedDB(lib/files.ts)에 있다 */
export interface FileRef {
  id: ID;
  name: string;
  size: number;
  mime: string;
  kind: "attachment" | "signed_copy" | "prepared" | "contract_pdf";
  created_at: string;
}

/**
 * 대화함 — 메일·카톡 등으로 들어온 대화. 상담·계약에 연결되지 않은 것은 「미연결 대화」.
 * (원본 /api/conversations/unlinked, /api/leases/:id/conversations)
 */
export interface Conversation {
  id: ID;
  branch_id: ID | null;
  inquiry_id: ID | null;
  lease_id: ID | null;
  channel: Channel;
  from_name: string;
  from_contact: string; // 메일 주소·전화
  subject: string;
  messages: Message[];
  created_at: string;
  last_activity_at: string;
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
  /** 법인 문의 등에서 함께 입주할 사람(원본 /api/inquiries/:id/parties) */
  extra_party_ids: ID[];
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
/** 청구 주기: 입주일 기준 매월(anniversary) / 달력 월 + 청구일(calendar) */
export type BillingCycle = "anniversary" | "calendar";
/** 선불: 그 달치를 직전 청구일에 / 후불: 지난 달치를 다음 청구일에 */
export type BillingMode = "prepaid" | "postpaid";
/** 관리비: 계약 금액 고정 / 고지서 금액(매달 입력, 늘 후불) */
export type MgmtMode = "fixed" | "bill";

export interface LeaseDiscount {
  label: string;
  amount: number; // 월 할인액(양수)
  months: number | null; // 앞에서부터 몇 달, null = 전 기간
}

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
  due_day: number; // 청구일(매월 n일). 입주일 기준 주기면 입주일의 날짜
  vat: VatMode;
  cycle: BillingCycle;
  billing_mode: BillingMode;
  prorate: boolean;
  due_days: number; // 청구일부터 납기까지 일수
  mgmt_mode: MgmtMode;
  discounts: LeaseDiscount[];
  occupant_ids: ID[]; // 계약자 말고 함께 사는 사람
  signed_copies: FileRef[]; // 서명된 계약서 사본(모두싸인 대체)
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
  | "discount" // 할인(음수 금액)
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
  bill_date: DateStr; // 청구일 — 이날 청구서가 나간다
  due_date: DateStr; // 납기
  /**
   * draft: 발송 대기(확인 전) → scheduled: 확인됨·청구서 번호 고정·메일 예약 → sent: 발송 완료.
   * 확인 취소하면 draft 로 돌아간다(번호는 다시 쓰지 않는다)
   */
  status: "draft" | "scheduled" | "sent" | "cancelled";
  invoice_no: string | null;
  invoice_id: ID | null;
  sent_at: string | null;
  sent_via: "email" | "manual" | "kakao" | null;
  created_at: string;
  /** 일할: 사용 일수 / 그 달 일수. 일할 아니면 null */
  days: number | null;
  month_days: number | null;
  /** 관리비 고지서 금액을 아직 안 넣음(「고지서 금액 필요」) */
  needs_amount: boolean;
}

/** 청구서 — 같은 납부자·같은 청구일의 청구를 묶어 확인한 것(원본 /api/billing/invoices) */
export interface Invoice {
  id: ID;
  invoice_no: string;
  branch_id: ID;
  payer_id: ID;
  bill_date: DateStr;
  charge_ids: ID[];
  total: number;
  state: "scheduled" | "sent" | "cancelled" | "failed";
  via: "email" | "manual" | "kakao";
  recipient_email: string | null;
  confirmed_at: string;
  send_after: string | null; // 메일 예약 시각
  sent_at: string | null;
  cancelled_at: string | null;
  /** 보낸 기록(첫 발송·재발송·직접 보냄) */
  sends?: Array<{ at: string; via: Invoice["via"]; to: string | null; kind: string }>;
  fail_reason?: string | null;
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
  account_id: ID | null;
  /** 플랫폼(에어비앤비 등)이 떼고 보낸 수수료 — 현금은 아니지만 월세를 채운다 */
  platform_fee: number;
  /** 홈즈(MR.K) 몫이 아닌 돈(예: 관리단에 넘길 돈) */
  pass_through: number;
  pass_through_reason: string | null;
  /** 은행 엑셀의 원래 줄(원본 /api/billing/bank-deposits/:id/original) */
  bank_row: Record<string, string> | null;
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
  file_id?: string | null; // 실제 파일(IndexedDB)
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
  /** demo: 시연 데이터 / real: 실제 운영 데이터(버전이 바뀌어도 지우지 않고 옮긴다) */
  mode: "demo" | "real";
  company_name: string;
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
  invoices: Invoice[];
  conversations: Conversation[];
}

/** 화면에 내려보낼 때 이름·호실을 붙인 카드 */
export interface PartyCard {
  id: ID;
  name: string;
  kind: Party["kind"];
  phone: string;
  email: string;
}
