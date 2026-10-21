import { useParams } from "react-router-dom";
import { useApi } from "@/lib/hooks";
import { fmt, timeLabel } from "@/lib/format";
import { CHARGE_KIND } from "@/lib/codes";
import { PrintSheet, DocTable } from "@/components/PrintSheet";
import { ErrorBox, Loading } from "@/components/ui";
import { VIA_LABEL, kakaoText, type InvoiceDetail } from "./api";
import { CopyTextButton } from "./CopyText";

const n = (v: number) => v.toLocaleString("ko-KR");

/** A4 청구서(/print/invoice/:invoiceId) — 인쇄하거나 PDF 로 저장해 보낸다 */
export default function InvoicePrintPage() {
  const { invoiceId } = useParams();
  const q = useApi<InvoiceDetail>(["billing", "invoice", invoiceId], invoiceId ? `/api/billing/invoices/${invoiceId}` : null);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data)
    return (
      <div className="p-6">
        <ErrorBox error={q.error ?? new Error("청구서를 찾지 못했다")} />
      </div>
    );
  const d = q.data;
  const units = d.leases.map((l) => `${l.unit_code}호`).join(", ");
  const due = d.left + d.carry_over.total;
  const month = d.bill_date.slice(0, 7);
  const sumSupply = d.lines.reduce((s, l) => s + l.supply, 0);
  const sumVat = d.lines.reduce((s, l) => s + l.vat_amount, 0);
  const text = () =>
    kakaoText({ branch: d.branch?.name ?? "", payer: d.payer?.name ?? "", month, lines: d.lines, total: d.total, due: d.due_date, account: d.account, invoice_no: d.invoice_no, carry: d.carry_over.total });

  return (
    <PrintSheet title={`청구서 ${d.invoice_no} · ${d.payer?.name ?? ""}`} actions={<CopyTextButton text={text} />}>
      {/* 좁은 화면에서는 A4 모양을 지키고 문서 안에서 옆으로 넘긴다 */}
      <div className="overflow-x-auto print:overflow-visible">
      <div className="min-w-[600px] print:min-w-0">
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-[#111] pb-4">
        <div>
          <div className="text-[11px] font-semibold tracking-[0.2em] text-[#666]">INVOICE</div>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight">청구서</h1>
          <div className="mt-1 text-[13px] text-[#444]">{fmt(`${month}-01`, "yyyy년 M월")} 청구분</div>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-[#666]">청구서 번호</dt>
          <dd className="num font-semibold">{d.invoice_no}</dd>
          <dt className="text-[#666]">청구일</dt>
          <dd className="num">{fmt(d.bill_date, "yyyy.M.d (EEE)")}</dd>
          <dt className="text-[#666]">납기</dt>
          <dd className="num font-semibold">{fmt(d.due_date, "yyyy.M.d (EEE)")}</dd>
          <dt className="text-[#666]">상태</dt>
          <dd>{d.state === "sent" ? `발송 ${d.sent_at ? timeLabel(d.sent_at) : ""} · ${VIA_LABEL[d.via]}` : d.state === "scheduled" ? "메일 예약" : d.state === "failed" ? "못 보냄" : "확인 취소"}</dd>
        </dl>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6 text-[12.5px]">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-[#666]">받는 분</div>
          <div className="text-[16px] font-semibold">
            {d.payer?.name ?? ""} {d.payer?.kind === "corporation" ? "귀중" : "님"}
          </div>
          {d.payer_contact?.contact_name && <div>담당 {d.payer_contact.contact_name}</div>}
          <div className="text-[#444]">{units}</div>
          {d.payer_contact?.email && <div className="text-[#444]">{d.payer_contact.email}</div>}
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold text-[#666]">보내는 곳</div>
          <div className="text-[14px] font-semibold">{d.branch?.name}</div>
          <div className="text-[#444]">{d.branch?.address}</div>
          <div className="text-[#444]">
            {d.branch?.phone} · {d.branch?.email}
          </div>
        </div>
      </section>

      <section className="mt-5 flex flex-wrap items-stretch gap-0 border border-[#111]">
        <div className="flex-1 border-r border-[#111] px-4 py-3">
          <div className="text-[11px] font-semibold text-[#666]">납부하실 금액</div>
          <div className="num mt-0.5 text-[24px] font-bold">{n(due)}원</div>
          {d.carry_over.total > 0 && <div className="text-[11px] text-[#444]">이번 청구 {n(d.left)}원 + 지난 미납 {n(d.carry_over.total)}원</div>}
        </div>
        <div className="flex-[1.4] px-4 py-3">
          <div className="text-[11px] font-semibold text-[#666]">입금 계좌</div>
          <div className="mt-0.5 text-[13.5px] font-semibold">{d.account}</div>
          <div className="text-[11px] text-[#444]">입금자명은 계약자 이름으로 적어 주세요 · 납기 {fmt(d.due_date, "M월 d일")}</div>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-1.5 text-[13px] font-semibold">청구 항목</h2>
        <DocTable
          head={["호실", "항목", "사용기간", "공급가", "부가세", "합계"]}
          rows={[
            ...d.lines.map((l) => [
              l.unit_code ? `${l.unit_code}호` : "",
              <span key="l">
                {l.label}
                <span className="ml-1 text-[10.5px] text-[#666]">{CHARGE_KIND[l.kind]}</span>
              </span>,
              <span key="p" className="num">
                {l.period_from && l.period_to ? `${fmt(l.period_from, "yy.M.d")} ~ ${fmt(l.period_to, "M.d")}` : "—"}
                {l.days && l.month_days ? <span className="block text-[10.5px] text-[#666]">일할 {l.days}일/{l.month_days}일</span> : null}
              </span>,
              <span key="s" className="num block text-right">{n(l.supply)}</span>,
              <span key="v" className="num block text-right">{l.vat_amount ? n(l.vat_amount) : "—"}</span>,
              <span key="a" className="num block text-right font-medium">{n(l.amount)}</span>,
            ]),
            [
              "",
              <b key="t">이번 청구 합계</b>,
              "",
              <span key="s" className="num block text-right">{n(sumSupply)}</span>,
              <span key="v" className="num block text-right">{sumVat ? n(sumVat) : "—"}</span>,
              <b key="a" className="num block text-right">{n(d.total)}</b>,
            ],
          ]}
        />
        {d.paid !== 0 && (
          <p className="num mt-1.5 text-right text-[12px]">
            이미 받은 금액 {n(d.paid)}원 · 남은 금액 <b>{n(d.left)}원</b>
          </p>
        )}
      </section>

      {d.carry_over.total > 0 && (
        <section className="mt-5">
          <h2 className="mb-1.5 text-[13px] font-semibold">지난 미납(이월)</h2>
          <DocTable
            head={["납기", "호실", "항목", "남은 금액"]}
            rows={[
              ...d.carry_over.lines.map((l) => [
                <span key="d" className="num">{fmt(l.due_date, "yy.M.d")}</span>,
                l.unit_code ? `${l.unit_code}호` : "",
                l.label,
                <span key="a" className="num block text-right">{n(l.left)}</span>,
              ]),
              ["", "", <b key="t">합계</b>, <b key="s" className="num block text-right">{n(d.carry_over.total)}</b>],
            ]}
          />
        </section>
      )}

      <section className="mt-6 border-t border-[#999] pt-3 text-[11.5px] leading-relaxed text-[#333]">
        <p>· 납기가 지나면 연체로 안내드리며, 30일이 넘으면 보증금 차감을 검토할 수 있습니다.</p>
        <p>· 금액이 다르거나 궁금한 점은 {d.branch?.phone} 또는 {d.branch?.email} 로 문의해 주세요.</p>
        <p className="mt-3 text-[10.5px] text-[#777]">
          {d.branch?.name_en} · MR.K 관리 시스템에서 발행 · {timeLabel(d.confirmed_at)} 확인
        </p>
      </section>
      </div>
      </div>
    </PrintSheet>
  );
}
