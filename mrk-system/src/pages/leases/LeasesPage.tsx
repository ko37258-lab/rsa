import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FileSpreadsheet, Plus } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { dDay, downloadCsv, fmt, won } from "@/lib/format";
import { downloadXlsx } from "@/lib/excel";
import { NATIONALITY, LEASE_STATUS } from "@/lib/codes";
import {
  Button, DataTable, EmptyState, ErrorBox, KeyValue, LinkButton, Loading, Money, PageHeader, SearchBox, Segmented, Sheet, StatTile, type Column,
} from "@/components/ui";
import type { LeaseRow, RentRollRow } from "./types";
import { LEASE_FILTERS, LeaseStatusBadge, PartyName, billingSummary, filterOf, leaseNote, matchesFilter, termLabel, type LeaseFilter } from "./parts";
import { LeaseCreateDialog } from "./LeaseCreateDialog";

export default function LeasesPage() {
  const [sp, setSp] = useSearchParams();
  const { branchId, branch, today } = useBranch();
  const view = sp.get("view") === "rent-roll" ? "rent-roll" : "list";
  const filter = filterOf(sp.get("status"));
  const q = sp.get("q") ?? "";
  const peekId = sp.get("lease");
  const update = (patch: Record<string, string | null>) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) v === null || v === "" ? n.delete(k) : n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const rows = useApi<LeaseRow[]>(["leases", branchId, "list"], `/api/leases?branch_id=${branchId}`);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of LEASE_FILTERS) c[f.value] = (rows.data ?? []).filter((r) => matchesFilter(r.status, f.value)).length;
    return c;
  }, [rows.data]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/-/g, "");
    return (rows.data ?? [])
      .filter((r) => matchesFilter(r.status, filter))
      .filter((r) => {
        if (!needle) return true;
        const hay = [r.unit_code, r.contractor?.name, r.contractor?.phone, r.contractor?.email, r.payer?.name].join(" ").toLowerCase().replace(/-/g, "");
        return hay.includes(needle);
      });
  }, [rows.data, filter, q]);

  const peek = (rows.data ?? []).find((r) => r.id === peekId) ?? null;
  const showBranch = branchId === "all";

  const columns: Column<LeaseRow>[] = [
    {
      id: "unit",
      header: "호실",
      sort: (r) => r.unit_code.padStart(6, "0"),
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-semibold">{r.unit_code}호</div>
          <div className="truncate text-xs text-ink3">{showBranch ? r.branch_name.replace("MR.K ", "") + " · " : ""}{r.unit_type_name ?? "룸타입 없음"}</div>
        </div>
      ),
    },
    {
      id: "who",
      header: "계약자",
      sort: (r) => r.contractor?.name ?? "",
      cell: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <PartyName party={r.contractor} />
          {r.payer && r.payer.id !== r.contractor?.id && <div className="truncate text-xs text-ink3">납부 {r.payer.name}</div>}
        </div>
      ),
    },
    {
      id: "status",
      header: "상태",
      sort: (r) => Object.keys(LEASE_STATUS).indexOf(r.status),
      cell: (r) => {
        const note = leaseNote(r, today);
        return (
          <div className="flex flex-col items-start gap-0.5">
            <LeaseStatusBadge status={r.status} />
            {note && <span className="text-xs text-ink3">{note}</span>}
          </div>
        );
      },
    },
    {
      id: "term",
      header: "기간",
      sort: (r) => r.start_date,
      cell: (r) => (
        <div className="whitespace-nowrap">
          <div>
            {fmt(r.start_date, "yy.M.d")} ~ {fmt(r.end_date, "yy.M.d")}
          </div>
          <div className="text-xs text-ink3">{termLabel(r.start_date, r.end_date)}{r.renewal_of ? " · 재계약" : ""}</div>
        </div>
      ),
    },
    { id: "rent", header: "월세", align: "right", sort: (r) => r.rent, cell: (r) => <Money value={r.rent} /> },
    { id: "mgmt", header: "관리비", align: "right", hideOnMobile: true, sort: (r) => r.mgmt_fee, cell: (r) => <Money value={r.mgmt_fee} muted /> },
    {
      id: "overdue",
      header: "미납",
      align: "right",
      sort: (r) => r.money.overdue,
      cell: (r) => (r.money.overdue > 0 ? <span className="num font-semibold text-bad">{r.money.overdue.toLocaleString("ko-KR")}</span> : <span className="text-ink3">—</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="계약"
        subtitle={`${branch?.name ?? "전 지점"} · 진행 중 ${counts.open ?? 0}건 · 이번 달 시작 ${(rows.data ?? []).filter((r) => r.start_date.slice(0, 7) === today.slice(0, 7) && r.status !== "cancelled").length}건`}
        actions={
          <>
            {view === "rent-roll" && <RentRollDownload branchName={branch?.name ?? "전 지점"} masked={sp.get("masked") === "1"} />}
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => update({ new: "1" })}>
              계약 작성
            </Button>
          </>
        }
      >
        <Segmented
          value={view}
          onChange={(v) => update({ view: v === "list" ? null : v })}
          options={[
            { value: "list", label: "목록" },
            { value: "rent-roll", label: "렌트롤" },
          ]}
        />
      </PageHeader>

      {view === "rent-roll" ? (
        <RentRoll masked={sp.get("masked") === "1"} onMasked={(v) => update({ masked: v ? "1" : null })} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<LeaseFilter> value={filter} onChange={(v) => update({ status: v === "open" ? null : v })} options={LEASE_FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))} size="sm" />
            <div className="ml-auto w-full sm:w-auto">
              <SearchBox id="lease-search" value={q} onChange={(v) => update({ q: v })} placeholder="호실, 이름, 전화, 이메일" />
            </div>
          </div>
          {rows.isLoading ? (
            <Loading />
          ) : rows.isError ? (
            <ErrorBox error={rows.error} />
          ) : (rows.data ?? []).length === 0 ? (
            <EmptyState title="계약이 없다" body="« 계약 작성 » 을 눌러 계약을 작성한다" action={<Button variant="primary" onClick={() => update({ new: "1" })}>계약 작성</Button>} />
          ) : (
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={(r) => r.id}
              onRowClick={(r) => update({ lease: r.id })}
              selectedKey={peekId}
              empty={
                <span>
                  조건에 맞는 계약이 없다 ·{" "}
                  <button type="button" className="font-medium text-brass hover:underline" onClick={() => update({ status: null, q: null })}>
                    조건 초기화
                  </button>
                </span>
              }
            />
          )}
        </div>
      )}

      <Sheet
        open={!!peek}
        onClose={() => update({ lease: null })}
        title={peek ? `${peek.unit_code}호 계약 · ${peek.contractor?.name ?? ""}` : ""}
        subtitle={peek ? `${peek.branch_name} · ${fmt(peek.start_date)} ~ ${fmt(peek.end_date)}` : undefined}
        actions={peek && <LinkButton to={`/leases/${peek.id}`} size="sm" variant="primary">계약 열기</LinkButton>}
      >
        {peek && <LeasePeek lease={peek} today={today} />}
      </Sheet>

      {(sp.get("new") === "1" || !!sp.get("renew")) && (
        <LeaseCreateDialog
          open
          key={sp.get("renew") ?? "new"}
          onClose={() => update({ new: null, unit: null, inquiry: null, start: null, renew: null })}
          initial={{ unitId: sp.get("unit"), inquiryId: sp.get("inquiry"), start: sp.get("start"), renewOf: sp.get("renew") }}
        />
      )}
    </>
  );
}

function LeasePeek({ lease: l, today }: { lease: LeaseRow; today: string }) {
  const note = leaseNote(l, today);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <LeaseStatusBadge status={l.status} />
        {note && <span className="text-sm text-ink2">{note}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatTile label="미납" value={l.money.overdue.toLocaleString("ko-KR")} unit="원" tone={l.money.overdue > 0 ? "bad" : undefined} />
        <StatTile label="받아 둔 보증금" value={l.money.deposit_held.toLocaleString("ko-KR")} unit="원" />
      </div>
      <KeyValue
        items={[
          ["계약자", <PartyName key="c" party={l.contractor} />],
          ["연락처", l.contractor?.phone || "—"],
          ["납부자", l.payer?.id === l.contractor?.id ? "계약자와 같음" : <PartyName key="p" party={l.payer} />],
          ["만료", `${fmt(l.end_date)} (${dDay(l.end_date, today)})`],
          ["월세", won(l.rent)],
          ["관리비", won(l.mgmt_fee)],
          ["보증금", won(l.deposit + l.mgmt_deposit)],
          ["청구 방식", billingSummary(l)],
          ["유입경로", l.source_group || "—"],
          ["구분", l.renewal_of ? "재계약" : "신규"],
        ]}
      />
      {l.memo && <p className="rounded border border-line bg-sunken/60 px-3 py-2 text-sm text-ink2">{l.memo}</p>}
    </div>
  );
}

const rollColumns: Array<{ id: keyof RentRollRow | "no"; header: string; money?: boolean }> = [
  { id: "unit_code", header: "호실" },
  { id: "kind", header: "구분" },
  { id: "start_date", header: "시작일" },
  { id: "end_date", header: "만료일" },
  { id: "contractor_name", header: "계약자" },
  { id: "nationality", header: "국적" },
  { id: "gender", header: "성별" },
  { id: "phone", header: "전화" },
  { id: "deposit", header: "보증금", money: true },
  { id: "mgmt_deposit", header: "관리비 보증금", money: true },
  { id: "prepaid_rent", header: "선납임대료", money: true },
  { id: "rent", header: "월세", money: true },
  { id: "mgmt_fee", header: "관리비", money: true },
  { id: "month_rent", header: "이번 달 월세", money: true },
  { id: "month_mgmt", header: "이번 달 관리비", money: true },
  { id: "remaining_rent", header: "남은 총임대료", money: true },
  { id: "remaining_mgmt", header: "남은 총관리비", money: true },
  { id: "unpaid", header: "미납", money: true },
];

function useRentRoll(masked: boolean) {
  const { branchId } = useBranch();
  return useApi<{ today: string; rows: RentRollRow[] }>(["leases", branchId, "rent-roll", masked], `/api/leases/rent-roll?branch_id=${branchId}${masked ? "&masked=true" : ""}`);
}

function rollCell(r: RentRollRow, id: (typeof rollColumns)[number]["id"]): string | number | null {
  if (id === "no") return "";
  const v = r[id];
  if (id === "nationality") return NATIONALITY[String(v)] ?? String(v ?? "");
  if (id === "gender") return v === "M" ? "남" : v === "F" ? "여" : "";
  return v as string | number | null;
}

function RentRollDownload({ branchName, masked }: { branchName: string; masked: boolean }) {
  const q = useRentRoll(masked);
  const name = `렌트롤_${branchName.replace(/\s/g, "")}_${q.data?.today ?? ""}${masked ? "_가림" : ""}`;
  const rows = () => [[...rollColumns.map((c) => c.header), "청구 방식"], ...(q.data?.rows ?? []).map((r) => [...rollColumns.map((c) => rollCell(r, c.id)), r.billing ?? ""])];
  return (
    <>
      <Button
        icon={<FileSpreadsheet className="size-4" />}
        disabled={!q.data?.rows.length}
        onClick={() => void downloadXlsx(`${name}.xlsx`, rows(), { sheet: "렌트롤", widths: [8, 8, 11, 11, 12, 8, 6, 15, 12, 12, 12, 11, 10, 12, 12, 13, 13, 11, 40] })}
      >
        엑셀(xlsx)
      </Button>
      <Button icon={<Download className="size-4" />} disabled={!q.data?.rows.length} onClick={() => downloadCsv(`${name}.csv`, rows())}>
        CSV
      </Button>
    </>
  );
}

function RentRoll({ masked, onMasked }: { masked: boolean; onMasked: (v: boolean) => void }) {
  const q = useRentRoll(masked);
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox error={q.error} />;
  const rows = q.data?.rows ?? [];
  if (!rows.length) return <EmptyState title="체결된 계약이 없다" body="체결 이후(입주 예정·거주 중·퇴실 중) 계약이 렌트롤에 모인다" />;
  const sum = (k: keyof RentRollRow) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const columns: Column<RentRollRow>[] = rollColumns.map((c) => ({
    id: c.id,
    header: c.header,
    align: c.money ? "right" : "left",
    sort: (r: RentRollRow) => (c.id === "no" ? null : c.id === "unit_code" ? r.unit_code.padStart(6, "0") : (r[c.id] as string | number | null)),
    cell: (r: RentRollRow) => {
      if (c.id === "no") return null;
      const v = r[c.id];
      if (c.money) return c.id === "unpaid" && Number(v) > 0 ? <span className="font-semibold text-bad">{Number(v).toLocaleString("ko-KR")}</span> : <Money value={Number(v)} muted={!v} />;
      if (c.id === "unit_code") return <span className="font-semibold">{String(v)}호</span>;
      if (c.id === "contractor_name") return String(v);
      if (c.id === "phone") return <span className="whitespace-nowrap">{String(v)}</span>;
      if (c.id === "nationality") return NATIONALITY[String(v)] ?? String(v);
      if (c.id === "gender") return v === "M" ? "남" : v === "F" ? "여" : "—";
      if (c.id === "start_date" || c.id === "end_date") return <span className="whitespace-nowrap">{fmt(String(v), "yy.M.d")}</span>;
      return String(v ?? "—");
    },
  }));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="계약 호실" value={rows.length} unit="실" />
        <StatTile label="월세 합계" value={Math.round(sum("rent") / 10000).toLocaleString("ko-KR")} unit="만원" />
        <StatTile label="받아 둔 보증금(약정)" value={Math.round((sum("deposit") + sum("mgmt_deposit")) / 10000).toLocaleString("ko-KR")} unit="만원" />
        <StatTile label="미납" value={sum("unpaid").toLocaleString("ko-KR")} unit="원" tone={sum("unpaid") > 0 ? "bad" : undefined} />
      </div>
      <label className="flex items-center gap-2 self-end text-xs text-ink2">
        <input id="rr-mask" type="checkbox" checked={masked} onChange={(e) => onMasked(e.target.checked)} className="size-3.5" />
        이름·전화·메일 가리기(밖으로 공유할 때 · 내려받기에도 적용)
      </label>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        dense
        footer={
          <tr>
            {rollColumns.map((c, i) => (
              <td key={c.id} className={`px-3 py-2 text-xs font-semibold ${c.money ? "num text-right" : ""}`}>
                {i === 0 ? "합계" : c.money ? sum(c.id as keyof RentRollRow).toLocaleString("ko-KR") : ""}
              </td>
            ))}
          </tr>
        }
      />
    </div>
  );
}
