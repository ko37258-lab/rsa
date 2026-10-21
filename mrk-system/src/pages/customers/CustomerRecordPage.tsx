import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, ShieldOff } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { INQUIRY_STAGE, LEASE_STATUS, NATIONALITY } from "@/lib/codes";
import { fmt, timeLabel, won } from "@/lib/format";
import { Badge, Button, DataTable, Dialog, ErrorBox, Field, FormGrid, Input, KeyValue, Loading, Section, Select, Textarea, type Column } from "@/components/ui";
import { MemosSection, HistoryList } from "@/components/RecordParts";
import { STAGE_TONE, type CustomerDetail, type CustomerInquirySummary, type CustomerLeaseSummary } from "./model";

export default function CustomerRecordPage() {
  const { customerId = "" } = useParams();
  const nav = useNavigate();
  const { today } = useBranch();
  const q = useApi<CustomerDetail>(["customers", "detail", customerId], `/api/customers/${customerId}`);
  const [edit, setEdit] = useState(false);

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const c = q.data;
  const corp = c.kind === "corporation";

  const leaseCols: Column<CustomerLeaseSummary>[] = [
    { id: "unit", header: "호실", sort: (l) => l.unit_code, cell: (l) => <span className="font-medium">{l.unit_code}호</span> },
    { id: "branch", header: "지점", cell: (l) => l.branch_name, hideOnMobile: true },
    { id: "period", header: "기간", sort: (l) => l.start_date, cell: (l) => <span className="num whitespace-nowrap">{fmt(l.start_date, "yy.M.d")} ~ {fmt(l.end_date, "yy.M.d")}</span> },
    { id: "rent", header: "월세", align: "right", sort: (l) => l.rent, cell: (l) => won(l.rent) },
    { id: "as", header: "역할", cell: (l) => <span className="text-ink2">{l.as}</span>, hideOnMobile: true },
    { id: "status", header: "상태", cell: (l) => <Badge tone={LEASE_STATUS[l.status].tone}>{LEASE_STATUS[l.status].label}</Badge> },
  ];
  const inqCols: Column<CustomerInquirySummary>[] = [
    { id: "at", header: "접수", sort: (i) => i.created_at, cell: (i) => <span className="num whitespace-nowrap">{timeLabel(i.created_at)}</span> },
    { id: "kind", header: "구분", cell: (i) => (i.kind === "life" ? "생활문의" : "입주문의") },
    { id: "msg", header: "문의 내용", cell: (i) => <span className="line-clamp-1 max-w-[320px] text-ink2">{i.message || "—"}</span> },
    { id: "branch", header: "지점", cell: (i) => i.branch_name ?? <span className="text-ink3">지점 미정</span>, hideOnMobile: true },
    {
      id: "stage",
      header: "단계",
      cell: (i) => (i.kind === "life" ? <Badge tone={i.closed_at ? "neutral" : "info"}>{i.closed_at ? "완료" : "진행 중"}</Badge> : <Badge tone={INQUIRY_STAGE[i.stage].tone}>{INQUIRY_STAGE[i.stage].label}</Badge>),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => nav(-1)} className="inline-flex w-fit items-center gap-1 text-sm text-ink3 hover:text-ink">
          <ArrowLeft className="size-4" /> 고객
        </button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight">{c.name}</h1>
              {corp && <Badge tone="navy" dot={false}>법인</Badge>}
              <Badge tone={STAGE_TONE[c.stage]}>{c.stage}</Badge>
              <span className="text-sm text-ink3">{c.role}</span>
            </div>
            <p className="mt-1 text-sm text-ink3">
              {c.branch_name ?? "지점 미정"} · 문의 {c.inquiry_count}건 · 계약 {c.lease_count}건 · 최근 활동 {timeLabel(c.last_activity_at)}
            </p>
          </div>
          <Button icon={<Pencil className="size-4" />} onClick={() => setEdit(true)}>
            정보 고치기
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="기본 정보">
            <KeyValue
              items={[
                ...(corp ? ([["담당자", c.contact_name ?? "—"]] as Array<[string, string]>) : []),
                ["전화", c.phone || "—"],
                ["이메일", c.email || "—"],
                ["국적", NATIONALITY[c.nationality] ?? (c.nationality || "—")],
                ...(!corp ? ([["성별", c.gender === "F" ? "여" : c.gender === "M" ? "남" : "—"]] as Array<[string, string]>) : []),
                ["환불 계좌", c.bank_account ?? "없음"],
                ["고객이 된 날", fmt(c.created_at)],
                ["보존 기한", c.retention.until ? `${fmt(c.retention.until)}${c.retention.until < today ? " · 기한 지남" : ""} (${c.retention.reason})` : c.retention.reason],
              ]}
            />
          </Section>
          <Section title={`계약 ${c.leases.length}`}>
            <DataTable rows={c.leases} columns={leaseCols} rowKey={(l) => l.id} onRowClick={(l) => nav(`/leases/${l.id}`)} empty="계약이 없다" dense />
          </Section>
          <Section title={`상담 ${c.inquiries.length}`}>
            <DataTable rows={c.inquiries} columns={inqCols} rowKey={(i) => i.id} onRowClick={(i) => nav(`/inquiries/${i.id}`)} empty="상담이 없다" dense />
          </Section>
        </div>
        <aside className="flex min-w-0 flex-col gap-5">
          <PrivacySection c={c} today={today} />
          <Section title="메모" hint="팀만 본다">
            <MemosSection kinds="customers" id={c.id} />
          </Section>
          <Section title="이력">
            <HistoryList kinds="customers" id={c.id} />
          </Section>
        </aside>
      </div>

      <EditDialog open={edit} onClose={() => setEdit(false)} c={c} />
    </div>
  );
}

function EditDialog({ open, onClose, c }: { open: boolean; onClose: () => void; c: CustomerDetail }) {
  const [f, setF] = useState({ name: "", contact_name: "", phone: "", email: "", nationality: "KR", bank_account: "" });
  useEffect(() => {
    if (open) setF({ name: c.name, contact_name: c.contact_name ?? "", phone: c.phone, email: c.email, nationality: c.nationality || "KR", bank_account: c.bank_account ?? "" });
  }, [open, c]);
  const save = useApiMutation({ invalidate: [["customers"], ["inquiries"], ["leases"]], success: "고객 정보를 고쳤다", onSuccess: onClose });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const corp = c.kind === "corporation";
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="고객 정보 고치기"
      description="고친 내용은 이 고객의 모든 계약·청구서에 같이 쓰인다"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            disabled={!f.name.trim()}
            loading={save.isPending}
            onClick={() => save.mutate({ path: `/api/customers/${c.id}`, method: "PATCH", body: { ...f, contact_name: corp ? f.contact_name : undefined } })}
          >
            저장
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <FormGrid>
          <Field label={corp ? "회사명" : "이름"} htmlFor="cu-name">
            <Input id="cu-name" value={f.name} onChange={up("name")} />
          </Field>
          {corp && (
            <Field label="담당자" htmlFor="cu-contact">
              <Input id="cu-contact" value={f.contact_name} onChange={up("contact_name")} />
            </Field>
          )}
          <Field label="전화" htmlFor="cu-phone">
            <Input id="cu-phone" inputMode="tel" value={f.phone} onChange={up("phone")} />
          </Field>
          <Field label="이메일" htmlFor="cu-email">
            <Input id="cu-email" type="email" value={f.email} onChange={up("email")} />
          </Field>
          <Field label="국적" htmlFor="cu-nat">
            <Select id="cu-nat" value={f.nationality} onChange={up("nationality")} options={Object.entries(NATIONALITY).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="환불 계좌" htmlFor="cu-bank" hint="퇴실 정산 때 보증금을 돌려줄 계좌">
            <Input id="cu-bank" value={f.bank_account} onChange={up("bank_account")} placeholder="예: 국민 123-45-678901" />
          </Field>
        </FormGrid>
      </form>
    </Dialog>
  );
}

/**
 * 개인정보 — 보존 기한을 정하고, 기한이 지나면 파기한다.
 * 진행 중인 계약·상담이 있으면 파기할 수 없고, 기한 전에 파기하려면 사유를 적는다.
 */
function PrivacySection({ c, today }: { c: CustomerDetail; today: string }) {
  const [until, setUntil] = useState(c.retention_until ?? c.retention.until ?? "");
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => setUntil(c.retention_until ?? c.retention.until ?? ""), [c.retention_until, c.retention.until]);
  const inv = [["customers"], ["inquiries"]];
  const save = useApiMutation({ invalidate: inv, success: "보존 기한을 정했다" });
  const wipe = useApiMutation({
    invalidate: inv,
    success: "개인정보를 파기했다",
    onSuccess: () => {
      setConfirming(false);
      setReason("");
    },
  });
  const wiped = c.name.startsWith("파기된 고객");
  const busy = c.stage === "거주 중" || c.stage === "계약 중" || c.stage === "문의 중";
  const due = !!c.retention.until && c.retention.until <= today;
  return (
    <Section title="개인정보" hint="보존 기한이 지나면 이름·연락처·계좌를 지운다. 계약·청구 기록(금액)은 남는다">
      {wiped ? (
        <p className="text-sm text-ink3">이미 파기한 고객이다</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-sm">
            <span className="text-xs text-ink3">보존 기한 </span>
            {c.retention.until ? (
              <b className={due ? "text-bad" : undefined}>
                {fmt(c.retention.until)}
                {due && " · 지남"}
              </b>
            ) : (
              <b>없음</b>
            )}
            <span className="ml-1 text-xs text-ink3">({c.retention.reason})</span>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate({ path: `/api/customers/${c.id}`, method: "PATCH", body: { retention_until: until || null } });
            }}
          >
            <Field label="보존 기한 정하기" htmlFor="retention-until" className="w-44">
              <Input id="retention-until" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
            <Button type="submit" size="sm" loading={save.isPending}>
              저장
            </Button>
          </form>
          {!confirming ? (
            <Button variant="danger" size="sm" icon={<ShieldOff className="size-3.5" />} disabled={busy} title={busy ? `${c.stage}인 고객은 파기할 수 없다` : undefined} onClick={() => setConfirming(true)}>
              개인정보 파기
            </Button>
          ) : null}
          {busy && !confirming && <p className="text-xs text-ink3">{c.stage}인 고객이라 지금은 파기할 수 없다</p>}
          {!confirming ? null : (
            <div className="flex flex-col gap-2 rounded-md border border-bad/40 bg-bad/5 p-3">
              <p className="text-sm font-medium text-bad">이름·전화·메일·계좌를 지우고 되돌릴 수 없다</p>
              <p className="text-xs text-ink2">대화 내용 속 연락처도 가린다. 계약·청구 금액 기록은 남는다.</p>
              {!due && (
                <Field label="기한 전에 파기하는 사유" htmlFor="wipe-reason" hint="예: 본인 요청(10/21 전화)">
                  <Textarea id="wipe-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                </Field>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => setConfirming(false)}>
                  취소
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={!due && reason.trim().length < 2}
                  loading={wipe.isPending}
                  onClick={() => wipe.mutate({ path: `/api/customers/${c.id}/anonymize`, body: due ? {} : { force: true, reason: reason.trim() } })}
                >
                  파기 확정
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
