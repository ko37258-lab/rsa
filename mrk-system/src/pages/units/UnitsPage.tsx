import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ArrowRight, Layers, LayoutGrid, Tags } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import { fmt, man, won } from "@/lib/format";
import { LEASE_STATUS } from "@/lib/codes";
import { Badge, Button, DataTable, EmptyState, ErrorBox, KeyValue, LinkButton, Loading, PageHeader, SearchBox, Segmented, Sheet, type Column } from "@/components/ui";
import { UNIT_STATE, UNIT_STATE_ORDER, type SalesBoardRow, type UnitRow, type UnitState } from "./model";
import { earliestStart, newLeaseUrl, pyeong, stateNote, UnitStateBadge, useParam } from "./shared";
import { UnitCreateDialog } from "./UnitCreateDialog";
import { UnitFloorPlan } from "./UnitFloorPlan";
import { UnitCalendar } from "./UnitCalendar";
import { UnitBulkDialog } from "./UnitBulkDialog";
import { UnitTypesDialog } from "./UnitTypesDialog";
import { FloorPlanEditor } from "./FloorPlanEditor";
import { PeriodPicker, readPeriod, useSalesBoard } from "./board";

type View = "list" | "floor" | "calendar";

export default function UnitsPage() {
  const { branchId, today } = useBranch();
  const [sp, set] = useParam();
  const view: View = sp.get("view") === "calendar" ? "calendar" : sp.get("view") === "floor" ? "floor" : "list";
  const state = (sp.get("state") as UnitState | "fits" | "nofit" | null) ?? null;
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const units = useApi<UnitRow[]>(["units", branchId], `/api/units?branch_id=${branchId}`);
  const all = units.data ?? [];
  const period = readPeriod(sp, today);
  const { board } = useSalesBoard(branchId, period);

  const counts = useMemo(() => {
    const c: Partial<Record<UnitState, number>> = {};
    for (const u of all) c[u.today.state] = (c[u.today.state] ?? 0) + 1;
    return c;
  }, [all]);

  const fitCount = useMemo(() => (board ? all.filter((u) => board.get(u.id)?.fits).length : 0), [all, board]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const okState = (u: UnitRow) => {
      if (!state) return true;
      if (state === "fits") return !!board?.get(u.id)?.fits;
      if (state === "nofit") return !!board && !board.get(u.id)?.fits;
      return u.today.state === state;
    };
    return all.filter((u) => okState(u) && (!s || u.code.toLowerCase().includes(s) || (u.type_name ?? "").toLowerCase().includes(s) || (u.current?.contractor_name ?? "").toLowerCase().includes(s)));
  }, [all, q, state, board]);

  const peek = sp.get("unit") ? all.find((u) => u.id === sp.get("unit")) ?? null : null;
  const many = branchId === "all";

  const columns: Column<UnitRow>[] = [
    {
      id: "code",
      header: "호실",
      sort: (u) => `${u.branch_id}-${String(u.floor ?? 0).padStart(3, "0")}-${u.code}`,
      cell: (u) => (
        <div className="flex flex-col">
          <span className="font-semibold">{u.code}호</span>
          {many && <span className="text-xs text-ink3">{u.branch_name}</span>}
        </div>
      ),
    },
    { id: "type", header: "룸타입", sort: (u) => u.type_name ?? "", cell: (u) => u.type_name ?? <span className="text-ink3">룸타입 미정</span> },
    { id: "floor", header: "층", align: "right", sort: (u) => u.floor, cell: (u) => (u.floor === null ? <span className="text-ink3">미정</span> : `${u.floor}층`), hideOnMobile: true },
    { id: "area", header: "전용면적", align: "right", sort: (u) => u.area_m2, cell: (u) => <span title={`${pyeong(u.area_m2)}평`}>{u.area_m2}㎡</span>, hideOnMobile: true },
    board
      ? {
          id: "period",
          header: "기간 상태",
          sort: (u) => (board.get(u.id)?.fits ? 0 : 1),
          cell: (u) => <BoardCell row={board.get(u.id)} />,
        }
      : {
          id: "state",
          header: "오늘 상태",
          sort: (u) => UNIT_STATE_ORDER.indexOf(u.today.state),
          cell: (u) => (
            <div className="flex flex-col items-start gap-0.5">
              <UnitStateBadge state={u.today.state} />
              <span className="text-xs text-ink3">{stateNote(u)}</span>
            </div>
          ),
        },
    { id: "price", header: "모집가(월세)", align: "right", sort: (u) => u.asking_price?.rent ?? null, cell: (u) => (u.asking_price ? man(u.asking_price.rent) : <span className="text-ink3">모집가 없음</span>) },
    {
      id: "who",
      header: "지금 계약자",
      sort: (u) => u.current?.contractor_name ?? "",
      cell: (u) =>
        u.current ? (
          <div className="flex flex-col">
            <span>{u.current.contractor_name}</span>
            <span className="text-xs text-ink3">~{fmt(u.current.end_date, "yy.M.d")}</span>
          </div>
        ) : (
          <span className="text-ink3">—</span>
        ),
    },
  ];

  const vacant = counts.vacant ?? 0;

  return (
    <>
      <PageHeader
        title="호실"
        subtitle={units.data ? `${all.length}실 · 오늘 판매 가능 ${vacant}실` : undefined}
        actions={
          <>
            <Button icon={<Tags className="size-4" />} onClick={() => set("types", "1")}>
              룸타입 관리
            </Button>
            <Button icon={<Layers className="size-4" />} onClick={() => set("bulk", "1")}>
              여러 호실 한 번에
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => set("new", "1")}>
              호실 등록
            </Button>
          </>
        }
      >
        <Segmented<View>
          value={view}
          onChange={(v) => set("view", v === "list" ? null : v)}
          options={[
            { value: "list", label: "목록" },
            { value: "floor", label: "배치도" },
            { value: "calendar", label: "달력" },
          ]}
        />
        {view !== "calendar" && !editing && (
          <>
            <PeriodPicker p={period} onChange={(months, from) => set({ months, from, state: null })} />
            <Segmented<string>
              size="sm"
              value={state ?? "all"}
              onChange={(v) => set("state", v === "all" ? null : v)}
              options={
                board
                  ? [
                      { value: "all", label: "전체", count: all.length },
                      { value: "fits", label: "기간 맞음", count: fitCount },
                      { value: "nofit", label: "기간 안 맞음", count: all.length - fitCount },
                    ]
                  : [{ value: "all", label: "전체", count: all.length }, ...UNIT_STATE_ORDER.filter((s) => counts[s]).map((s) => ({ value: s, label: UNIT_STATE[s].label, count: counts[s] }))]
              }
            />
            <SearchBox id="unit-search" value={q} onChange={setQ} placeholder="호실, 룸타입, 계약자" />
            {view === "floor" && (
              <Button
                size="sm"
                icon={<LayoutGrid className="size-3.5" />}
                disabled={branchId === "all"}
                title={branchId === "all" ? "지점을 고르면 배치를 고칠 수 있다" : undefined}
                onClick={() => setEditing(true)}
              >
                배치 편집
              </Button>
            )}
          </>
        )}
      </PageHeader>

      {view === "calendar" ? (
        <UnitCalendar />
      ) : units.isLoading ? (
        <Loading />
      ) : units.error ? (
        <ErrorBox error={units.error} />
      ) : all.length === 0 ? (
        <EmptyState
          title="등록된 호실이 없다"
          body="호실 등록을 눌러 호실을 등록한다"
          action={
            <Button variant="primary" onClick={() => set("new", "1")}>
              호실 등록
            </Button>
          }
        />
      ) : view === "floor" && editing && branchId !== "all" ? (
        <FloorPlanEditor branchId={branchId} units={all} onDone={() => setEditing(false)} />
      ) : view === "floor" ? (
        rows.length ? (
          <UnitFloorPlan units={rows} onPick={(u) => set("unit", u.id)} selected={peek?.id} board={board} />
        ) : (
          <EmptyState title="조건에 맞는 호실이 없다" action={<Button onClick={() => (setQ(""), set("state", null))}>조건 초기화</Button>} />
        )
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(u) => u.id}
          onRowClick={(u) => set("unit", u.id)}
          selectedKey={peek?.id}
          empty={
            <div className="flex flex-col items-center gap-2">
              조건에 맞는 호실이 없다
              <Button size="sm" onClick={() => (setQ(""), set("state", null))}>
                조건 초기화
              </Button>
            </div>
          }
        />
      )}

      <Sheet
        open={!!peek}
        onClose={() => set("unit", null)}
        title={peek ? `${peek.code}호` : ""}
        subtitle={peek ? `${peek.branch_name} · ${peek.type_name ?? "룸타입 미정"}` : undefined}
      >
        {peek && <UnitPeek u={peek} today={today} board={board?.get(peek.id) ?? null} periodFrom={board ? period.from : null} />}
      </Sheet>

      <UnitCreateDialog open={sp.get("new") === "1"} onClose={() => set("new", null)} />
      <UnitBulkDialog open={sp.get("bulk") === "1"} onClose={() => set("bulk", null)} />
      <UnitTypesDialog open={sp.get("types") === "1"} onClose={() => set("types", null)} />
    </>
  );
}

/** 판매 기간 칸 — 기간 내내 비면 «기간 맞음», 아니면 원본처럼 이유를 적는다 */
function BoardCell({ row }: { row: SalesBoardRow | undefined }) {
  if (!row) return <span className="text-ink3">—</span>;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <Badge tone={row.fits ? "good" : row.hold ? "warn" : row.suspend || row.state === "off_sale" ? "bad" : "neutral"}>{row.fits ? "기간 맞음" : row.hold ? "홀드" : row.suspend ? "운영중지" : row.state === "off_sale" ? "판매 중지" : "기간 안 맞음"}</Badge>
      <span className="text-xs text-ink3">{row.note}</span>
    </div>
  );
}

function UnitPeek({ u, today, board, periodFrom }: { u: UnitRow; today: string; board: SalesBoardRow | null; periodFrom: string | null }) {
  const start = board?.fits && periodFrom ? periodFrom : earliestStart(u, today);
  const canLease = u.sale_status === "on_sale" && u.today.state !== "suspended";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <UnitStateBadge state={u.today.state} />
        <span className="text-sm text-ink2">{stateNote(u)}</span>
      </div>
      {board && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-line bg-sunken/50 px-3 py-2 text-sm">
          <span className="text-xs text-ink3">고른 기간</span>
          <BoardCell row={board} />
        </div>
      )}
      <KeyValue
        items={[
          ["층", u.floor === null ? "미정" : `${u.floor}층`],
          ["전용면적", `${u.area_m2}㎡ (${pyeong(u.area_m2)}평)`],
          ["향", u.facing ?? "—"],
          ["모집가", u.asking_price ? `월 ${won(u.asking_price.rent)} · 관리비 ${won(u.asking_price.mgmt)}` : "모집가 없음"],
        ]}
      />
      <div className="flex flex-col gap-2">
        <div className="label-caps">계약</div>
        {u.current ? (
          <Link to={`/leases/${u.current.lease_id}`} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm hover:bg-sunken">
            <span>
              <span className="text-xs text-ink3">지금 · </span>
              {u.current.contractor_name} · {fmt(u.current.start_date, "yy.M.d")}~{fmt(u.current.end_date, "yy.M.d")}
            </span>
            <Badge tone={LEASE_STATUS[u.current.status].tone}>{LEASE_STATUS[u.current.status].label}</Badge>
          </Link>
        ) : (
          <p className="text-sm text-ink3">지금 계약이 없다</p>
        )}
        {u.next && (
          <Link to={`/leases/${u.next.lease_id}`} className="flex items-center justify-between rounded border border-line px-3 py-2 text-sm hover:bg-sunken">
            <span>
              <span className="text-xs text-ink3">다음 · </span>
              {u.next.contractor_name} · {fmt(u.next.start_date, "yy.M.d")}부터
            </span>
            <Badge tone={LEASE_STATUS[u.next.status].tone}>{LEASE_STATUS[u.next.status].label}</Badge>
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <LinkButton to={`/units/${u.id}`} icon={<ArrowRight className="size-4" />}>
          호실 자세히
        </LinkButton>
        {canLease && (
          <LinkButton to={newLeaseUrl(u.id, start)} variant="primary">
            {fmt(start, "M.d")}부터 계약 작성
          </LinkButton>
        )}
      </div>
    </div>
  );
}
