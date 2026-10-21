import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, FileUp, Pencil, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx, dDay, fmt, timeLabel, won } from "@/lib/format";
import { CHARGE_KIND, INQUIRY_STAGE, LEASE_STATUS, VAT_MODE } from "@/lib/codes";
import { daysBetween } from "@/lib/dates";
import {
  Badge, Button, CodeBadge, DataTable, Dialog, EmptyState, ErrorBox, Field, FormGrid, Input, KeyValue, LinkButton, Loading, Money, MoneyInput, Section, Segmented, Select, StatTile, Tabs, Textarea, type Column,
} from "@/components/ui";
import { HistoryList, MemosSection } from "@/components/RecordParts";
import type { BillingCycle, BillingMode, LeaseDiscount, LeaseStatus, MgmtMode, VatMode } from "@/types";
import { MONEY_KEYS, type LeaseDetail, type LeaseLedger, type LedgerCharge } from "./types";
import { LeaseStatusBadge, leaseNote, termLabel } from "./parts";
import { SettlementPanel } from "./SettlementPanel";
import { LeaseCreateDialog } from "./LeaseCreateDialog";
import { ConversationsTab, GapsSection, PartiesSection, SignRequestDialog, SignedCopies, SignedCopyDialog } from "./record-parts";
import { DirectChargeDialog } from "@/pages/billing/DirectChargeDialog";

type Tab = "terms" | "money" | "talk" | "settle" | "memo" | "history";
const TABS: Tab[] = ["terms", "money", "talk", "settle", "memo", "history"];

export default function LeaseRecordPage() {
  const { leaseId = "" } = useParams();
  const [sp, setSp] = useSearchParams();
  const { today } = useBranch();
  const q = useApi<LeaseDetail>(["leases", "detail", leaseId], `/api/leases/${leaseId}`);
  const tab = (TABS.includes(sp.get("tab") as Tab) ? sp.get("tab") : "terms") as Tab;
  const setTab = (t: Tab) => setSp((p) => { const n = new URLSearchParams(p); t === "terms" ? n.delete("tab") : n.set("tab", t); return n; }, { replace: true });
  const [move, setMove] = useState<{ to: LeaseStatus; label: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [signing, setSigning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renewing, setRenewing] = useState(false);

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} />;
  const l = q.data;
  const note = leaseNote(l, today);
  const last = l.move_out_date && l.move_out_date < l.end_date ? l.move_out_date : l.end_date;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Link to="/leases" className="inline-flex items-center gap-1 text-xs font-medium text-ink3 hover:text-ink">
          <ArrowLeft className="size-3.5" />
          계약 목록
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight">
                {l.unit_code}호 계약 · {l.contractor?.name}
              </h1>
              <LeaseStatusBadge status={l.status} />
              {l.renewal_of && <Badge tone="brass" dot={false}>재계약</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink3">
              {l.branch_name} · {l.unit_type_name ?? "룸타입 없음"} · {fmt(l.start_date)} ~ {fmt(l.end_date)} ({termLabel(l.start_date, l.end_date)})
              {note ? ` · ${note}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton to={`/print/lease/${l.id}`} icon={<FileText className="size-3.5" />}>
              계약서 보기·인쇄
            </LinkButton>
            {["draft", "awaiting_signature", "concluded", "move_in_confirmed"].includes(l.status) && (
              <Button icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                고치기
              </Button>
            )}
            {(l.status === "draft" || l.status === "awaiting_signature") && (
              <Button icon={<Send className="size-3.5" />} variant={l.status === "draft" ? "primary" : "secondary"} onClick={() => setSigning(true)}>
                {l.status === "draft" ? "서명 요청" : "서명 안내 다시 복사"}
              </Button>
            )}
            {l.status === "awaiting_signature" && (
              <Button icon={<FileUp className="size-3.5" />} variant="primary" onClick={() => setUploading(true)}>
                서명본 올리기
              </Button>
            )}
            {(l.status === "occupied" || l.status === "closing") && !l.renewal_lease && (
              <Button icon={<RefreshCw className="size-3.5" />} onClick={() => setRenewing(true)}>
                연장 계약 작성
              </Button>
            )}
            {l.flow
              .filter((f) => !(l.status === "draft" && f.to === "awaiting_signature"))
              .map((f) => (
                <Button key={f.to} variant={f.to === "cancelled" ? "danger" : "primary"} onClick={() => setMove(f)}>
                  {f.label}
                </Button>
              ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatTile label="월세 · 관리비" value={Math.round((l.rent + l.mgmt_fee) / 1000).toLocaleString("ko-KR")} unit="천원" note={`월세 ${won(l.rent)} · 관리비 ${won(l.mgmt_fee)}${l.vat === "excluded" ? " · 부가세 별도" : ""}`} />
        <StatTile label="미납" value={l.money.overdue.toLocaleString("ko-KR")} unit="원" tone={l.money.overdue > 0 ? "bad" : undefined} note={l.money.upcoming > 0 ? `납기 전 ${won(l.money.upcoming)}` : "납기 지난 돈 기준"} />
        <StatTile label="받아 둔 보증금" value={l.money.deposit_held.toLocaleString("ko-KR")} unit="원" note={`약정 ${won(l.deposit + l.mgmt_deposit)}`} />
        <StatTile
          label={["closing", "closed", "cancelled"].includes(l.status) ? "퇴실일" : "만료까지"}
          value={["closing", "closed", "cancelled"].includes(l.status) ? fmt(last, "M.d") : dDay(l.end_date, today)}
          note={["closing", "closed", "cancelled"].includes(l.status) ? fmt(last) : `${fmt(l.end_date)} 만료`}
          tone={l.status === "occupied" && daysBetween(today, l.end_date) <= 30 ? "warn" : undefined}
        />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "terms", label: "계약" },
          { value: "money", label: "청구·수납" },
          { value: "talk", label: "대화" },
          { value: "settle", label: "정산" },
          { value: "memo", label: "메모" },
          { value: "history", label: "이력" },
        ]}
      />

      {tab === "terms" && <TermsTab l={l} onUpload={() => setUploading(true)} />}
      {tab === "money" && <MoneyTab leaseId={l.id} today={today} />}
      {tab === "talk" && <ConversationsTab lease={l} />}
      {tab === "settle" &&
        (["occupied", "closing", "closed"].includes(l.status) ? (
          <Section title="퇴실 정산" hint="받아 둔 보증금에서 미납과 차감을 빼고 남은 돈을 돌려준다">
            <SettlementPanel leaseId={l.id} leaseStatus={l.status} />
          </Section>
        ) : (
          <EmptyState title="아직 정산할 때가 아니다" body="입주한 뒤 퇴실할 때 보증금을 정산한다" />
        ))}
      {tab === "memo" && (
        <Section title="내부 메모">
          <MemosSection kinds="leases" id={l.id} />
        </Section>
      )}
      {tab === "history" && (
        <Section title="이력">
          <HistoryList kinds="leases" id={l.id} />
        </Section>
      )}

      {move && <TransitionDialog lease={l} move={move} onClose={() => setMove(null)} />}
      {editing && <EditDialog lease={l} onClose={() => setEditing(false)} />}
      {signing && <SignRequestDialog lease={l} onClose={() => setSigning(false)} />}
      {uploading && <SignedCopyDialog lease={l} onClose={() => setUploading(false)} />}
      {renewing && <LeaseCreateDialog open onClose={() => setRenewing(false)} initial={{ renewOf: l.id }} />}
    </div>
  );
}

function TermsTab({ l, onUpload }: { l: LeaseDetail; onUpload: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="기간 · 입주">
        <KeyValue
          items={[
            ["시작일", fmt(l.start_date)],
            ["만료일", fmt(l.end_date)],
            ["입주일", l.move_in_date ? fmt(l.move_in_date) : "정하지 않음"],
            ["퇴실일", l.move_out_date ? fmt(l.move_out_date) : "—"],
            ["작성 · 서명", `${timeLabel(l.created_at)} · ${l.signed_at ? timeLabel(l.signed_at) : "서명 전"}`],
            ["기간", termLabel(l.start_date, l.end_date)],
          ]}
        />
      </Section>
      <Section title="금액">
        <KeyValue
          items={[
            ["월세", <span key="r">{won(l.rent)}{l.list_rent !== l.rent && <span className="ml-1.5 text-xs text-ink3">정가 {won(l.list_rent)}</span>}</span>],
            ["관리비", l.mgmt_mode === "bill" ? "고지서 금액(매달)" : won(l.mgmt_fee)],
            ["보증금", `${won(l.deposit)}${l.renewal_of ? " (이어받음)" : ""}`],
            ["관리비 보증금", won(l.mgmt_deposit)],
            ["계약금", l.renewal_of ? "재계약이라 없음" : won(l.contract_fee)],
            ["선납임대료", won(l.prepaid_rent)],
            ["퇴실청소비", won(l.cleaning_fee)],
            ["부가세", VAT_MODE[l.vat]],
          ]}
        />
      </Section>
      <Section title="청구 방식" hint={l.billing_summary}>
        <KeyValue
          items={[
            ["주기", l.cycle === "calendar" ? `달력 월 · 매월 ${l.due_day}일 청구` : `입주일 기준 · 매월 ${l.due_day}일`],
            ["선불 · 후불", l.billing_mode === "prepaid" ? "선불 — 그 달치를 직전 청구일에" : "후불 — 지난 달치를 다음 청구일에"],
            ["일할", l.prorate ? "첫 달·마지막 달 실제 일수로" : "일할 안 함"],
            ["납기", l.due_days ? `청구일부터 ${l.due_days}일` : "청구일이 납기"],
            ["관리비", l.mgmt_mode === "bill" ? "고지서(늘 후불)" : "고정 금액"],
            ["할인", l.discounts.length ? l.discounts.map((d) => `${d.label} 월 ${won(d.amount)}${d.months ? ` · 앞 ${d.months}달` : " · 전 기간"}`).join(" / ") : "없음"],
          ]}
        />
        {l.rent_cap && (
          <div className={cx("mt-4 rounded border px-3 py-2 text-xs", l.rent_cap.exceeds ? "border-warn/50 bg-warn/10 text-warn" : "border-line bg-sunken/60 text-ink2")}>
            <div className="font-medium">{l.rent_cap.text}</div>
            <div className="mt-0.5">
              앞 계약 월세 {won(l.rent_cap.prev_rent)} → 이 계약 {won(l.rent)}
              {l.rent_cap.exceeds ? " · 상한을 넘었다(사유는 메모에)" : ""}
            </div>
          </div>
        )}
      </Section>
      <PartiesSection lease={l} />
      <Section title="연결">
        <KeyValue
          items={[
            ["호실", l.unit ? <Link key="u" to={`/units/${l.unit.id}`} className="hover:underline">{l.unit.code}호 · {l.unit.area_m2}㎡{l.unit.facing ? ` · ${l.unit.facing}향` : ""}</Link> : "—"],
            ["담당", l.assignee?.name ?? "담당 없음"],
            ["유입경로", l.source_group || "—"],
            ["상담", l.inquiry ? <Link key="i" to={`/inquiries/${l.inquiry.id}`} className="inline-flex items-center gap-1.5 hover:underline">{fmt(l.inquiry.created_at)} 접수 <CodeBadge code={INQUIRY_STAGE[l.inquiry.stage as keyof typeof INQUIRY_STAGE]} /></Link> : "직접 작성"],
            ["앞 계약", l.renewal_of_lease ? <Link key="pr" to={`/leases/${l.renewal_of_lease.id}`} className="hover:underline">{fmt(l.renewal_of_lease.start_date)} ~ {fmt(l.renewal_of_lease.end_date)}</Link> : "—"],
            ["재계약", l.renewal_lease ? <Link key="rn" to={`/leases/${l.renewal_lease.id}`} className="hover:underline">{fmt(l.renewal_lease.start_date)}부터 월 {won(l.renewal_lease.rent)} ({LEASE_STATUS[l.renewal_lease.status].label})</Link> : "—"],
            ["다음 계약", l.next_lease && l.next_lease.id !== l.renewal_lease?.id ? <Link key="nx" to={`/leases/${l.next_lease.id}`} className="hover:underline">{l.next_lease.contractor?.name} · {fmt(l.next_lease.start_date)}부터 ({LEASE_STATUS[l.next_lease.status].label})</Link> : "—"],
          ]}
        />
        {l.memo && <p className="mt-4 whitespace-pre-wrap rounded border border-line bg-sunken/60 px-3 py-2 text-sm text-ink2">{l.memo}</p>}
      </Section>
      <SignedCopies lease={l} onUpload={onUpload} />
    </div>
  );
}

const STATUS_CHIP: Record<string, { label: string; tone: "neutral" | "warn" | "good" | "bad" | "info" }> = {
  draft: { label: "발송 대기", tone: "warn" },
  scheduled: { label: "발송 예약", tone: "info" },
  sent: { label: "발송 완료", tone: "neutral" },
  cancelled: { label: "취소", tone: "neutral" },
};

function MoneyTab({ leaseId, today }: { leaseId: string; today: string }) {
  const q = useApi<LeaseLedger>(["leases", "ledger", leaseId], `/api/leases/${leaseId}/ledger`);
  const [charge, setCharge] = useState(false);
  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <ErrorBox error={q.error} />;
  const { charges, payments, totals } = q.data;
  const columns: Column<LedgerCharge>[] = [
    {
      id: "due",
      header: "청구일 · 납기",
      sort: (c) => c.due_date,
      cell: (c) => (
        <div className="whitespace-nowrap">
          <div>{fmt(c.bill_date ?? c.due_date, "yy.M.d")}</div>
          {c.bill_date && c.bill_date !== c.due_date && <div className="text-xs text-ink3">납기 {fmt(c.due_date, "M.d")}</div>}
        </div>
      ),
    },
    { id: "kind", header: "종류", cell: (c) => <span className="text-ink2">{CHARGE_KIND[c.kind]}</span> },
    {
      id: "label",
      header: "항목",
      cell: (c) => (
        <div>
          <div className={cx(c.status === "cancelled" && "text-ink3 line-through")}>{c.label}</div>
          {c.period_from && (
            <div className="text-xs text-ink3">
              {fmt(c.period_from, "M.d")} ~ {fmt(c.period_to, "M.d")} 사용{c.days ? ` · 일할 ${c.days}일/${c.month_days}일` : ""}
            </div>
          )}
        </div>
      ),
    },
    { id: "amount", header: "청구", align: "right", cell: (c) => <Money value={c.amount} muted={c.status === "cancelled"} /> },
    { id: "paid", header: "받음", align: "right", cell: (c) => <Money value={c.paid} muted={!c.paid} /> },
    {
      id: "left",
      header: "남음",
      align: "right",
      cell: (c) => (c.left > 0 ? <span className={cx("num font-semibold", c.overdue ? "text-bad" : "text-ink")}>{c.left.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>),
    },
    {
      id: "state",
      header: "상태",
      cell: (c) => {
        if (c.status === "draft" && c.needs_amount) return <Badge tone="warn">고지서 금액 필요</Badge>;
        if (c.status !== "sent") return <Badge tone={STATUS_CHIP[c.status].tone}>{STATUS_CHIP[c.status].label}</Badge>;
        if (c.left <= 0) return <Badge tone="good">다 받음</Badge>;
        return c.due_date < today ? <Badge tone="bad">연체 {daysBetween(c.due_date, today)}일</Badge> : <Badge tone="info">납기 전</Badge>;
      },
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <StatTile label="보낸 청구" value={totals.billed.toLocaleString("ko-KR")} unit="원" />
        <StatTile label="받은 돈" value={totals.paid.toLocaleString("ko-KR")} unit="원" />
        <StatTile label="연체" value={totals.overdue.toLocaleString("ko-KR")} unit="원" tone={totals.overdue > 0 ? "bad" : undefined} />
        <StatTile label="납기 전" value={totals.upcoming.toLocaleString("ko-KR")} unit="원" />
        <StatTile label="발송 대기" value={totals.draft.toLocaleString("ko-KR")} unit="원" tone={totals.draft > 0 ? "warn" : undefined} note={totals.needs_amount ? `고지서 금액 필요 ${totals.needs_amount}줄` : "청구 화면에서 확인·발송"} />
      </div>
      <GapsSection leaseId={leaseId} />
      <Section title="청구" actions={<Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setCharge(true)}>직접 청구</Button>} bodyClassName="p-0">
        <div className="p-3">
          <DataTable rows={charges} columns={columns} rowKey={(c) => c.id} dense empty="이 계약의 청구가 없다" initialSort={{ id: "due", dir: "desc" }} />
        </div>
      </Section>
      <Section title="받은 입금" hint="이 계약 청구에 채워진 입금. 한 입금이 여러 계약에 나뉘었으면 이 계약 몫만 센다" bodyClassName="p-0">
        <div className="p-3">
          <DataTable
            rows={payments}
            rowKey={(p) => p.id}
            dense
            empty="이 계약 청구를 채운 입금 기록이 없다"
            initialSort={{ id: "at", dir: "desc" }}
            columns={[
              { id: "at", header: "입금일", sort: (p) => p.received_at, cell: (p) => <span className="whitespace-nowrap">{timeLabel(p.received_at)}</span> },
              { id: "name", header: "입금자명", cell: (p) => p.depositor_name },
              { id: "how", header: "방식", cell: (p) => <span className="text-ink2">{p.memo === "보증금 차감" ? "보증금 차감" : p.method === "bank" ? "계좌 입금" : "직접 기록"}</span> },
              { id: "amount", header: "입금액", align: "right", cell: (p) => <Money value={p.amount} muted /> },
              { id: "to", header: "이 계약 몫", align: "right", cell: (p) => <Money value={p.to_this_lease} strong /> },
            ]}
          />
        </div>
      </Section>
      {charge && <DirectChargeDialog open leaseId={leaseId} onClose={() => setCharge(false)} />}
    </div>
  );
}

const NEEDS_DATE: Partial<Record<LeaseStatus, string>> = {
  move_in_confirmed: "입주일",
  occupied: "입주한 날",
  closing: "퇴실일",
};

function TransitionDialog({ lease: l, move, onClose }: { lease: LeaseDetail; move: { to: LeaseStatus; label: string }; onClose: () => void }) {
  const { today } = useBranch();
  const dateLabel = NEEDS_DATE[move.to];
  const [date, setDate] = useState(move.to === "closing" ? (l.end_date < today ? l.end_date : today) : l.move_in_date ?? l.start_date);
  const [reason, setReason] = useState("");
  const go = useApiMutation({ invalidate: MONEY_KEYS, success: `${LEASE_STATUS[move.to].label}(으)로 바꿨다`, onSuccess: onClose });
  const explain: Partial<Record<LeaseStatus, string>> = {
    awaiting_signature: "계약자에게 전자계약 서명 요청을 보낸다.",
    concluded: "서명을 받았다고 기록한다. 계약금·보증금 잔금과 이번 달까지 청구일이 오는 월세·관리비·할인이 발송 대기에 들어간다. 청구 화면에서 확인·발송한다.",
    move_in_confirmed: "입주 날짜를 확정한다.",
    occupied: "입주를 기록한다. 이제부터 점유로 센다.",
    closing: "퇴실을 기록하고 퇴실청소비를 청구한다. 그다음 정산 탭에서 보증금을 정산한다.",
    closed: l.renewal_lease && l.status === "occupied" ? "재계약이 시작됐으니 이 계약을 닫는다. 보증금은 재계약으로 넘어가 정산하지 않는다." : "정산을 마친 계약을 닫는다.",
    cancelled: "계약을 취소한다. 아직 안 보낸 청구는 같이 취소된다. 되돌릴 수 없다.",
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${l.unit_code}호 · ${move.label}`}
      description={explain[move.to]}
      footer={
        <>
          {go.error && <p className="mr-auto self-center text-xs text-bad">{go.error.message}</p>}
          <Button onClick={onClose}>그만두기</Button>
          <Button variant={move.to === "cancelled" ? "danger" : "primary"} loading={go.isPending} onClick={() => go.mutate({ path: `/api/leases/${l.id}/transition`, body: { to: move.to, date: dateLabel ? date : undefined, reason: reason || undefined } })}>
            {move.label}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm">
          <CodeBadge code={LEASE_STATUS[l.status]} />
          <span className="text-ink3">→</span>
          <CodeBadge code={LEASE_STATUS[move.to]} />
        </div>
        {dateLabel && (
          <Field label={dateLabel} htmlFor="tr-date" hint={move.to === "closing" && date < l.end_date ? `만료일(${fmt(l.end_date)})보다 일찍 나간다. 위약금이 있으면 직접 청구한다` : undefined}>
            <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        )}
        {(move.to === "cancelled" || move.to === "closing") && (
          <Field label="사유(이력에 남는다)" htmlFor="tr-reason">
            <Input id="tr-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={move.to === "cancelled" ? "예: 계약자 사정으로 취소" : "예: 회사 발령으로 조기 퇴실"} />
          </Field>
        )}
        {move.to === "closed" && l.status !== "occupied" && !(l.settlement && ["confirmed", "refunded"].includes(l.settlement.status)) && (
          <p className="rounded border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">아직 정산을 확정하지 않았다. 정산 탭에서 먼저 확정한다.</p>
        )}
      </div>
    </Dialog>
  );
}

function EditDialog({ lease: l, onClose }: { lease: LeaseDetail; onClose: () => void }) {
  const [f, setF] = useState({
    start_date: l.start_date,
    end_date: l.end_date,
    rent: l.rent as number | null,
    mgmt_fee: l.mgmt_fee as number | null,
    deposit: l.deposit as number | null,
    mgmt_deposit: l.mgmt_deposit as number | null,
    contract_fee: l.contract_fee as number | null,
    cleaning_fee: l.cleaning_fee as number | null,
    vat: l.vat as VatMode,
    cycle: l.cycle as BillingCycle,
    billing_mode: l.billing_mode as BillingMode,
    bill_day: (l.cycle === "calendar" ? l.due_day : l.terms?.bill_day ?? 1) as number | null,
    prorate: l.prorate,
    due_days: l.due_days as number | null,
    mgmt_mode: l.mgmt_mode as MgmtMode,
    move_in_date: l.move_in_date ?? "",
    memo: l.memo,
  });
  const [discounts, setDiscounts] = useState<Array<{ label: string; amount: number | null; months: string }>>(l.discounts.map((d: LeaseDiscount) => ({ label: d.label, amount: d.amount, months: d.months ? String(d.months) : "" })));
  const save = useApiMutation({ invalidate: MONEY_KEYS, success: "계약을 고쳤다", onSuccess: onClose });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = () =>
    save.mutate({
      path: `/api/leases/${l.id}`,
      method: "PATCH",
      body: {
        ...f,
        bill_day: f.cycle === "calendar" ? f.bill_day : undefined,
        due_days: f.due_days ?? 0,
        move_in_date: f.move_in_date || null,
        discounts: discounts.filter((d) => d.amount).map((d) => ({ label: d.label, amount: d.amount, months: d.months ? Number(d.months) : null })),
      },
    });
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={`${l.unit_code}호 계약 고치기`}
      description="입주 전까지만 금액·기간·청구 방식을 고칠 수 있다. 이미 만든 청구는 그대로 두니 필요하면 청구 화면에서 고친다."
      footer={
        <>
          {save.error && <p className="mr-auto self-center text-xs text-bad">{save.error.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            저장
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <FormGrid cols={3}>
          <Field label="시작일" htmlFor="ed-start">
            <Input id="ed-start" type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
          </Field>
          <Field label="만료일" htmlFor="ed-end">
            <Input id="ed-end" type="date" value={f.end_date} onChange={(e) => set("end_date", e.target.value)} />
          </Field>
          <Field label="입주일" htmlFor="ed-movein">
            <Input id="ed-movein" type="date" value={f.move_in_date} onChange={(e) => set("move_in_date", e.target.value)} />
          </Field>
          <Field label="월세" htmlFor="ed-rent">
            <MoneyInput id="ed-rent" value={f.rent} onChange={(v) => set("rent", v)} />
          </Field>
          <Field label="관리비" htmlFor="ed-mgmt">
            <MoneyInput id="ed-mgmt" value={f.mgmt_fee} onChange={(v) => set("mgmt_fee", v)} />
          </Field>
          <Field label="부가세" htmlFor="ed-vat">
            <Select id="ed-vat" value={f.vat} onChange={(e) => set("vat", e.target.value as VatMode)} options={Object.entries(VAT_MODE).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="보증금" htmlFor="ed-dep">
            <MoneyInput id="ed-dep" value={f.deposit} onChange={(v) => set("deposit", v)} />
          </Field>
          <Field label="관리비 보증금" htmlFor="ed-mdep">
            <MoneyInput id="ed-mdep" value={f.mgmt_deposit} onChange={(v) => set("mgmt_deposit", v)} />
          </Field>
          <Field label="계약금" htmlFor="ed-cfee">
            <MoneyInput id="ed-cfee" value={f.contract_fee} onChange={(v) => set("contract_fee", v)} />
          </Field>
          <Field label="퇴실청소비" htmlFor="ed-clean">
            <MoneyInput id="ed-clean" value={f.cleaning_fee} onChange={(v) => set("cleaning_fee", v)} />
          </Field>
        </FormGrid>
        <div className="flex flex-col gap-3">
          <div className="label-caps">청구 방식</div>
          <FormGrid>
            <Field label="주기">
              <Segmented<BillingCycle> size="sm" value={f.cycle} onChange={(v) => set("cycle", v)} options={[{ value: "anniversary", label: "입주일 기준" }, { value: "calendar", label: "달력 월 · 청구일" }]} />
            </Field>
            <Field label="선불 · 후불">
              <Segmented<BillingMode> size="sm" value={f.billing_mode} onChange={(v) => set("billing_mode", v)} options={[{ value: "prepaid", label: "선불" }, { value: "postpaid", label: "후불" }]} />
            </Field>
            {f.cycle === "calendar" && (
              <Field label="청구일(매월)" htmlFor="ed-billday">
                <Input id="ed-billday" type="number" min={1} max={31} value={f.bill_day ?? ""} onChange={(e) => set("bill_day", e.target.value === "" ? null : Number(e.target.value))} />
              </Field>
            )}
            <Field label="납기 일수" htmlFor="ed-duedays">
              <Input id="ed-duedays" type="number" min={0} max={60} value={f.due_days ?? ""} onChange={(e) => set("due_days", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
            <Field label="관리비">
              <Segmented<MgmtMode> size="sm" value={f.mgmt_mode} onChange={(v) => set("mgmt_mode", v)} options={[{ value: "fixed", label: "고정" }, { value: "bill", label: "고지서" }]} />
            </Field>
            <Field label="일할">
              <label className="flex h-9 items-center gap-2 text-sm text-ink2">
                <input id="ed-prorate" type="checkbox" checked={f.prorate} onChange={(e) => set("prorate", e.target.checked)} className="size-4 accent-[rgb(var(--navy))]" />
                첫 달·마지막 달 일할
              </label>
            </Field>
          </FormGrid>
          <div className="flex flex-col gap-2 rounded-md border border-line p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">할인</span>
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brass hover:underline" onClick={() => setDiscounts((d) => [...d, { label: "", amount: null, months: "1" }])}>
                <Plus className="size-3.5" />
                할인 더하기
              </button>
            </div>
            {discounts.length === 0 && <p className="text-xs text-ink3">할인 없음</p>}
            {discounts.map((d, i) => (
              <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_150px_140px_32px]">
                <Input id={`ed-dc-label-${i}`} aria-label="할인 이름" value={d.label} onChange={(e) => setDiscounts((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <MoneyInput id={`ed-dc-amt-${i}`} value={d.amount} onChange={(v) => setDiscounts((xs) => xs.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                <Select
                  id={`ed-dc-months-${i}`}
                  aria-label="할인 기간"
                  value={d.months}
                  onChange={(e) => setDiscounts((xs) => xs.map((x, j) => (j === i ? { ...x, months: e.target.value } : x)))}
                  options={[{ value: "", label: "전 기간" }, ...[1, 2, 3, 6, 12].map((m) => ({ value: String(m), label: `앞 ${m}달` }))]}
                />
                <button type="button" aria-label="할인 지우기" className="rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => setDiscounts((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <Field label="메모" htmlFor="ed-memo">
          <Textarea id="ed-memo" rows={2} value={f.memo} onChange={(e) => set("memo", e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
