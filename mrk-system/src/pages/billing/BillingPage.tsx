import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FilePlus2, FileSpreadsheet, Mail, Plus } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, fmt, timeLabel } from "@/lib/format";
import { daysBetween, plusMonth, thisMonth } from "@/lib/dates";
import { Badge, Button, EmptyState, ErrorBox, Loading, MonthNav, PageHeader, SearchBox, Segmented, StatTile } from "@/components/ui";
import { MONEY_KEYS, MONEY_STATE, SEND_STATE, VIA_LABEL, type BankAccountRow, type Group } from "./api";
import { DirectChargeDialog } from "./DirectChargeDialog";
import { GenerateDialog } from "./GenerateDialog";
import { BillFormDialog } from "./BillFormDialog";
import { InvoiceSheet } from "./InvoiceSheet";

type Filter = "all" | "to_send" | "needs_amount" | "scheduled" | "sent" | "failed" | "overdue" | "paid";

const MATCH: Record<Filter, (g: Group) => boolean> = {
  all: () => true,
  to_send: (g) => g.send_state === "draft" || g.send_state === "resend",
  needs_amount: (g) => g.needs_amount > 0,
  scheduled: (g) => g.send_state === "scheduled",
  sent: (g) => g.send_state === "sent",
  failed: (g) => g.send_state === "failed",
  overdue: (g) => g.money_state === "overdue",
  paid: (g) => g.money_state === "paid",
};

/** 선택해서 확인할 수 있는 묶음: 금액이 다 들어간 발송 대기 줄이 있는 것 */
const selectable = (g: Group) => g.lines.some((l) => l.status === "draft" && !l.needs_amount);

export default function BillingPage() {
  const [sp, setSp] = useSearchParams();
  const { branchId, branch, branches, today } = useBranch();
  const current = thisMonth(today);
  const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? (sp.get("month") as string) : current;
  const filter = (Object.keys(MATCH).includes(sp.get("status") ?? "") ? sp.get("status") : "all") as Filter;
  const q = sp.get("q") ?? "";
  const openKey = sp.get("invoice");
  const update = (patch: Record<string, string | null>) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const data = useApi<Group[]>(["billing", branchId, month], `/api/billing?branch_id=${branchId}&month=${month}-01`);
  const accounts = useApi<BankAccountRow[]>(["billing", "accounts"], "/api/billing/branch-accounts?branch_id=all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<"generate" | "billform" | null>(null);

  const groups = useMemo(() => data.data ?? [], [data.data]);
  const counts = useMemo(() => Object.fromEntries((Object.keys(MATCH) as Filter[]).map((f) => [f, groups.filter(MATCH[f]).length])) as Record<Filter, number>, [groups]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return groups.filter((g) => MATCH[filter](g) && (!needle || [g.payer?.name, ...g.unit_codes, g.invoice?.invoice_no].join(" ").toLowerCase().includes(needle)));
  }, [groups, filter, q]);
  const pickable = visible.filter(selectable);
  const open = groups.find((g) => g.key === openKey) ?? null;

  const confirm = useApiMutation<{ invoices: number; scheduled: number; sent: number; failed: number; blocked: number }>({
    invalidate: MONEY_KEYS,
    success: (r) =>
      [`청구서 ${r.invoices}장을 확인했다`, r.scheduled ? `메일 예약 ${r.scheduled}장` : "", r.sent ? `발송 기록 ${r.sent}장` : "", r.failed ? `메일 없음 ${r.failed}장` : "", r.blocked ? `고지서 금액 필요로 뺀 줄 ${r.blocked}` : ""]
        .filter(Boolean)
        .join(" · "),
    onSuccess: () => setPicked(new Set()),
  });
  const pickedIds = groups.filter((g) => picked.has(g.key)).flatMap((g) => g.lines.filter((l) => l.status === "draft" && !l.needs_amount).map((l) => l.id));
  const sum = (f: (g: Group) => number) => groups.reduce((s, g) => s + f(g), 0);
  const billedTotal = sum((g) => g.lines.filter((l) => l.status !== "draft").reduce((s, l) => s + l.amount, 0));
  const accountOf = (bid: string) => {
    const a = (accounts.data ?? []).find((x) => x.branch_id === bid);
    return a ? `${a.bank} ${a.number} · 예금주 ${a.holder}` : branches.find((b) => b.id === bid)?.bank_account ?? "";
  };
  const toggle = (k: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });

  return (
    <>
      <PageHeader
        title="청구"
        subtitle={`${branch?.name ?? "전 지점"} · 납부자·청구일별 청구서. 확인하면 번호가 붙고 청구일 9시에 메일로 나간다`}
        actions={
          <>
            <Button icon={<Plus className="size-4" />} onClick={() => update({ new: "1" })}>
              직접 청구
            </Button>
            <Button icon={<FileSpreadsheet className="size-4" />} onClick={() => setDialog("billform")}>
              관리비 엑셀
            </Button>
            <Button variant="primary" icon={<FilePlus2 className="size-4" />} onClick={() => setDialog("generate")}>
              청구서 만들기
            </Button>
          </>
        }
      >
        <MonthNav month={month} onChange={(m) => update({ month: m === current ? null : m, invoice: null })} current={current} />
        {month === current && (
          <button type="button" className="text-xs font-medium text-brass hover:underline" onClick={() => update({ month: plusMonth(current, 1) })}>
            다음 달 미리 보기
          </button>
        )}
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label={`${fmt(`${month}-01`, "M월")} 청구`} value={Math.round(sum((g) => g.total) / 10000).toLocaleString("ko-KR")} unit="만원" note={`청구서 ${groups.length}장 · 확인한 것 ${Math.round(billedTotal / 10000).toLocaleString("ko-KR")}만`} />
        <StatTile label="받은 돈" value={Math.round(sum((g) => g.paid) / 10000).toLocaleString("ko-KR")} unit="만원" note={billedTotal ? `확인한 청구의 ${Math.round((sum((g) => g.paid) / billedTotal) * 100)}%` : undefined} />
        <StatTile label="남은 돈" value={sum((g) => Math.max(0, g.left)).toLocaleString("ko-KR")} unit="원" tone={counts.overdue ? "bad" : undefined} note={counts.overdue ? `연체 ${counts.overdue}장` : "연체 없음"} />
        <StatTile
          label="보낼 청구서"
          value={counts.to_send}
          unit="장"
          tone={counts.to_send || counts.needs_amount ? "warn" : undefined}
          note={counts.needs_amount ? `고지서 금액 필요 ${counts.needs_amount}장` : counts.scheduled ? `메일 예약 ${counts.scheduled}장` : "다 보냈다"}
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<Filter>
          size="sm"
          value={filter}
          onChange={(v) => update({ status: v === "all" ? null : v })}
          options={[
            { value: "all", label: "전체", count: counts.all },
            { value: "to_send", label: "발송 대기", count: counts.to_send },
            { value: "needs_amount", label: "고지서 금액 필요", count: counts.needs_amount },
            { value: "scheduled", label: "메일 예약", count: counts.scheduled },
            { value: "sent", label: "발송 완료", count: counts.sent },
            ...(counts.failed ? [{ value: "failed" as Filter, label: "못 보냄", count: counts.failed }] : []),
            { value: "overdue", label: "연체", count: counts.overdue },
            { value: "paid", label: "다 받음", count: counts.paid },
          ]}
        />
        <div className="ml-auto w-full sm:w-auto">
          <SearchBox id="billing-search" value={q} onChange={(v) => update({ q: v })} placeholder="계약자, 호실, 청구서 번호" />
        </div>
      </div>

      {picked.size > 0 && (
        <div className="sticky z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-navy/30 bg-surface px-3 py-2 shadow-md" style={{ top: 8 }}>
          <span className="text-sm font-medium">청구서 {picked.size}장 선택</span>
          <button type="button" className="text-xs text-ink3 hover:text-ink" onClick={() => setPicked(new Set())}>
            선택 해제
          </button>
          <div className="flex-1" />
          <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate({ path: "/api/billing/confirm", body: { charge_ids: pickedIds, via: "manual" } })}>
            직접 보냄
          </Button>
          <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate({ path: "/api/billing/confirm", body: { charge_ids: pickedIds, via: "kakao" } })}>
            카톡
          </Button>
          <Button size="sm" variant="primary" icon={<Mail className="size-3.5" />} loading={confirm.isPending} onClick={() => confirm.mutate({ path: "/api/billing/confirm", body: { charge_ids: pickedIds, via: "email" } })}>
            {picked.size}장 확인 · 메일로 예약
          </Button>
          <p className="w-full text-[11px] text-ink3">확인하면 청구서 번호가 붙고 줄이 고정된다. 메일은 청구일 9시에 나가고, 그 전에는 «확인 취소»로 되돌린다.</p>
        </div>
      )}

      {data.isLoading ? (
        <Loading />
      ) : data.isError ? (
        <ErrorBox error={data.error} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="이 달 청구가 없다"
          body={month > current ? "« 청구서 만들기 » 를 누르면 이 달이 청구일인 월세·관리비를 계약의 청구 방식대로 만든다" : "체결된 계약의 월 청구가 여기에 모인다"}
          action={
            <Button variant="primary" onClick={() => setDialog("generate")}>
              청구서 만들기
            </Button>
          }
        />
      ) : (
        <div className="scroll-x rounded-md border border-line bg-surface">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-sunken/60 text-xs font-semibold text-ink3">
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    id="pick-all"
                    type="checkbox"
                    aria-label="발송 대기 청구서 전체 선택"
                    className="size-4"
                    disabled={!pickable.length}
                    checked={pickable.length > 0 && pickable.every((g) => picked.has(g.key))}
                    onChange={(e) => setPicked(e.target.checked ? new Set(pickable.map((g) => g.key)) : new Set())}
                  />
                </th>
                <th className="px-3 py-2 text-left">납부자</th>
                <th className="px-3 py-2 text-left">호실</th>
                <th className="px-3 py-2 text-left">청구일 · 납기</th>
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
              {visible.map((g) => {
                const st = SEND_STATE[g.send_state];
                const ms = MONEY_STATE[g.money_state];
                const overdueDays = g.money_state === "overdue" ? daysBetween(g.due_date, today) : 0;
                return (
                  <tr key={g.key} className={cx("cursor-pointer border-b border-line last:border-0 hover:bg-sunken/70", openKey === g.key && "bg-brass/10")} onClick={() => update({ invoice: g.key })}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input id={`pick-${g.key}`} type="checkbox" className="size-4" aria-label={`${g.payer?.name ?? ""} 청구서 선택`} disabled={!selectable(g)} checked={picked.has(g.key)} onChange={() => toggle(g.key)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="whitespace-nowrap font-medium">{g.payer?.name ?? "—"}</span>
                        {g.payer?.kind === "corporation" && (
                          <Badge tone="navy" dot={false}>
                            법인
                          </Badge>
                        )}
                      </div>
                      <div className="num text-[11px] text-ink3">{g.invoice ? g.invoice.invoice_no : `${g.lines.length}줄`}</div>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2.5">{g.unit_codes.map((c) => `${c}호`).join(", ")}</td>
                    <td className="num whitespace-nowrap px-3 py-2.5">
                      {fmt(g.bill_date, "M.d (EEE)")}
                      <div className="text-[11px] text-ink3">납기 {fmt(g.due_date, "M.d")}</div>
                    </td>
                    <td className="num px-3 py-2.5 text-right font-semibold">{g.needs_amount && g.needs_amount === g.lines.length ? "—" : g.total.toLocaleString("ko-KR")}</td>
                    <td className="num px-3 py-2.5 text-right text-ink2">{g.paid ? g.paid.toLocaleString("ko-KR") : "—"}</td>
                    <td className={cx("num px-3 py-2.5 text-right", g.money_state === "overdue" ? "font-semibold text-bad" : "text-ink2")}>{g.left > 0 ? g.left.toLocaleString("ko-KR") : "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-0.5">
                        <div className="flex flex-wrap gap-1">
                          <Badge tone={st.tone}>{g.send_state === "needs_amount" ? `고지서 금액 필요 ${g.needs_amount}건` : st.label}</Badge>
                          {g.money_state === "overdue" || g.money_state === "paid" ? (
                            <Badge tone={ms.tone}>
                              {ms.label}
                              {overdueDays ? ` ${overdueDays}일` : ""}
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-[11px] text-ink3">{stateNote(g)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-ink3">
        청구일·납기는 계약마다 정한 청구 방식(입주일 기준이면 기간 첫날, 달력 월이면 지점 청구일)을 따른다. 행을 누르면 청구서를 열어 확인·발송·확인 취소를 한다.
      </p>

      {open && <InvoiceSheet group={open} account={accountOf(open.branch_id)} branchName={branches.find((b) => b.id === open.branch_id)?.name ?? ""} today={today} onClose={() => update({ invoice: null })} />}
      {dialog === "generate" && <GenerateDialog month={month} onClose={() => setDialog(null)} />}
      {dialog === "billform" && <BillFormDialog month={month} onClose={() => setDialog(null)} />}
      {sp.get("new") === "1" && <DirectChargeDialog open onClose={() => update({ new: null })} />}
    </>
  );
}

function stateNote(g: Group): string {
  const inv = g.invoice;
  if (g.send_state === "scheduled" && inv?.send_after) return `${g.added_after_confirm ? "예약 뒤 청구 늘어남 · " : ""}${VIA_LABEL[inv.via]} ${timeLabel(inv.send_after)}`;
  if (g.send_state === "sent" && inv?.sent_at) return `${VIA_LABEL[inv.via]} ${timeLabel(inv.sent_at)}${inv.sends.length > 1 ? ` · ${inv.sends.length}번` : ""}`;
  if (g.send_state === "failed") return inv?.fail_reason ?? "메일 못 보냄";
  if (g.send_state === "resend") return "확인 취소함 · 다시 보낼 차례";
  if (g.send_state === "draft") return g.recipient_email ? (inv ? `확인 뒤 ${g.draft_count}줄 더해짐` : "확인 전") : "계약자 메일 없음";
  if (g.send_state === "needs_amount") return "관리비 고지서 금액을 넣는다";
  return "";
}
