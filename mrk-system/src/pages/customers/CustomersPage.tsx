import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import { LEASE_STATUS, INQUIRY_STAGE } from "@/lib/codes";
import { fmt, maskName, maskPhone, timeLabel } from "@/lib/format";
import { Badge, Button, DataTable, EmptyState, ErrorBox, KeyValue, LinkButton, Loading, PageHeader, SearchBox, Segmented, Sheet, type Column } from "@/components/ui";
import { useParam } from "@/pages/units/shared";
import { STAGE_TONE, type CustomerDetail, type CustomerRow, type CustomerStage } from "./model";

const STAGES: CustomerStage[] = ["문의 중", "계약 중", "거주 중", "지난 고객", "결렬"];
const PAGE = 100;

export default function CustomersPage() {
  const { branchId, today } = useBranch();
  const [sp, set] = useParam();
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [reveal, setReveal] = useState(false);
  const kind = sp.get("kind") ?? "all";
  const stage = sp.get("stage") ?? "all";
  const data = useApi<CustomerRow[]>(["customers", branchId], `/api/customers?branch_id=${branchId}`);
  const all = data.data ?? [];

  const byKind = useMemo(() => all.filter((c) => kind === "all" || c.kind === kind), [all, kind]);
  const stageCounts = useMemo(() => {
    const m: Partial<Record<CustomerStage, number>> = {};
    for (const c of byKind) m[c.stage] = (m[c.stage] ?? 0) + 1;
    return m;
  }, [byKind]);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const d = s.replace(/\D/g, "");
    return byKind
      .filter((c) => stage === "all" || c.stage === stage)
      .filter((c) => !s || c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s) || (c.contact_name ?? "").toLowerCase().includes(s) || (d.length >= 3 && c.phone.replace(/\D/g, "").includes(d)));
  }, [byKind, stage, q]);

  const peekId = sp.get("customer");
  const peekRow = peekId ? all.find((c) => c.id === peekId) ?? null : null;
  const many = branchId === "all";
  const nm = (n: string) => (reveal ? n : maskName(n));

  const columns: Column<CustomerRow>[] = [
    {
      id: "name",
      header: "이름",
      sort: (c) => c.name,
      cell: (c) => (
        <div className="flex flex-col">
          <span className="font-medium">{c.kind === "corporation" ? c.name : nm(c.name)}</span>
          {c.contact_name && <span className="text-xs text-ink3">담당 {nm(c.contact_name)}</span>}
        </div>
      ),
    },
    { id: "kind", header: "종류", cell: (c) => (c.kind === "corporation" ? <Badge tone="navy" dot={false}>법인</Badge> : <span className="text-ink2">개인</span>), hideOnMobile: true },
    { id: "stage", header: "단계", sort: (c) => STAGES.indexOf(c.stage), cell: (c) => <Badge tone={STAGE_TONE[c.stage]}>{c.stage}</Badge> },
    { id: "role", header: "역할", sort: (c) => c.role, cell: (c) => <span className="text-ink2">{c.role}</span>, hideOnMobile: true },
    {
      id: "contact",
      header: "연락처",
      cell: (c) => (
        <div className="flex flex-col">
          <span className="num whitespace-nowrap">{c.phone ? (reveal ? c.phone : maskPhone(c.phone)) : "—"}</span>
          <span className="max-w-[220px] truncate text-xs text-ink3">{c.email ? (reveal ? c.email : c.email.replace(/^(.{2}).*(@.*)$/, "$1***$2")) : ""}</span>
        </div>
      ),
    },
    ...(many ? [{ id: "branch", header: "지점", sort: (c: CustomerRow) => c.branch_name ?? "", cell: (c: CustomerRow) => c.branch_name ?? <span className="text-ink3">지점 미정</span>, hideOnMobile: true } as Column<CustomerRow>] : []),
    { id: "last", header: "최근 활동", sort: (c) => c.last_activity_at, cell: (c) => <span className="num whitespace-nowrap text-ink2">{fmt(c.last_activity_at, "yy.M.d")}</span> },
    {
      id: "keep",
      header: "보존 기한",
      sort: (c) => c.retention.until ?? "9999",
      hideOnMobile: true,
      cell: (c) =>
        c.retention.until ? (
          <span className={c.retention.until < today ? "text-bad" : "text-ink2"} title={c.retention.reason}>
            {c.retention.until < today ? "기한 지남" : fmt(c.retention.until, "yyyy.M.d")}
          </span>
        ) : (
          <span className="text-xs text-ink3">{c.retention.reason}</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="고객"
        subtitle={data.data ? `${all.length.toLocaleString("ko-KR")}명 · 문의를 접수하면 문의자가 고객으로 생긴다` : undefined}
        actions={
          <Button icon={reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={() => setReveal((r) => !r)}>
            {reveal ? "개인정보 가리기" : "개인정보 보기"}
          </Button>
        }
      >
        <Segmented
          value={kind}
          onChange={(v) => set("kind", v === "all" ? null : v)}
          options={[
            { value: "all", label: "전체" },
            { value: "individual", label: "개인" },
            { value: "corporation", label: "법인" },
          ]}
        />
        <Segmented
          size="sm"
          value={stage}
          onChange={(v) => (set("stage", v === "all" ? null : v), setShown(PAGE))}
          options={[{ value: "all", label: "전체", count: byKind.length }, ...STAGES.filter((s) => stageCounts[s]).map((s) => ({ value: s, label: s, count: stageCounts[s] }))]}
        />
        <SearchBox id="customer-search" value={q} onChange={(v) => (setQ(v), setShown(PAGE))} placeholder="이름, 전화, 이메일" />
      </PageHeader>

      {data.isLoading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox error={data.error} />
      ) : all.length === 0 ? (
        <EmptyState title="아직 고객이 없다" body="문의를 접수하면 문의자가 고객으로 생긴다" action={<LinkButton to="/inquiries?new=1">입주문의 접수</LinkButton>} />
      ) : (
        <div className="flex flex-col gap-3">
          <DataTable
            rows={rows.slice(0, shown)}
            columns={columns}
            rowKey={(c) => c.id}
            onRowClick={(c) => set("customer", c.id)}
            selectedKey={peekId}
            empty={
              <div className="flex flex-col items-center gap-2">
                조건에 맞는 고객이 없다
                <Button size="sm" onClick={() => (setQ(""), set({ stage: null, kind: null }))}>
                  조건 초기화
                </Button>
              </div>
            }
          />
          {rows.length > shown && (
            <div className="flex justify-center">
              <Button onClick={() => setShown((n) => n + PAGE)}>
                더 보기 ({shown.toLocaleString("ko-KR")} / {rows.length.toLocaleString("ko-KR")})
              </Button>
            </div>
          )}
        </div>
      )}

      <Sheet open={!!peekRow} onClose={() => set("customer", null)} title={peekRow ? `${peekRow.name} 고객` : ""} subtitle={peekRow ? `${peekRow.stage} · ${peekRow.role}` : undefined}>
        {peekRow && <CustomerPeek id={peekRow.id} />}
      </Sheet>
    </>
  );
}

function CustomerPeek({ id }: { id: string }) {
  const q = useApi<CustomerDetail>(["customers", "detail", id], `/api/customers/${id}`);
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const c = q.data;
  return (
    <div className="flex flex-col gap-5">
      <KeyValue
        items={[
          ["전화", c.phone || "—"],
          ["이메일", c.email || "—"],
          ["지점", c.branch_name ?? "지점 미정"],
          ["최근 활동", timeLabel(c.last_activity_at)],
        ]}
      />
      <div className="flex flex-col gap-2">
        <div className="label-caps">계약 {c.leases.length}</div>
        {c.leases.slice(0, 4).map((l) => (
          <Link key={l.id} to={`/leases/${l.id}`} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm hover:bg-sunken">
            <span>
              <b>{l.unit_code}호</b> · {fmt(l.start_date, "yy.M.d")}~{fmt(l.end_date, "yy.M.d")} <span className="text-xs text-ink3">{l.as}</span>
            </span>
            <Badge tone={LEASE_STATUS[l.status].tone}>{LEASE_STATUS[l.status].label}</Badge>
          </Link>
        ))}
        {c.leases.length === 0 && <p className="text-sm text-ink3">계약이 없다</p>}
      </div>
      <div className="flex flex-col gap-2">
        <div className="label-caps">상담 {c.inquiries.length}</div>
        {c.inquiries.slice(0, 4).map((i) => (
          <Link key={i.id} to={`/inquiries/${i.id}`} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm hover:bg-sunken">
            <span className="min-w-0 truncate">
              {fmt(i.created_at, "yy.M.d")} · {i.message || (i.kind === "life" ? "생활문의" : "입주문의")}
            </span>
            <Badge tone={INQUIRY_STAGE[i.stage].tone}>{i.kind === "life" ? (i.closed_at ? "완료" : "진행 중") : INQUIRY_STAGE[i.stage].label}</Badge>
          </Link>
        ))}
        {c.inquiries.length === 0 && <p className="text-sm text-ink3">상담이 없다</p>}
      </div>
      <LinkButton to={`/customers/${c.id}`} variant="primary" icon={<ArrowRight className="size-4" />}>
        고객 자세히
      </LinkButton>
    </div>
  );
}
