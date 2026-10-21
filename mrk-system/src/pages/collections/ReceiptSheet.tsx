import { useEffect, useMemo, useState } from "react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { cx, fmt, timeLabel, won } from "@/lib/format";
import { CHARGE_KIND } from "@/lib/codes";
import { Badge, Button, Field, FormGrid, Input, KeyValue, Loading, ErrorBox, MoneyInput, Sheet } from "@/components/ui";
import { MONEY_KEYS, type ReceiptDetail } from "@/pages/billing/api";

/**
 * 입금 하나의 상세: 은행 원본 줄, 플랫폼 수수료·홈즈 몫 아님, 배분 내역과 재배분.
 */
export function ReceiptSheet({ id, onClose, onMatch }: { id: string; onClose: () => void; onMatch: () => void }) {
  const q = useApi<ReceiptDetail>(["collections", "receipt", id], `/api/billing/receipts/${id}`);
  const act = useApiMutation<{ allocated?: number; left?: number }>({
    invalidate: [...MONEY_KEYS, ["collections", "receipt", id]],
    success: (r) => (typeof r?.allocated === "number" ? (r.allocated ? `${won(r.allocated)} 청구를 채웠다` : "채울 청구가 없다") : "입금을 바꿨다"),
  });
  const r = q.data?.receipt;
  return (
    <Sheet open onClose={onClose} title={r ? `${r.depositor_name} · ${won(r.amount)}` : "입금"} subtitle={r ? `${timeLabel(r.received_at)} · ${r.method === "bank" ? r.account : "직접 기록"}` : undefined} width="max-w-2xl">
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data || !r ? (
        <ErrorBox error={q.error} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.status === "matched" ? "good" : r.status === "unmatched" ? "warn" : "neutral"}>{r.status === "matched" ? "맞춤" : r.status === "unmatched" ? "안 맞춘 입금" : "수납 아님"}</Badge>
            {r.payer && (
              <span className="text-sm">
                납부자 <b>{r.payer.name}</b>
                {r.unit_codes.length > 0 && <span className="ml-1 text-xs text-ink3">{r.unit_codes.map((c) => `${c}호`).join(", ")}</span>}
              </span>
            )}
            <div className="flex-1" />
            {r.status === "unmatched" && (
              <>
                <Button size="sm" variant="primary" onClick={onMatch}>
                  납부자 맞추기
                </Button>
                <Button size="sm" variant="ghost" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/skip` })}>
                  수납 아님
                </Button>
              </>
            )}
            {r.status === "skipped" && (
              <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/unskip` })}>
                수납 아님 되돌리기
              </Button>
            )}
            {r.status === "matched" && r.left > 0 && (
              <Button size="sm" variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/apply-credit` })}>
                입금 잔액을 청구서에 넣기
              </Button>
            )}
            {r.status === "matched" && r.method === "bank" && (
              <Button size="sm" variant="ghost" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/receipts/${r.id}/unmatch` })}>
                맞춤 되돌리기
              </Button>
            )}
            {r.status === "matched" && r.method === "direct" && r.memo !== "보증금 차감" && (
              <Button
                size="sm"
                variant="danger"
                loading={act.isPending}
                onClick={() =>
                  act.mutate(
                    { path: `/api/billing/receipts/${r.id}/cancel` },
                    {
                      onSuccess: onClose,
                    },
                  )
                }
              >
                입금 취소
              </Button>
            )}
          </div>
          {act.error && <p className="-mt-3 text-xs text-bad">{act.error.message}</p>}

          <KeyValue
            cols={3}
            items={[
              ["입금", won(r.amount)],
              ["플랫폼 수수료(현금 아님, 월세 채움)", r.platform_fee ? won(r.platform_fee) : "—"],
              ["홈즈 몫 아님", r.pass_through ? `${won(r.pass_through)}${r.pass_through_reason ? ` · ${r.pass_through_reason}` : ""}` : "—"],
              ["채울 수 있는 돈", won(r.allocatable)],
              ["청구에 배분", won(r.allocated)],
              ["입금 잔액", <span key="l" className={r.left > 0 ? "font-semibold text-info" : undefined}>{won(r.left)}</span>],
            ]}
          />

          {r.status !== "skipped" && <Fees id={r.id} platform={r.platform_fee} pass={r.pass_through} reason={r.pass_through_reason} />}

          {r.status === "matched" && <Reallocate detail={q.data} />}

          {r.bank_row && Object.keys(r.bank_row).length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">은행 엑셀 원본 줄</h3>
              <div className="scroll-x rounded border border-line">
                <table className="w-full text-[13px]">
                  <tbody>
                    {Object.entries(r.bank_row).map(([k, v]) => (
                      <tr key={k} className="border-b border-line last:border-0">
                        <th scope="row" className="w-36 bg-sunken/60 px-3 py-1.5 text-left text-xs font-medium text-ink3">
                          {k}
                        </th>
                        <td className="num px-3 py-1.5">{v || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          {r.memo && <p className="text-xs text-ink3">메모 · {r.memo}</p>}
        </div>
      )}
    </Sheet>
  );
}

function Fees({ id, platform, pass, reason }: { id: string; platform: number; pass: number; reason: string | null }) {
  const [open, setOpen] = useState(platform > 0 || pass > 0);
  const [pf, setPf] = useState<number | null>(platform || null);
  const [pt, setPt] = useState<number | null>(pass || null);
  const [why, setWhy] = useState(reason ?? "");
  const save = useApiMutation({ invalidate: [...MONEY_KEYS, ["collections", "receipt", id]], success: "수수료·홈즈 몫 아님을 저장했다" });
  if (!open)
    return (
      <button type="button" className="self-start text-xs font-medium text-brass hover:underline" onClick={() => setOpen(true)}>
        플랫폼 수수료 · 홈즈 몫 아님 적기
      </button>
    );
  return (
    <section className="rounded-md border border-line p-3">
      <h3 className="mb-2 text-sm font-semibold">플랫폼 수수료 · 홈즈 몫 아님</h3>
      <FormGrid cols={3}>
        <Field label="플랫폼 수수료" htmlFor={`fee-${id}`} hint="에어비앤비 등이 떼고 보낸 돈. 월세를 채운다">
          <MoneyInput id={`fee-${id}`} value={pf} onChange={setPf} />
        </Field>
        <Field label="홈즈 몫 아님" htmlFor={`pass-${id}`} hint="관리단 등에 넘길 돈. 청구를 채우지 않는다">
          <MoneyInput id={`pass-${id}`} value={pt} onChange={setPt} />
        </Field>
        <Field label="이유" htmlFor={`why-${id}`}>
          <Input id={`why-${id}`} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="예: 관리단 몫" />
        </Field>
      </FormGrid>
      <div className="mt-2 flex items-center justify-end gap-2">
        {save.error && <p className="mr-auto text-xs text-bad">{save.error.message}</p>}
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ path: `/api/billing/receipts/${id}/fees`, body: { platform_fee: pf ?? 0, pass_through: pt ?? 0, pass_through_reason: why } })}>
          저장
        </Button>
      </div>
    </section>
  );
}

/** 재배분 — 이 입금이 어떤 청구를 얼마나 채울지 직접 정한다 */
function Reallocate({ detail }: { detail: ReceiptDetail }) {
  const r = detail.receipt;
  const initial = useMemo(() => Object.fromEntries(detail.candidates.map((c) => [c.id, c.mine])), [detail.candidates]);
  const [amounts, setAmounts] = useState<Record<string, number>>(initial);
  const [editing, setEditing] = useState(false);
  useEffect(() => setAmounts(initial), [initial]);
  const save = useApiMutation({
    invalidate: [...MONEY_KEYS, ["collections", "receipt", r.id]],
    success: "재배분했다",
    onSuccess: () => setEditing(false),
  });
  const sum = Object.values(amounts).reduce((s, v) => s + (v || 0), 0);
  const over = sum > r.allocatable;
  const rows = editing ? detail.candidates : detail.candidates.filter((c) => c.mine !== 0);
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">배분 내역</h3>
        <div className="flex-1" />
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setAmounts(Object.fromEntries(detail.candidates.map((c) => [c.id, 0])))}>
              모두 비우기
            </Button>
            <Button size="sm" onClick={() => { setAmounts(initial); setEditing(false); }}>
              취소
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={over}
              loading={save.isPending}
              onClick={() => save.mutate({ path: `/api/billing/receipts/${r.id}/reallocate`, body: { allocations: Object.entries(amounts).map(([charge_id, amount]) => ({ charge_id, amount })) } })}
            >
              재배분 저장
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => setEditing(true)}>
            재배분
          </Button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="rounded border border-line px-3 py-4 text-center text-xs text-ink3">이 입금으로 채운 청구가 없다</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
          {rows.map((c) => {
            const room = c.amount - c.paid_by_others;
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.unit_code && <span className="text-xs text-ink3">{c.unit_code}호</span>}
                    <span className="font-medium">{c.label}</span>
                    <span className="text-xs text-ink3">{CHARGE_KIND[c.kind]}</span>
                  </div>
                  <div className="num text-xs text-ink3">
                    납기 {fmt(c.due_date, "yy.M.d")} · 청구 {c.amount.toLocaleString("ko-KR")}
                    {c.paid_by_others ? ` · 다른 입금 ${c.paid_by_others.toLocaleString("ko-KR")}` : ""}
                    {c.invoice_no ? ` · ${c.invoice_no}` : ""}
                  </div>
                </div>
                {editing ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-36">
                      <MoneyInput id={`re-${c.id}`} value={amounts[c.id] ?? 0} onChange={(v) => setAmounts({ ...amounts, [c.id]: v ?? 0 })} />
                    </div>
                    <button type="button" className="whitespace-nowrap text-[11px] font-medium text-brass hover:underline" onClick={() => setAmounts({ ...amounts, [c.id]: room })}>
                      {c.amount < 0 ? "상쇄" : "가득"}
                    </button>
                  </div>
                ) : (
                  <span className={cx("num font-medium", c.mine < 0 && "text-bad")}>{c.mine.toLocaleString("ko-KR")}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <p className={cx("num mt-2 text-right text-xs", over ? "text-bad" : "text-ink2")}>
          배분 합계 {won(sum)} / 채울 수 있는 돈 {won(r.allocatable)}
          {over ? " · 넘는다" : sum < r.allocatable ? ` · 잔액 ${won(r.allocatable - sum)}` : ""}
        </p>
      )}
      {save.error && <p className="mt-1 text-xs text-bad">{save.error.message}</p>}
    </section>
  );
}
