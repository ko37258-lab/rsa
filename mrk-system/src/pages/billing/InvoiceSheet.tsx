import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Mail, Pencil, Send, Trash2, Undo2 } from "lucide-react";
import { useApiMutation } from "@/lib/hooks";
import { cx, fmt, timeLabel, won } from "@/lib/format";
import { CHARGE_KIND } from "@/lib/codes";
import { Badge, Button, LinkButton, Sheet } from "@/components/ui";
import { MONEY_KEYS, MONEY_STATE, SEND_STATE, VIA_LABEL, kakaoText, lineMeta, type Group, type Line } from "./api";
import { BillAmountDialog } from "./BillAmountDialog";
import { CopyTextButton } from "./CopyText";

/** 청구서 하나(납부자 + 청구일)의 상세 · 발송 동작 */
export function InvoiceSheet({ group, account, branchName, today, onClose }: { group: Group | null; account: string; branchName: string; today: string; onClose: () => void }) {
  const [edit, setEdit] = useState<Line | null>(null);
  const act = useApiMutation({ invalidate: MONEY_KEYS, success: (r: unknown) => successText(r) });
  if (!group) return null;
  const g = group;
  const inv = g.invoice;
  const drafts = g.lines.filter((l) => l.status === "draft");
  const ready = drafts.filter((l) => !l.needs_amount);
  const st = SEND_STATE[g.send_state];
  const ms = MONEY_STATE[g.money_state];
  const confirm = (via: "email" | "manual" | "kakao") => act.mutate({ path: "/api/billing/confirm", body: { charge_ids: ready.map((l) => l.id), via } });
  const text = () =>
    kakaoText({
      branch: branchName,
      payer: g.payer?.name ?? "",
      month: g.bill_date.slice(0, 7),
      lines: g.lines.filter((l) => !l.needs_amount),
      total: g.lines.filter((l) => !l.needs_amount).reduce((s, l) => s + l.amount, 0),
      due: g.due_date,
      account,
      invoice_no: inv?.invoice_no,
    });

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${g.payer?.name ?? ""} · ${fmt(g.bill_date, "M월 d일")} 청구`}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          {g.money_state !== "none" && <Badge tone={ms.tone}>{ms.label}</Badge>}
          {inv && <span className="num">청구서 {inv.invoice_no}</span>}
          <span>
            {g.unit_codes.map((c) => `${c}호`).join(", ")} · 납기 {fmt(g.due_date, "M.d (EEE)")}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        {/* 지금 할 수 있는 일 */}
        <section className="flex flex-col gap-2 rounded-md border border-line bg-sunken/40 p-3">
          <StateNote g={g} today={today} />
          <div className="flex flex-wrap gap-2">
            {ready.length > 0 && (
              <>
                <Button size="sm" variant="primary" icon={<Mail className="size-3.5" />} loading={act.isPending} onClick={() => confirm("email")}>
                  확인 · 메일로 예약
                </Button>
                <Button size="sm" loading={act.isPending} onClick={() => confirm("manual")}>
                  직접 보내고 기록
                </Button>
                <Button size="sm" loading={act.isPending} onClick={() => confirm("kakao")}>
                  카톡으로 보내고 기록
                </Button>
              </>
            )}
            {inv?.state === "scheduled" && (
              <>
                <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/send-now` })}>
                  지금 보내기
                </Button>
                <Button size="sm" icon={<Undo2 className="size-3.5" />} loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/unconfirm` })}>
                  확인 취소
                </Button>
              </>
            )}
            {inv?.state === "failed" && (
              <>
                <Button size="sm" variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/mark-sent`, body: { via: "manual" } })}>
                  직접 보냄으로 기록
                </Button>
                <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/send-now` })}>
                  메일 다시 시도
                </Button>
                <Button size="sm" icon={<Undo2 className="size-3.5" />} loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/unconfirm` })}>
                  확인 취소
                </Button>
              </>
            )}
            {inv?.state === "sent" && (
              <>
                <Button size="sm" icon={<Mail className="size-3.5" />} loading={act.isPending} disabled={!g.recipient_email} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/resend`, body: { via: "email" } })}>
                  이메일로 재발송
                </Button>
                <Button size="sm" loading={act.isPending} onClick={() => act.mutate({ path: `/api/billing/invoices/${inv.id}/mark-sent`, body: { via: "manual" } })}>
                  다시 직접 보냄
                </Button>
              </>
            )}
            {inv && (
              <LinkButton size="sm" to={`/print/invoice/${inv.id}`} icon={<FileText className="size-3.5" />}>
                청구서 보기
              </LinkButton>
            )}
            <CopyTextButton text={text} />
          </div>
          {ready.length > 0 && <p className="text-xs leading-relaxed text-ink3">확인하면 청구서 번호가 붙고 줄이 고정된다. 메일은 청구일 9시에 계약자에게 나가고, 그 전에는 «확인 취소»로 되돌린다.</p>}
          {act.error && <p className="text-xs text-bad">{act.error.message}</p>}
        </section>

        {/* 청구 줄 */}
        <section>
          <h3 className="mb-2 text-sm font-semibold">청구 항목</h3>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {g.lines.map((l) => (
              <li key={l.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {l.unit_code && <span className="text-xs text-ink3">{l.unit_code}호</span>}
                    <span className="font-medium">{l.label}</span>
                    <span className="text-xs text-ink3">{CHARGE_KIND[l.kind]}</span>
                    {l.needs_amount && <Badge tone="bad">고지서 금액 필요</Badge>}
                  </div>
                  <div className="num text-xs text-ink3">
                    {lineMeta(l)}
                    {l.invoice_no ? ` · ${l.invoice_no}` : ""}
                  </div>
                </div>
                <div className="num shrink-0 text-right">
                  <div className={cx(l.amount < 0 && "text-bad")}>{l.needs_amount ? "—" : l.amount.toLocaleString("ko-KR")}</div>
                  {l.vat_amount !== 0 && <div className="text-[11px] text-ink3">VAT {l.vat_amount.toLocaleString("ko-KR")}</div>}
                  <div className="text-xs">
                    {l.status === "draft" ? <span className="text-warn">발송 대기</span> : l.left === 0 ? <span className="text-good">{l.amount < 0 ? "상쇄" : "받음"}</span> : l.left > 0 ? <span className="text-ink3">남음 {l.left.toLocaleString("ko-KR")}</span> : <span className="text-ink3">상쇄 전</span>}
                  </div>
                </div>
                {l.status === "draft" && (
                  <div className="flex shrink-0 flex-col gap-1">
                    <button type="button" aria-label={l.needs_amount ? "고지서 금액 넣기" : "금액 고치기"} className={cx("rounded p-1 hover:bg-sunken", l.needs_amount ? "text-bad" : "text-ink3 hover:text-ink")} onClick={() => setEdit(l)}>
                      <Pencil className="size-3.5" />
                    </button>
                    <button type="button" aria-label="이 청구 지우기" className="rounded p-1 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => act.mutate({ path: `/api/billing/charges/${l.id}`, method: "DELETE" })}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
            <li className="flex justify-between bg-sunken/50 px-3 py-2 text-sm font-semibold">
              <span>합계</span>
              <span className="num">{won(g.total)}</span>
            </li>
          </ul>
          {g.needs_amount > 0 && (
            <p className="mt-2 text-xs text-bad">
              고지서 금액 필요 {g.needs_amount}건 · 연필 단추로 금액을 넣거나 «관리비 엑셀 올리기»로 한 번에 넣는다
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {g.lease_ids.map((id, i) => (
              <Link key={id} to={`/leases/${id}?tab=money`} className="font-medium text-brass hover:underline">
                {g.unit_codes[i] ?? ""}호 계약 청구·수납 보기
              </Link>
            ))}
          </div>
        </section>

        {/* 발송 기록 */}
        {inv && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">발송 기록</h3>
            <ol className="flex flex-col gap-1.5 text-[13px]">
              <li className="text-ink2">
                <span className="num">{timeLabel(inv.confirmed_at)}</span> · 확인 · 청구서 {inv.invoice_no}
              </li>
              {inv.state === "scheduled" && inv.send_after && (
                <li className="text-info">
                  <span className="num">{timeLabel(inv.send_after)}</span> · {VIA_LABEL[inv.via]} 예약 → {g.recipient_email}
                </li>
              )}
              {inv.state === "failed" && <li className="text-bad">못 보냄 · {inv.fail_reason ?? "이유 모름"}</li>}
              {inv.sends.map((s, i) => (
                <li key={i} className="text-ink2">
                  <span className="num">{timeLabel(s.at)}</span> · {s.kind === "resend" ? "재발송" : "발송"} · {VIA_LABEL[s.via]}
                  {s.to ? ` → ${s.to}` : ""}
                </li>
              ))}
            </ol>
            {g.invoice_count > 1 && <p className="mt-1 text-xs text-ink3">이 청구일에 청구서가 {g.invoice_count}장 있다(확인 뒤 더해진 청구)</p>}
          </section>
        )}
      </div>
      {edit && <BillAmountDialog line={edit} onClose={() => setEdit(null)} />}
    </Sheet>
  );
}

function StateNote({ g, today }: { g: Group; today: string }) {
  const inv = g.invoice;
  const t = (s: string) => <span className="text-sm">{s}</span>;
  if (g.send_state === "needs_amount") return t(`관리비 고지서 금액이 ${g.needs_amount}건 비어 있다. 금액을 넣어야 청구서를 확인할 수 있다.`);
  if (g.send_state === "resend") return t("확인을 취소한 청구서다. 메일은 나가지 않았고 다시 보낼 차례다. 번호는 다시 쓰지 않는다.");
  if (g.send_state === "draft" && inv) return t(`청구서를 확인한 뒤 청구 ${g.added_after_confirm || g.draft_count}줄이 더해졌다 · 따로 확인한다`);
  if (g.send_state === "draft") return t(g.recipient_email ? `확인하면 ${fmt(g.bill_date, "M.d")} 9시에 ${g.recipient_email} 로 메일이 나간다.` : "계약자 메일이 없다 · 직접 보내거나 카톡으로 보내고 기록한다.");
  if (g.send_state === "scheduled" && inv?.send_after) return t(`메일 예약 · ${timeLabel(inv.send_after)}에 ${g.recipient_email ?? ""} 로 나간다.`);
  if (g.send_state === "failed") return t(`메일을 못 보냈다 · ${inv?.fail_reason ?? ""}`);
  if (g.send_state === "sent" && inv?.sent_at) return t(`${timeLabel(inv.sent_at)} ${VIA_LABEL[inv.via]}로 보냈다${g.money_state === "overdue" ? ` · 납기 ${fmt(g.due_date, "M.d")} 지남` : ""}${g.due_date < today && g.left <= 0 ? " · 다 받음" : ""}.`);
  return t("보낼 것이 없다.");
}

function successText(r: unknown): string {
  const o = (r ?? {}) as Record<string, unknown>;
  if (typeof o.invoices === "number") {
    const parts = [`청구서 ${o.invoices}장을 확인했다`];
    if (o.scheduled) parts.push(`메일 예약 ${o.scheduled}장`);
    if (o.sent) parts.push(`발송 기록 ${o.sent}장`);
    if (o.failed) parts.push(`메일 없음 ${o.failed}장`);
    return parts.join(" · ");
  }
  if (o.invoice_no && o.ok) return `확인을 취소했다 · ${o.invoice_no} 번호는 다시 쓰지 않는다`;
  if (o.state === "sent") return "청구서를 보냈다";
  if (o.status === "cancelled") return "청구를 지웠다";
  return "바꿨다";
}
