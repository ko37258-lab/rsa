/**
 * 청구·수납·장부 화면이 같이 쓰는 응답 타입과 도우미.
 * (응답 모양은 mock/handlers/billing.ts 와 맞춘다)
 */
import type { Charge, ChargeKind, Invoice, Lease, PartyCard, Payment } from "@/types";
import type { Tone } from "@/lib/codes";
import { fmt } from "@/lib/format";

/** 돈 숫자가 얽혀 있어 바뀌면 같이 다시 읽는다 */
export const MONEY_KEYS = [["billing"], ["collections"], ["ledger"], ["leases"], ["settle"], ["units"], ["customers"], ["inquiries"]];

export type Line = Charge & { paid: number; left: number; unit_code: string | null };

export interface SendLog {
  at: string;
  via: Invoice["via"];
  to: string | null;
  kind: "send" | "resend" | "manual";
}

export type SendState = "draft" | "needs_amount" | "resend" | "scheduled" | "sent" | "failed" | "nothing";
export type MoneyState = "none" | "unpaid" | "partial" | "paid" | "overdue";

/** GET /api/billing — 청구서 묶음(납부자 + 청구일) */
export interface Group {
  key: string;
  payer: PartyCard | null;
  recipient_email: string | null;
  unit_codes: string[];
  lease_ids: string[];
  branch_id: string;
  bill_date: string;
  due_date: string;
  lines: Line[];
  total: number;
  paid: number;
  left: number;
  draft_count: number;
  needs_amount: number;
  added_after_confirm: number;
  send_state: SendState;
  money_state: MoneyState;
  invoice: {
    id: string;
    invoice_no: string;
    state: Invoice["state"];
    via: Invoice["via"];
    send_after: string | null;
    sent_at: string | null;
    confirmed_at: string;
    fail_reason: string | null;
    sends: SendLog[];
  } | null;
  invoice_count: number;
}

/** GET /api/billing/invoices/:id */
export interface InvoiceDetail extends Invoice {
  sends: SendLog[];
  fail_reason: string | null;
  paid: number;
  left: number;
  due_date: string;
  overdue: boolean;
  lines: Line[];
  carry_over: { total: number; lines: Line[] };
  payer: PartyCard | null;
  payer_contact: { email: string; phone: string; contact_name: string | null; kind: string } | null;
  leases: Array<{ id: string; unit_code: string }>;
  branch: { id: string; name: string; name_en: string; address: string; phone: string; email: string } | null;
  account: string;
}

export const SEND_STATE: Record<SendState, { label: string; tone: Tone }> = {
  draft: { label: "발송 대기", tone: "warn" },
  needs_amount: { label: "고지서 금액 필요", tone: "bad" },
  resend: { label: "재발송 대기", tone: "warn" },
  scheduled: { label: "메일 예약", tone: "info" },
  sent: { label: "발송 완료", tone: "good" },
  failed: { label: "못 보냄", tone: "bad" },
  nothing: { label: "보낼 것 없음", tone: "neutral" },
};

export const MONEY_STATE: Record<MoneyState, { label: string; tone: Tone }> = {
  none: { label: "확정 청구 없음", tone: "neutral" },
  unpaid: { label: "납기 전 미납", tone: "neutral" },
  partial: { label: "일부 받음", tone: "info" },
  paid: { label: "다 받음", tone: "good" },
  overdue: { label: "연체", tone: "bad" },
};

export const VIA_LABEL: Record<Invoice["via"], string> = { email: "메일", manual: "직접 보냄", kakao: "카톡" };

export interface PayerRow {
  payer_id: string;
  payer: PartyCard | null;
  unit_codes: string[];
  lease_ids: string[];
  charged: number;
  received: number;
  unpaid: number;
  upcoming: number;
  overdue_days: number;
  credit: number;
  deposit_held: number;
  leases: Array<{ id: string; unit_code: string; status: string; end_date: string }>;
  due_day: number | null;
  deposit_status: "ok" | "short";
  deposit_gap: number;
}

export type Receipt = Payment & { payer: PartyCard | null; allocatable: number; allocated: number; left: number; unit_codes: string[] };

export interface ReceiptPage {
  rows: Receipt[];
  total: number;
  next_offset: number | null;
  counts: { all: number; unmatched: number; matched: number; skipped: number };
  unmatched_total: number;
}

export interface Candidate {
  payer_id: string;
  payer: PartyCard | null;
  unit_codes: string[];
  unpaid: number;
  score: number;
  reasons: string[];
}
export interface Suggestion {
  payment_id: string;
  candidates: Candidate[];
  sure: boolean;
}

export interface ReceiptDetail {
  receipt: Receipt;
  allocations: Array<{ id: string; charge_id: string; amount: number }>;
  candidates: Array<{ id: string; label: string; kind: ChargeKind; unit_code: string | null; due_date: string; amount: number; paid_by_others: number; mine: number; invoice_no: string | null }>;
}

export interface BankAccountRow {
  id: string;
  branch_id: string;
  branch_name: string;
  bank: string;
  number: string;
  holder: string;
  format: { date: string; name: string; amount: string; memo: string | null } | null;
}

/** 청구 줄 아래 작은 설명: 기간 · 일할 */
export function lineMeta(l: Pick<Charge, "period_from" | "period_to" | "days" | "month_days" | "due_date">): string {
  const parts: string[] = [];
  if (l.period_from && l.period_to) parts.push(`${fmt(l.period_from, "M.d")} ~ ${fmt(l.period_to, "M.d")}`);
  if (l.days && l.month_days) parts.push(`일할 ${l.days}일/${l.month_days}일`);
  if (!parts.length) parts.push(`납기 ${fmt(l.due_date, "M.d")}`);
  return parts.join(" · ");
}

/** 카톡으로 보낼 청구 안내 문구 */
export function kakaoText(d: {
  branch: string;
  payer: string;
  month: string;
  lines: Array<Pick<Charge, "label" | "amount" | "days" | "month_days">>;
  total: number;
  due: string;
  account: string;
  invoice_no?: string | null;
  carry?: number;
}): string {
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const rows = d.lines.map((l) => `· ${l.label}${l.days && l.month_days ? `(일할 ${l.days}/${l.month_days}일)` : ""} ${won(l.amount)}`);
  return [
    `[${d.branch}] ${fmt(`${d.month}-01`, "M월")} 청구 안내`,
    `${d.payer}님, ${fmt(`${d.month}-01`, "M월")} 청구 금액은 ${won(d.total)}입니다.`,
    ...rows,
    ...(d.carry ? [`· 지난 미납 ${won(d.carry)} (따로 확인 부탁드립니다)`] : []),
    `납기: ${fmt(d.due, "M월 d일(EEE)")}`,
    `입금 계좌: ${d.account}`,
    ...(d.invoice_no ? [`청구서 번호 ${d.invoice_no}`] : []),
    "입금자명은 계약자 이름으로 부탁드립니다. 감사합니다.",
  ].join("\n");
}

/** 납부자가 가진 계약(직접 청구 대화상자에서 고른다) */
export type LeaseOption = Pick<Lease, "id" | "branch_id" | "status"> & { unit_code: string; branch_name: string; contractor: PartyCard | null };
