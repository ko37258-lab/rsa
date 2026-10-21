import { Fragment, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, FilePlus2, Plus, Send, Trash2 } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, fmt, timeLabel, won } from "@/lib/format";
import { CHARGE_KIND } from "@/lib/codes";
import { daysBetween, plusMonth, thisMonth } from "@/lib/dates";
import { Badge, Button, EmptyState, ErrorBox, Loading, MonthNav, PageHeader, SearchBox, Segmented, StatTile } from "@/components/ui";
import type { Charge, PartyCard } from "@/types";
import type { Tone } from "@/lib/codes";
import { MONEY_KEYS } from "@/pages/leases/types";
import { DirectChargeDialog } from "./DirectChargeDialog";

type InvoiceStatus = "to_send" | "sent" | "nothing" | "paid" | "overdue";
interface Invoice {
  key: string;
  payer: PartyCard | null;
  unit_codes: string[];
  lease_ids: string[];
  lines: Array<Charge & { paid: number; left: number; unit_code: string | null }>;
  total: number;
  paid: number;
  left: number;
  status: InvoiceStatus;
  due_date: string;
  last_sent_at: string | null;
}

const STATUS: Record<InvoiceStatus, { label: string; tone: Tone }> = {
  to_send: { label: "발송 대기", tone: "warn" },
  sent: { label: "발송 완료", tone: "info" },
  overdue: { label: "연체", tone: "bad" },
  paid: { label: "다 받음", tone: "good" },
  nothing: { label: "청구 없음", tone: "neutral" },
};

type Filter = "all" | InvoiceStatus;

export default function BillingPage() {
  const [sp, setSp] = useSearchParams();
  const { branchId, branch, today } = useBranch();
  const current = thisMonth(today);
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? (sp.get("month") as string) : current;
  const filter = (sp.get("status") as Filter) || "all";
  const q = sp.get("q") ?? "";
  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
      return n;
    }, { replace: true });

  const data = useApi<Invoice[]>(["billing", branchId, month], `/api/billing?branch_id=${branchId}&month=${month}-01`);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmGen, setConfirmGen] = useState(false);

  const invoices = data.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    for (const i of invoices) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [invoices]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return invoices.filter((i) => (filter === "all" || i.status === filter) && (!needle || [i.payer?.name, ...i.unit_codes].join(" ").toLowerCase().includes(needle)));
  }, [invoices, filter, q]);
  const sendable = visible.filter((i) => i.status === "to_send");

  const generate = useApiMutation<{ created: number; month: string }>({
    invalidate: MONEY_KEYS,
    success: (r) => (r.created ? `${fmt(`${r.month}-01`, "M월")} 청구 ${r.created}줄을 만들었다 · 발송 대기` : "새로 만들 청구가 없다(이미 다 만들었다)"),
    onSuccess: () => setConfirmGen(false),
  });
  const send = useApiMutation<{ sent: number }>({
    invalidate: MONEY_KEYS,
    success: (r) => `청구 ${r.sent}줄을 보냈다`,
    onSuccess: () => setPicked(new Set()),
  });
  const remove = useApiMutation({ invalidate: MONEY_KEYS, success: "청구를 지웠다" });

  const pickedLines = invoices.filter((i) => picked.has(i.key)).flatMap((i) => i.lines.filter((l) => l.status === "draft" || l.status === "scheduled").map((l) => l.id));
  const sum = (k: "total" | "paid" | "left") => invoices.reduce((s, i) => s + i[k], 0);
  const toggle = (set: Set<string>, k: string) => {
    const n = new Set(set);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  };

  return (
    <>
      <PageHeader
        title="청구"
        subtitle={`${branch?.name ?? "전 지점"} · 납부자별 청구서. 체결된 계약의 월 청구가 여기에 모인다`}
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => update({ new: "1" })}>
              직접 청구
            </Button>
            {confirmGen ? (
              <>
                <span className="text-xs text-ink2">{fmt(`${month}-01`, "M월")}에 시작하는 청구 기간의 월세·관리비를 만든다</span>
                <Button onClick={() => setConfirmGen(false)}>취소</Button>
                <Button variant="primary" loading={generate.isPending} onClick={() => generate.mutate({ path: "/api/billing/generate", body: { branch_id: branchId, month } })}>
                  만들기
                </Button>
              </>
            ) : (
              <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => setConfirmGen(true)}>
                청구서 만들기
              </Button>
            )}
          </>
        }
      >
        <MonthNav month={month} onChange={(m) => update({ month: m === current ? null : m })} current={current} />
        {month === current && (
          <button type="button" className="text-xs font-medium text-brass hover:underline" onClick={() => update({ month: plusMonth(current, 1) })}>
            다음 달 청구 미리 보기
          </button>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={`${fmt(`${month}-01`, "M월")} 청구`} value={Math.round(sum("total") / 10000).toLocaleString("ko-KR")} unit="만원" note={`청구서 ${invoices.length}장`} />
        <StatTile label="받은 돈" value={Math.round(sum("paid") / 10000).toLocaleString("ko-KR")} unit="만원" note={sum("total") ? `${Math.round((sum("paid") / sum("total")) * 100)}% 받음` : undefined} />
        <StatTile label="남은 돈" value={sum("left").toLocaleString("ko-KR")} unit="원" tone={counts.overdue ? "bad" : undefined} note={counts.overdue ? `연체 ${counts.overdue}장` : "연체 없음"} />
        <StatTile label="보낼 청구서" value={counts.to_send ?? 0} unit="장" tone={counts.to_send ? "warn" : undefined} note={counts.to_send ? "발송 대기" : "다 보냈다"} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          size="sm"
          value={filter}
          onChange={(v) => update({ status: v === "all" ? null : v })}
          options={[
            { value: "all", label: "전체", count: counts.all ?? 0 },
            { value: "to_send", label: "발송 대기", count: counts.to_send ?? 0 },
            { value: "sent", label: "발송 완료", count: counts.sent ?? 0 },
            { value: "overdue", label: "연체", count: counts.overdue ?? 0 },
            { value: "paid", label: "다 받음", count: counts.paid ?? 0 },
          ]}
        />
        <div className="ml-auto w-full sm:w-auto">
          <SearchBox id="billing-search" value={q} onChange={(v) => update({ q: v })} placeholder="계약자, 호실" />
        </div>
      </div>

      {picked.size > 0 && (
        <div className="sticky z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-navy/30 bg-surface px-3 py-2 shadow-md" style={{ top: "calc(56px + env(safe-area-inset-top, 0px))" }}>
          <span className="text-sm font-medium">청구서 {picked.size}장 선택</span>
          <button type="button" className="text-xs text-ink3 hover:text-ink" onClick={() => setPicked(new Set())}>
            선택 해제
          </button>
          <div className="flex-1" />
          <Button size="sm" loading={send.isPending && send.variables?.body !== undefined && (send.variables.body as { via: string }).via === "manual"} onClick={() => send.mutate({ path: "/api/billing/send", body: { charge_ids: pickedLines, via: "manual" } })}>
            직접 보냄으로 기록
          </Button>
          <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={send.isPending && (send.variables?.body as { via?: string } | undefined)?.via === "email"} onClick={() => send.mutate({ path: "/api/billing/send", body: { charge_ids: pickedLines, via: "email" } })}>
            {picked.size}장 메일 발송
          </Button>
        </div>
      )}

      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorBox error={data.error} />
      ) : invoices.length === 0 ? (
        <EmptyState
          title="이 달 청구가 없다"
          body={month > current ? "« 청구서 만들기 » 를 누르면 이 달에 시작하는 청구 기간의 월세·관리비를 만든다" : "체결된 계약의 월 청구가 여기에 모인다"}
          action={<Button variant="primary" onClick={() => setConfirmGen(true)}>청구서 만들기</Button>}
        />
      ) : (
        <div className="scroll-x rounded-md border border-line bg-surface">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-sunken/60 text-xs font-semibold text-ink3">
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    id="pick-all"
                    type="checkbox"
                    aria-label="발송 대기 청구서 전체 선택"
                    className="size-4"
                    disabled={!sendable.length}
                    checked={sendable.length > 0 && sendable.every((i) => picked.has(i.key))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(sendable.map((i) => i.key)) : new Set())}
                  />
                </th>
                <th className="px-3 py-2 text-left">납부자</th>
                <th className="px-3 py-2 text-left">호실</th>
                <th className="px-3 py-2 text-left">납기일</th>
                <th className="px-3 py-2 text-right">금액</th>
                <th className="px-3 py-2 text-right">받음</th>
                <th className="px-3 py-2 text-right">남음</th>
                <th className="px-3 py-2 text-left">상태</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-12 text-center text-sm text-ink3">
                    조건에 맞는 청구가 없다 ·{" "}
                    <button type="button" className="font-medium text-brass hover:underline" onClick={() => update({ status: null, q: null })}>
                      조건 초기화
                    </button>
                  </td>
                </tr>
              )}
              {visible.map((inv) => {
                const isOpen = open.has(inv.key);
                const st = STATUS[inv.status];
                const overdueDays = inv.status === "overdue" ? daysBetween(inv.due_date, today) : 0;
                return (
                  <Fragment key={inv.key}>
                    <tr className={cx("cursor-pointer border-b border-line hover:bg-sunken/70", isOpen && "bg-sunken/50")} onClick={() => setOpen((s) => toggle(s, inv.key))}>
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          id={`pick-${inv.key}`}
                          type="checkbox"
                          className="size-4"
                          aria-label={`${inv.payer?.name ?? ""} 청구서 선택`}
                          disabled={inv.status !== "to_send"}
                          checked={picked.has(inv.key)}
                          onChange={() => setPicked((s) => toggle(s, inv.key))}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {isOpen ? <ChevronDown className="size-4 text-ink3" /> : <ChevronRight className="size-4 text-ink3" />}
                          <span className="font-medium">{inv.payer?.name ?? "—"}</span>
                          {inv.payer?.kind === "corporation" && <Badge tone="navy" dot={false}>법인</Badge>}
                        </div>
                      </td>
                      <td className="num px-3 py-2.5">{inv.unit_codes.map((c) => `${c}호`).join(", ")}</td>
                      <td className="num whitespace-nowrap px-3 py-2.5">{fmt(inv.due_date, "M.d (EEE)")}</td>
                      <td className="num px-3 py-2.5 text-right font-semibold">{inv.total.toLocaleString("ko-KR")}</td>
                      <td className="num px-3 py-2.5 text-right text-ink2">{inv.paid ? inv.paid.toLocaleString("ko-KR") : "—"}</td>
                      <td className={cx("num px-3 py-2.5 text-right", inv.left > 0 && inv.status === "overdue" ? "font-semibold text-bad" : "text-ink2")}>{inv.left > 0 ? inv.left.toLocaleString("ko-KR") : "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge tone={st.tone}>{st.label}{overdueDays ? ` ${overdueDays}일` : ""}</Badge>
                          {inv.last_sent_at && inv.status !== "to_send" && <span className="text-[11px] text-ink3">발송 {timeLabel(inv.last_sent_at)}</span>}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-line bg-sunken/30">
                        <td />
                        <td colSpan={7} className="px-3 pb-3 pt-1">
                          <table className="w-full text-[13px]">
                            <tbody>
                              {inv.lines.map((l) => (
                                <tr key={l.id} className="border-b border-line/70 last:border-0">
                                  <td className="py-1.5 pr-3 text-ink3">{l.unit_code ? `${l.unit_code}호` : ""}</td>
                                  <td className="py-1.5 pr-3">
                                    {l.label}
                                    <span className="ml-1.5 text-xs text-ink3">{CHARGE_KIND[l.kind]}</span>
                                  </td>
                                  <td className="num py-1.5 pr-3 text-xs text-ink3">{l.period_from ? `${fmt(l.period_from, "M.d")} ~ ${fmt(l.period_to, "M.d")}` : `납기 ${fmt(l.due_date, "M.d")}`}</td>
                                  <td className="num py-1.5 pr-3 text-right">
                                    {l.amount.toLocaleString("ko-KR")}
                                    {l.vat_amount > 0 && <span className="ml-1 text-[11px] text-ink3">VAT {l.vat_amount.toLocaleString("ko-KR")}</span>}
                                  </td>
                                  <td className="py-1.5 pr-3 text-right text-xs">
                                    {l.status === "draft" ? <span className="text-warn">발송 대기</span> : l.left <= 0 ? <span className="text-good">받음</span> : <span className="text-ink3">남음 {l.left.toLocaleString("ko-KR")}</span>}
                                  </td>
                                  <td className="w-8 py-1.5 text-right">
                                    {l.status === "draft" && (
                                      <button type="button" aria-label="이 청구 지우기" className="rounded p-1 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => remove.mutate({ path: `/api/billing/charges/${l.id}`, method: "DELETE" })}>
                                        <Trash2 className="size-3.5" />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                            {inv.lease_ids.map((id, i) => (
                              <Link key={id} to={`/leases/${id}?tab=money`} className="font-medium text-brass hover:underline">
                                {inv.unit_codes[i] ?? ""}호 계약 청구·수납 보기
                              </Link>
                            ))}
                            {inv.status === "to_send" && (
                              <Button size="sm" variant="primary" className="ml-auto" icon={<Send className="size-3.5" />} loading={send.isPending} onClick={() => send.mutate({ path: "/api/billing/send", body: { charge_ids: inv.lines.filter((l) => l.status === "draft").map((l) => l.id), via: "email" } })}>
                                이 청구서 발송
                              </Button>
                            )}
                            {(inv.status === "sent" || inv.status === "overdue") && (
                              <Button size="sm" className="ml-auto" loading={send.isPending} onClick={() => send.mutate({ path: "/api/billing/send", body: { charge_ids: inv.lines.filter((l) => l.left > 0).map((l) => l.id), via: "email" } })}>
                                이메일로 재발송
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink3">총액은 {won(sum("total"))}. 청구 기간은 입주일 기준 한 달씩이고 납기일은 기간 첫날이다(선불).</p>

      {sp.get("new") === "1" && <DirectChargeDialog open onClose={() => update({ new: null })} />}
    </>
  );
}
