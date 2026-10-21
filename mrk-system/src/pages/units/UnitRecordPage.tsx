import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { fmt, timeLabel, won } from "@/lib/format";
import { LEASE_STATUS } from "@/lib/codes";
import { plusDays } from "@/lib/dates";
import { Badge, Button, DataTable, Dialog, ErrorBox, Field, FormGrid, Input, KeyValue, LinkButton, Loading, MoneyInput, Segmented, Tabs, Textarea, type Column } from "@/components/ui";
import { MemosSection, HistoryList } from "@/components/RecordParts";
import type { UnitBlock } from "@/types";
import type { AskingPrices, UnitDetail, UnitLeaseSummary } from "./model";
import { earliestStart, newLeaseUrl, pyeong, stateNote, UnitStateBadge, useParam } from "./shared";

type Tab = "info" | "leases" | "blocks" | "memos" | "history";

export default function UnitRecordPage() {
  const { unitId = "" } = useParams();
  const { today } = useBranch();
  const nav = useNavigate();
  const [sp, set] = useParam();
  const tab = (sp.get("tab") as Tab) || "info";
  const q = useApi<UnitDetail>(["units", "detail", unitId], `/api/units/${unitId}`);
  const [priceOpen, setPriceOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const inv = [["units"], ["leases"]];
  const patch = useApiMutation({ invalidate: inv, success: "호실을 고쳤다" });
  const delBlock = useApiMutation({ invalidate: inv, success: "일정을 풀었다" });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const u = q.data;
  const start = earliestStart(u, today);
  const onSale = u.sale_status === "on_sale";

  const leaseCols: Column<UnitLeaseSummary>[] = [
    { id: "who", header: "계약자", cell: (l) => <span className="font-medium">{l.contractor_name}</span> },
    { id: "period", header: "기간", sort: (l) => l.start_date, cell: (l) => `${fmt(l.start_date, "yy.M.d")} ~ ${fmt(l.move_out_date ?? l.end_date, "yy.M.d")}` },
    { id: "rent", header: "월세", align: "right", sort: (l) => l.rent, cell: (l) => won(l.rent) },
    { id: "status", header: "상태", cell: (l) => <Badge tone={LEASE_STATUS[l.status].tone}>{LEASE_STATUS[l.status].label}</Badge> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => nav(-1)} className="inline-flex w-fit items-center gap-1 text-sm text-ink3 hover:text-ink">
          <ArrowLeft className="size-4" /> 호실
        </button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="num text-[26px] font-semibold tracking-tight">{u.code}호</h1>
              <UnitStateBadge state={u.today.state} />
              {!onSale && <Badge>판매 중지</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink3">
              {u.branch_name} · {u.building_name ?? "건물 미정"} · {u.type_name ?? "룸타입 미정"} · {stateNote(u)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPriceOpen(true)}>모집가 고치기</Button>
            <Button onClick={() => setBlockOpen(true)}>홀드·운영중지</Button>
            <Button
              variant={onSale ? "danger" : "secondary"}
              loading={patch.isPending}
              onClick={() => patch.mutate({ path: `/api/units/${u.id}`, method: "PATCH", body: { sale_status: onSale ? "off_sale" : "on_sale" } })}
            >
              {onSale ? "판매 중지" : "판매 재개"}
            </Button>
            {onSale && u.today.state !== "suspended" && (
              <LinkButton to={newLeaseUrl(u.id, start)} variant="primary">
                {fmt(start, "M.d")}부터 계약 작성
              </LinkButton>
            )}
          </div>
        </div>
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={(t) => set("tab", t === "info" ? null : t)}
        tabs={[
          { value: "info", label: "정보" },
          { value: "leases", label: `계약 이력 ${u.leases.length}` },
          { value: "blocks", label: `일정 블록 ${u.blocks.length}` },
          { value: "memos", label: "메모" },
          { value: "history", label: "이력" },
        ]}
      />

      {tab === "info" && (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="flex min-w-0 flex-col gap-5">
          <div className="rounded-md border border-line bg-surface p-4">
            <KeyValue
              items={[
                ["지점", u.branch_name],
                ["건물", u.building_name ?? "—"],
                ["룸타입", u.type_name ?? "룸타입 미정"],
                ["층", u.floor === null ? "미정" : `${u.floor}층`],
                ["전용면적", `${u.area_m2}㎡ · ${pyeong(u.area_m2)}평`],
                ["향", u.facing ?? "—"],
                ["모집가 월세", u.asking_price ? won(u.asking_price.rent) : "모집가 없음"],
                ["모집가 관리비", u.asking_price ? won(u.asking_price.mgmt) : "—"],
                ["룸타입 정가", u.unit_type ? `${won(u.unit_type.list_rent)} · 관리비 ${won(u.unit_type.list_mgmt)}` : "—"],
                ["등록일", fmt(u.created_at)],
              ]}
            />
          </div>
          <AskingHistory unitId={u.id} onEdit={() => setPriceOpen(true)} />
          </div>
          <div className="flex flex-col gap-2">
            <div className="label-caps">지금 · 다음 계약</div>
            {u.current ? (
              <Link to={`/leases/${u.current.lease_id}`} className="rounded-md border border-line bg-surface px-3 py-2.5 text-sm hover:border-ink3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{u.current.contractor_name}</span>
                  <Badge tone={LEASE_STATUS[u.current.status].tone}>{LEASE_STATUS[u.current.status].label}</Badge>
                </div>
                <div className="num mt-0.5 text-xs text-ink3">
                  {fmt(u.current.start_date, "yy.M.d")} ~ {fmt(u.current.end_date, "yy.M.d")}
                </div>
              </Link>
            ) : (
              <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-sm text-ink3">지금 계약이 없다</p>
            )}
            {u.next && (
              <Link to={`/leases/${u.next.lease_id}`} className="rounded-md border border-line bg-surface px-3 py-2.5 text-sm hover:border-ink3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{u.next.contractor_name}</span>
                  <Badge tone={LEASE_STATUS[u.next.status].tone}>{LEASE_STATUS[u.next.status].label}</Badge>
                </div>
                <div className="num mt-0.5 text-xs text-ink3">{fmt(u.next.start_date, "yy.M.d")}부터</div>
              </Link>
            )}
          </div>
        </div>
      )}

      {tab === "leases" && <DataTable rows={u.leases} columns={leaseCols} rowKey={(l) => l.id} onRowClick={(l) => nav(`/leases/${l.id}`)} empty="이 호실의 계약이 없다" />}

      {tab === "blocks" && (
        <div className="flex flex-col gap-3">
          <div>
            <Button size="sm" onClick={() => setBlockOpen(true)}>
              홀드·운영중지 잡기
            </Button>
          </div>
          {u.blocks.length === 0 ? (
            <p className="text-sm text-ink3">잡힌 일정 블록이 없다</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
              {u.blocks.map((b) => {
                const over = b.kind === "hold" ? (b.hold_expires_at ?? "").slice(0, 10) < today : !!b.until && b.until < today;
                return (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <Badge tone={b.kind === "hold" ? "warn" : "bad"}>{b.kind === "hold" ? "홀드" : "운영중지"}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">
                        {b.reason}
                        {b.inquiry_id && (
                          <Link to={`/inquiries/${b.inquiry_id}`} className="ml-2 text-xs text-brass hover:underline">
                            상담 보기
                          </Link>
                        )}
                      </div>
                      <div className="num text-xs text-ink3">
                        {fmt(b.from, "yy.M.d")} ~ {b.kind === "hold" && b.hold_expires_at ? fmt(b.hold_expires_at, "M.d HH:mm") : b.until ? fmt(b.until, "yy.M.d") : "끝 미정"}
                        {over && " · 만료됨"}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="일정 풀기"
                      className="rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad"
                      onClick={() => delBlock.mutate({ path: `/api/units/${u.id}/blocks/${b.id}`, method: "DELETE" })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === "memos" && (
        <div className="max-w-2xl">
          <MemosSection kinds="units" id={u.id} />
        </div>
      )}
      {tab === "history" && (
        <div className="max-w-2xl">
          <HistoryList kinds="units" id={u.id} />
        </div>
      )}

      <PriceDialog open={priceOpen} onClose={() => setPriceOpen(false)} unit={u} />
      <BlockDialog open={blockOpen} onClose={() => setBlockOpen(false)} unitId={u.id} code={u.code} today={today} />
    </div>
  );
}

function PriceDialog({ open, onClose, unit }: { open: boolean; onClose: () => void; unit: UnitDetail }) {
  const [rent, setRent] = useState<number | null>(null);
  const [mgmt, setMgmt] = useState<number | null>(null);
  useEffect(() => {
    if (open) {
      setRent(unit.asking_price?.rent ?? unit.unit_type?.list_rent ?? null);
      setMgmt(unit.asking_price?.mgmt ?? unit.unit_type?.list_mgmt ?? null);
    }
  }, [open, unit]);
  const save = useApiMutation({ invalidate: [["units"]], success: "모집가를 고쳤다", onSuccess: onClose });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${unit.code}호 모집가`}
      description="광고·추천 방에 나가는 월 금액. 비우면 «모집가 없음»이 된다."
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate({ path: `/api/units/${unit.id}`, method: "PATCH", body: { asking_price: rent === null ? null : { rent, mgmt: mgmt ?? 0 } } })}
          >
            저장
          </Button>
        </>
      }
    >
      <FormGrid>
        <Field label="모집가(월세)" htmlFor="price-rent" hint={unit.unit_type ? `정가 ${won(unit.unit_type.list_rent)}` : undefined}>
          <MoneyInput id="price-rent" value={rent} onChange={setRent} />
        </Field>
        <Field label="관리비" htmlFor="price-mgmt" hint={unit.unit_type ? `정가 ${won(unit.unit_type.list_mgmt)}` : undefined}>
          <MoneyInput id="price-mgmt" value={mgmt} onChange={setMgmt} />
        </Field>
      </FormGrid>
    </Dialog>
  );
}

function BlockDialog({ open, onClose, unitId, code, today }: { open: boolean; onClose: () => void; unitId: string; code: string; today: string }) {
  const [kind, setKind] = useState<UnitBlock["kind"]>("hold");
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(plusDays(today, 2));
  const [expires, setExpires] = useState(`${plusDays(today, 1)}T18:00`);
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setKind("hold");
      setFrom(today);
      setUntil(plusDays(today, 2));
      setExpires(`${plusDays(today, 1)}T18:00`);
      setReason("");
    }
  }, [open, today]);
  const save = useApiMutation({ invalidate: [["units"]], success: kind === "hold" ? "홀드를 잡았다" : "운영중지를 잡았다", onSuccess: onClose });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${code}호 일정 잡기`}
      description="홀드는 문의 고객에게 잠시 잡아 두는 것, 운영중지는 수리 등으로 팔지 않는 기간이다. 홀드는 기한이 지나면 저절로 풀린다."
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                path: `/api/units/${unitId}/blocks`,
                body: { kind, from, until: until || null, reason, hold_expires_at: kind === "hold" ? `${expires}:00+09:00` : null },
              })
            }
          >
            잡기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Segmented<UnitBlock["kind"]>
          value={kind}
          onChange={setKind}
          options={[
            { value: "hold", label: "홀드" },
            { value: "suspend", label: "운영중지" },
          ]}
        />
        <FormGrid>
          <Field label="시작" htmlFor="block-from">
            <Input id="block-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="끝" htmlFor="block-until" hint={kind === "suspend" ? "비우면 끝 미정" : undefined}>
            <Input id="block-until" type="date" value={until} min={from} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </FormGrid>
        {kind === "hold" && (
          <Field label="홀드 기한" htmlFor="block-exp" hint="이 시각이 지나면 다시 판매 가능">
            <Input id="block-exp" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        )}
        <Field label="사유" htmlFor="block-reason">
          <Textarea id="block-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "hold" ? "예: 투어 후 결정 대기" : "예: 욕실 누수 수리"} />
        </Field>
      </div>
    </Dialog>
  );
}

/** 모집가 기록 — 원본 /api/units/:id/asking-prices */
function AskingHistory({ unitId, onEdit }: { unitId: string; onEdit: () => void }) {
  const q = useApi<AskingPrices>(["units", "asking", unitId], `/api/units/${unitId}/asking-prices`);
  const rows = q.data?.history ?? [];
  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">모집가 기록</h2>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          모집가 고치기
        </Button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-ink3">모집가를 바꾼 기록이 없다</p>
      ) : (
        <ol className="divide-y divide-line">
          {rows.map((h, i) => {
            const prev = rows[i + 1];
            const diff = prev ? h.rent - prev.rent : 0;
            return (
              <li key={`${h.at}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="num w-28 shrink-0 text-xs text-ink3">{timeLabel(h.at)}</span>
                <span className="num font-medium">월 {won(h.rent)}</span>
                <span className="num text-xs text-ink3">관리비 {won(h.mgmt)}</span>
                {diff !== 0 && <span className={diff > 0 ? "num text-xs text-bad" : "num text-xs text-good"}>{diff > 0 ? "▲" : "▼"} {won(Math.abs(diff))}</span>}
                <span className="ml-auto text-xs text-ink3">{h.by}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
