import type { ChargeKind, Channel, InquiryStage, LeaseStatus } from "@/types";

/** 상태 배지 색. 의미색만 쓴다(브랜드 색과 분리) */
export type Tone = "neutral" | "navy" | "good" | "warn" | "bad" | "info" | "violet" | "brass";

export interface Code {
  label: string;
  tone: Tone;
}

export const LEASE_STATUS: Record<LeaseStatus, Code> = {
  draft: { label: "작성 중", tone: "neutral" },
  awaiting_signature: { label: "서명 대기", tone: "warn" },
  concluded: { label: "체결", tone: "violet" },
  move_in_confirmed: { label: "입주 예정", tone: "info" },
  occupied: { label: "거주 중", tone: "good" },
  closing: { label: "퇴실·정산", tone: "brass" },
  closed: { label: "끝남", tone: "neutral" },
  cancelled: { label: "취소", tone: "bad" },
};

/** 계약 상태 전이 — 원본 PMS 의 흐름을 그대로 따른다 */
export const LEASE_FLOW: Partial<Record<LeaseStatus, { to: LeaseStatus; label: string }[]>> = {
  draft: [
    { to: "awaiting_signature", label: "서명 요청" },
    { to: "cancelled", label: "작성 취소" },
  ],
  awaiting_signature: [
    { to: "concluded", label: "서명 완료 · 체결" },
    { to: "cancelled", label: "계약 취소" },
  ],
  concluded: [
    { to: "move_in_confirmed", label: "입주 일정 확정" },
    { to: "cancelled", label: "계약 취소" },
  ],
  move_in_confirmed: [{ to: "occupied", label: "입주 처리" }],
  occupied: [{ to: "closing", label: "퇴실 처리" }],
  closing: [{ to: "closed", label: "정산 끝 · 계약 종료" }],
};

/** 열린 계약(호실을 차지하는 계약) */
export const OPEN_LEASE: LeaseStatus[] = ["awaiting_signature", "concluded", "move_in_confirmed", "occupied", "closing"];
/** 체결 이후 계약(계약율 계산 기준) */
export const SIGNED_LEASE: LeaseStatus[] = ["concluded", "move_in_confirmed", "occupied", "closing", "closed"];

export const INQUIRY_STAGE: Record<InquiryStage, Code> = {
  new: { label: "문의", tone: "info" },
  tour: { label: "투어", tone: "violet" },
  drafting: { label: "계약 작성", tone: "brass" },
  signing: { label: "서명 요청", tone: "warn" },
  concluded: { label: "체결", tone: "good" },
  lost: { label: "결렬", tone: "neutral" },
};

export const INQUIRY_FUNNEL: InquiryStage[] = ["new", "tour", "drafting", "signing", "concluded"];

export const LOST_REASONS = ["가격", "입주 시기 안 맞음", "다른 곳 계약", "연락 두절", "방 조건", "기타"];

export const CHANNEL: Record<Channel, string> = {
  phone: "전화",
  visit: "방문",
  email: "메일",
  web: "홈페이지",
  kakao: "카카오톡",
  platform: "중개 플랫폼",
};

/** 유입경로 대분류 → 세부 경로 */
export const SOURCES: Record<string, string[]> = {
  검색: ["네이버", "구글", "다음"],
  플랫폼: ["직방", "다방", "에어비앤비", "리브애니웨어"],
  SNS: ["인스타그램", "유튜브", "블로그"],
  소개: ["입주자 소개", "법인 제휴", "지인"],
  기타: ["현수막·간판", "재계약", "기타"],
};

export const CHARGE_KIND: Record<ChargeKind, string> = {
  rent: "월세",
  mgmt: "관리비",
  usage: "사용료",
  deposit: "보증금",
  contract_fee: "계약금",
  prepaid_rent: "선납임대료",
  penalty: "위약금",
  damage: "원상복구",
  cleaning: "퇴실청소비",
  discount: "할인",
  other: "기타",
};

/** 계약금·보증금처럼 매출이 아닌(돌려줄 수 있는) 돈 */
export const NON_REVENUE: ChargeKind[] = ["deposit", "contract_fee", "prepaid_rent"];

export const VAT_MODE = {
  none: "부가세 없음",
  included: "부가세 포함",
  excluded: "부가세 별도",
} as const;

export const NATIONALITY: Record<string, string> = {
  KR: "한국",
  JP: "일본",
  CN: "중국",
  US: "미국",
  VN: "베트남",
  FR: "프랑스",
  DE: "독일",
  TW: "대만",
};
