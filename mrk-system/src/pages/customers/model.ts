import type { InquiryStage, LeaseStatus, Party } from "@/types";
import type { Tone } from "@/lib/codes";

export type CustomerStage = "문의 중" | "계약 중" | "거주 중" | "지난 고객" | "결렬";
export type CustomerRole = "계약자" | "납부자" | "문의자";

/** GET /api/customers 한 줄 */
export interface CustomerRow extends Party {
  branch_name: string | null;
  inquiry_count: number;
  lease_count: number;
  stage: CustomerStage;
  role: CustomerRole;
  retention: { until: string | null; reason: string };
}

export interface CustomerInquirySummary {
  id: string;
  kind: "inquiry" | "life";
  stage: InquiryStage;
  branch_name: string | null;
  created_at: string;
  last_activity_at: string;
  message: string;
  closed_at: string | null;
}

export interface CustomerLeaseSummary {
  id: string;
  status: LeaseStatus;
  unit_id: string;
  unit_code: string;
  branch_name: string;
  start_date: string;
  end_date: string;
  rent: number;
  as: "계약자" | "납부자" | "계약자·납부자";
}

/** GET /api/customers/:id */
export interface CustomerDetail extends CustomerRow {
  inquiries: CustomerInquirySummary[];
  leases: CustomerLeaseSummary[];
}

export const STAGE_TONE: Record<CustomerStage, Tone> = {
  "문의 중": "info",
  "계약 중": "violet",
  "거주 중": "good",
  "지난 고객": "neutral",
  결렬: "neutral",
};
