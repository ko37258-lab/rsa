import { useParams } from "react-router-dom";
import { useApi } from "@/lib/hooks";
import { fmt, won } from "@/lib/format";
import { NATIONALITY, VAT_MODE } from "@/lib/codes";
import { ErrorBox, Loading } from "@/components/ui";
import { DocTable, PrintSheet } from "@/components/PrintSheet";
import type { Policy } from "@/types";
import type { LeaseDetail } from "./types";
import { ROLE_LABEL, termLabel } from "./parts";

/**
 * 주택 임대차 계약서(인쇄·PDF). 모두싸인 대신 이 문서를 PDF 로 저장해 보내고, 서명본을 받아 계약에 붙인다.
 * 특약은 운영정책 중 확정된 「계약」「정산」 정책을 그대로 싣는다.
 */
export default function LeasePrintPage() {
  const { leaseId = "" } = useParams();
  const q = useApi<LeaseDetail>(["leases", "detail", leaseId], `/api/leases/${leaseId}`);
  const pol = useApi<Policy[]>(["policies", "print", q.data?.branch_id ?? ""], q.data ? `/api/qa/policies?branch_id=${q.data.branch_id}` : null);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} />;
  const l = q.data;
  const special = (pol.data ?? []).filter((p) => p.state === "confirmed" && (p.category === "계약" || p.category === "정산") && (!p.branch_id || p.branch_id === l.branch_id));
  const occupants = l.parties.filter((p) => p.roles.includes("occupant"));
  const balance = l.deposit + l.mgmt_deposit - l.contract_fee;
  const balanceDay = l.start_date;
  const accounts = l.branch?.accounts?.length ? l.branch.accounts.map((a) => `${a.bank} ${a.number} (예금주 ${a.holder})`).join(", ") : l.branch?.bank_account ?? "—";
  const unitName = [l.branch?.address, l.building?.name, `${l.unit_code}호`].filter(Boolean).join(" ");
  // 지점 이름에 회사 이름이 이미 들어 있으면("MR.K 판교") 한 번만 쓴다
  const branchName = l.branch?.name ?? l.branch_name;
  const lessor = branchName.startsWith(l.company_name) ? branchName : `${l.company_name} ${branchName}`;
  const docNo = `${l.start_date.replace(/-/g, "").slice(2)}-${l.unit_code}-${l.id.slice(-4).toUpperCase()}`;

  return (
    <PrintSheet title={`${l.unit_code}호 계약서 · ${l.contractor?.name ?? ""}`}>
      <header className="mb-6 text-center">
        <h1 className="text-[22px] font-bold tracking-[0.3em]">주택 임대차 계약서</h1>
        {l.renewal_of && <p className="mt-1 text-[13px] font-semibold">(재계약)</p>}
        <p className="mt-2 text-[11px] text-[#555]">
          계약 번호 {docNo} · 작성일 {fmt(l.created_at, "yyyy년 M월 d일")}
        </p>
      </header>

      <p className="mb-4">임대인과 임차인은 아래 표시 주택에 관하여 다음과 같이 임대차 계약을 맺는다.</p>

      <h2 className="mb-1.5 mt-5 text-[13px] font-bold">1. 부동산의 표시</h2>
      <DocTable
        rows={[
          ["소재지", unitName],
          ["룸타입 · 전용면적", `${l.unit_type_name ?? "—"} · ${l.unit?.area_m2 ?? l.unit_type?.area_m2 ?? "—"}㎡${l.unit?.floor ? ` · ${l.unit.floor}층` : ""}${l.unit?.facing ? ` · ${l.unit.facing}향` : ""}`],
          ["임대할 부분", `${l.unit_code}호 전부(가구·가전 포함, 공용 공간은 함께 사용)`],
        ]}
      />

      <h2 className="mb-1.5 mt-5 text-[13px] font-bold">2. 계약 내용</h2>
      <p className="mb-1.5 font-semibold">제1조 (보증금과 차임)</p>
      <DocTable
        head={["항목", "금액", "지급 시기"]}
        rows={[
          ...(l.renewal_of
            ? [["보증금", `${won(l.deposit)} · 관리비 보증금 ${won(l.mgmt_deposit)}`, "앞 계약에서 받은 보증금을 그대로 이어서 둔다"]]
            : [
                ["보증금", won(l.deposit), "아래 계약금·잔금으로 나눠 낸다"],
                ["관리비 보증금", won(l.mgmt_deposit), "잔금과 함께"],
                ["계약금", won(l.contract_fee), "계약서에 서명할 때"],
                ["잔금", won(balance), `${fmt(balanceDay, "yyyy년 M월 d일")} 입주 전까지`],
              ]),
          ...(l.prepaid_rent ? [["선납임대료", won(l.prepaid_rent), "입주 전까지"]] : []),
          ["차임(월세)", won(l.rent), "아래 제3조의 청구일에"],
          ["관리비", l.mgmt_mode === "bill" ? "매달 고지서 금액" : won(l.mgmt_fee), l.mgmt_mode === "bill" ? "고지서가 온 뒤 다음 청구일에(후불)" : "월세와 함께"],
          ["부가세", VAT_MODE[l.vat], l.vat === "excluded" ? "월세·관리비에 10% 더해 청구" : "—"],
        ]}
      />

      <p className="mb-1.5 mt-4 font-semibold">제2조 (임대차 기간)</p>
      <p>
        {fmt(l.start_date, "yyyy년 M월 d일")}부터 {fmt(l.end_date, "yyyy년 M월 d일")}까지 ({termLabel(l.start_date, l.end_date)}). 임대인은 시작일까지 주택을 임차인에게 인도한다.
      </p>

      <p className="mb-1.5 mt-4 font-semibold">제3조 (청구와 납부)</p>
      <DocTable
        rows={[
          ["청구 주기", l.cycle === "calendar" ? `달력 월 단위 · 매월 ${l.due_day}일 청구(그 달에 없는 날이면 말일)` : `입주일 기준 한 달 단위 · 매월 ${l.due_day}일 청구`],
          ["선불 · 후불", l.billing_mode === "prepaid" ? "선불 — 그 달치를 직전 청구일에 청구한다" : "후불 — 지난 달치를 다음 청구일에 청구한다"],
          ["일할", l.prorate ? "첫 달·마지막 달은 그 달 실제 일수로 나누어 청구한다" : "일할하지 않는다"],
          ["납부 기한", l.due_days ? `청구일부터 ${l.due_days}일 안` : "청구일 당일"],
          ["입금 계좌", accounts],
        ]}
      />

      {l.discounts.length > 0 && (
        <>
          <p className="mb-1.5 mt-4 font-semibold">제4조 (할인)</p>
          <ul className="list-disc pl-5">
            {l.discounts.map((d, i) => (
              <li key={i}>
                {d.label}: 월 {won(d.amount)} {d.months ? `(처음 ${d.months}달)` : "(전 기간)"}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mb-1.5 mt-4 font-semibold">제{l.discounts.length ? 5 : 4}조 (퇴실과 정산)</p>
      <p>
        임차인은 기간이 끝나면 주택을 원래대로 돌려준다. 퇴실청소비 {won(l.cleaning_fee)}과 미납 차임·관리비, 임차인 탓으로 생긴 원상복구 비용은 보증금에서 빼고 남은 금액을 반환한다.
      </p>

      <h2 className="mb-1.5 mt-5 text-[13px] font-bold">3. 특약사항</h2>
      {special.length === 0 && !l.memo ? (
        <p className="text-[#555]">없음</p>
      ) : (
        <ol className="list-decimal pl-5">
          {special.map((p) => (
            <li key={p.id} className="mb-1">
              <span className="font-semibold">{p.title}</span> — {p.body} <span className="text-[10.5px] text-[#666]">[{p.code}]</span>
            </li>
          ))}
          {l.memo && <li className="whitespace-pre-wrap">{l.memo}</li>}
        </ol>
      )}

      <h2 className="mb-1.5 mt-5 text-[13px] font-bold">4. 계약 당사자</h2>
      <DocTable
        head={["구분", "이름", "연락처", "주소 · 국적"]}
        rows={[
          ["임대인", lessor, [l.branch?.phone, l.branch?.email].filter(Boolean).join(" · "), l.branch?.address ?? ""],
          ...l.parties
            .filter((p) => !p.roles.includes("occupant"))
            .map((p) => [p.roles.map((r) => (r === "contractor" ? "임차인" : ROLE_LABEL[r])).join(" · "), p.name, [p.phone, p.email].filter(Boolean).join(" · "), NATIONALITY[p.nationality] ?? p.nationality]),
          ...occupants.map((p) => ["함께 사는 사람", p.name, [p.phone, p.email].filter(Boolean).join(" · "), NATIONALITY[p.nationality] ?? p.nationality]),
        ]}
      />

      <p className="mt-8 text-center">이 계약을 증명하기 위해 계약서를 작성하고 임대인과 임차인이 서명한다.</p>
      <p className="mt-3 text-center font-semibold">{fmt(l.signed_at ?? l.created_at, "yyyy년 M월 d일")}</p>
      <div className="mt-8 grid grid-cols-2 gap-8">
        <Sign who="임대인" name={lessor} />
        <Sign who="임차인" name={l.contractor?.name ?? ""} />
      </div>
    </PrintSheet>
  );
}

function Sign({ who, name }: { who: string; name: string }) {
  return (
    <div>
      <div className="text-[11px] text-[#555]">{who}</div>
      <div className="mt-1 flex items-end justify-between border-b border-[#333] pb-1">
        <span className="font-semibold">{name}</span>
        <span className="text-[#777]">(서명 또는 인)</span>
      </div>
    </div>
  );
}
