import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { fmt, won } from "@/lib/format";
import { Badge, Button, Dialog, ErrorBox, Loading } from "@/components/ui";
import { MONEY_KEYS } from "./api";

interface Preview {
  month: string;
  lines: Array<{ lease_id: string; unit_code: string; branch_id: string; payer: string; kind: string; label: string; amount: number; bill_date: string; needs_amount: boolean; days: number | null; month_days: number | null }>;
  total: number;
  leases: number;
  needs_amount: number;
  prorated: number;
}

/** 청구서 만들기 — 그 달이 청구일인 월세·관리비·할인 줄을 계약의 청구 규칙대로 만든다 */
export function GenerateDialog({ month, onClose }: { month: string; onClose: () => void }) {
  const { branchId, branches } = useBranch();
  const q = useApi<Preview>(["billing", "generate-preview", branchId, month], `/api/billing/generate-preview?branch_id=${branchId}&month=${month}`);
  const gen = useApiMutation<{ created: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => (r.created ? `${fmt(`${month}-01`, "M월")} 청구 ${r.created}줄을 만들었다 · 발송 대기` : "새로 만들 청구가 없다"),
    onSuccess: onClose,
  });
  const p = q.data;
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name.replace("MR.K ", "") ?? "";
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`${fmt(`${month}-01`, "yyyy년 M월")} 청구서 만들기`}
      description="계약마다 정한 청구 방식(입주일 기준·달력 월, 선불·후불, 일할, 할인)대로 이 달이 청구일인 줄을 발송 대기로 만든다. 이미 있는 줄은 건드리지 않는다."
      footer={
        <>
          {gen.error && <p className="mr-auto self-center text-xs text-bad">{gen.error.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!p?.lines.length} loading={gen.isPending} onClick={() => gen.mutate({ path: "/api/billing/generate", body: { branch_id: branchId, month } })}>
            {p?.lines.length ? `${p.lines.length}줄 만들기` : "만들 것 없음"}
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorBox error={q.error} />
      ) : !p || !p.lines.length ? (
        <p className="py-6 text-center text-sm text-ink3">이 달 청구는 이미 다 만들었다</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ["계약", `${p.leases}건`],
              ["청구 줄", `${p.lines.length}줄`],
              ["합계", won(p.total)],
              ["일할 · 고지서", `${p.prorated}줄 · ${p.needs_amount}줄`],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-line px-3 py-2">
                <div className="text-xs text-ink3">{k}</div>
                <div className="num font-semibold">{v}</div>
              </div>
            ))}
          </div>
          {p.needs_amount > 0 && <p className="text-xs text-warn">관리비 고지서 청구 {p.needs_amount}줄은 금액 없이 만들어진다. 고지서가 오면 금액을 넣어야 확인할 수 있다.</p>}
          <div className="scroll-x max-h-[46vh] overflow-y-auto rounded border border-line">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead className="sticky top-0 bg-sunken">
                <tr className="text-left text-xs text-ink3">
                  <th className="px-3 py-1.5">청구일</th>
                  <th className="px-3 py-1.5">호실</th>
                  <th className="px-3 py-1.5">납부자</th>
                  <th className="px-3 py-1.5">항목</th>
                  <th className="px-3 py-1.5 text-right">금액</th>
                </tr>
              </thead>
              <tbody>
                {p.lines.slice(0, 120).map((l, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="num whitespace-nowrap px-3 py-1.5 text-ink2">{fmt(l.bill_date, "M.d (EEE)")}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {branchId === "all" && <span className="mr-1 text-xs text-ink3">{branchName(l.branch_id)}</span>}
                      {l.unit_code}호
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">{l.payer}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      {l.label}
                      {l.days !== null && <span className="ml-1.5 text-xs text-ink3">일할 {l.days}/{l.month_days}일</span>}
                      {l.needs_amount && (
                        <Badge tone="warn" className="ml-1.5">
                          고지서 금액 필요
                        </Badge>
                      )}
                    </td>
                    <td className={`num whitespace-nowrap px-3 py-1.5 text-right ${l.amount < 0 ? "text-bad" : ""}`}>{l.needs_amount ? "—" : l.amount.toLocaleString("ko-KR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.lines.length > 120 && <p className="text-xs text-ink3">처음 120줄만 보인다 · 모두 {p.lines.length}줄</p>}
        </div>
      )}
    </Dialog>
  );
}
