import { Link } from "react-router-dom";
import { DoorOpen, MessagesSquare, FileSignature, Receipt, Wallet, ArrowRight } from "lucide-react";
import { StatTile, Badge } from "@/components/ui";
import type { Tone } from "@/lib/codes";
import { LEASE_STATUS } from "@/lib/codes";
import { cx, dayLabel } from "@/lib/format";
import type { DashboardRes, MoveRow, TileId } from "./ops-api";

interface TileDef {
  id: TileId;
  label: string;
  unit: string;
  to?: string;
  /** 0 이 아닐 때 붙는 색 */
  alert?: Tone;
}

/** 원본 PMS 의 다섯 묶음(호실·상담·계약·청구·수납)을 그대로 따른다 */
const GROUPS: Array<{ title: string; icon: typeof DoorOpen; dot: string; tiles: TileDef[] }> = [
  {
    title: "호실",
    icon: DoorOpen,
    dot: "bg-brass",
    tiles: [
      { id: "units_free", label: "오늘 판매 가능", unit: "실", to: "/units" },
      { id: "move_ins_week", label: "이번 주 입주", unit: "건", to: "/leases" },
      { id: "expiring_week", label: "이번 주 만료", unit: "건", to: "/settle" },
    ],
  },
  {
    title: "상담",
    icon: MessagesSquare,
    dot: "bg-warn",
    tiles: [
      { id: "inquiries_awaiting", label: "답장 대기", unit: "건", to: "/inquiries?status=awaiting", alert: "warn" },
      { id: "inquiries_unassigned", label: "담당 없음", unit: "건", to: "/inquiries", alert: "warn" },
      { id: "inquiries_open", label: "진행 중", unit: "건", to: "/inquiries" },
    ],
  },
  {
    title: "계약",
    icon: FileSignature,
    dot: "bg-violet",
    tiles: [
      { id: "awaiting_signature", label: "서명 대기", unit: "건", to: "/leases?status=awaiting_signature" },
      { id: "unscheduled", label: "입주 일정 미정", unit: "건", to: "/leases", alert: "warn" },
      { id: "move_ins_late", label: "입주일 지남", unit: "건", to: "/leases", alert: "bad" },
    ],
  },
  {
    title: "청구",
    icon: Receipt,
    dot: "bg-info",
    tiles: [{ id: "invoices_to_send", label: "보낼 청구서", unit: "장", to: "/billing", alert: "info" }],
  },
  {
    title: "수납",
    icon: Wallet,
    dot: "bg-good",
    tiles: [
      { id: "overdue", label: "연체", unit: "명", to: "/collections?filter=overdue", alert: "bad" },
      { id: "bank_open", label: "안 맞춘 입금", unit: "건", to: "/collections?view=receipts", alert: "warn" },
    ],
  },
];

export function TodayTiles({ data }: { data: DashboardRes }) {
  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 xl:grid-cols-5">
      {GROUPS.map((g) => (
        <div key={g.title} className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-2 px-0.5">
            <span className={cx("size-2 rounded-full", g.dot)} />
            <g.icon className="size-3.5 text-ink3" />
            <h3 className="text-[13px] font-semibold text-ink2">{g.title}</h3>
          </div>
          {/* 휴대폰에서는 한 그룹을 가로 3칸으로 놓아 스크롤을 줄인다 */}
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-col">
            {g.tiles.map((t) => {
              const v = data.tiles[t.id];
              return <StatTile key={t.id} className="max-sm:px-3" label={t.label} value={v.value.toLocaleString("ko-KR")} unit={t.unit} note={v.note} tone={v.value > 0 ? t.alert : undefined} to={t.to} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function MoveItem({ m }: { m: MoveRow }) {
  return (
    <li>
      <Link to={`/leases/${m.lease_id}`} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-sunken">
        <Badge tone={m.kind === "in" ? "good" : "brass"}>{m.kind === "in" ? "입주" : "퇴실"}</Badge>
        <span className="num w-14 shrink-0 font-semibold">{m.unit_code}호</span>
        <span className="min-w-0 flex-1 truncate text-ink2">
          {m.name}
          <span className="ml-2 text-xs text-ink3">{m.branch_name}</span>
        </span>
        <span className="num shrink-0 text-xs text-ink3">{dayLabel(m.date)}</span>
        <span className="hidden shrink-0 text-xs text-ink3 sm:inline">{LEASE_STATUS[m.status].label}</span>
        <ArrowRight className="size-3.5 shrink-0 text-ink3" />
      </Link>
    </li>
  );
}

/** 오늘 입주·퇴실 + 이번 주 남은 일정 */
export function TodayMoves({ data }: { data: DashboardRes }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="label-caps mb-1.5">오늘</div>
        {data.moves_today.length === 0 ? (
          <p className="rounded bg-sunken/70 px-3 py-3 text-sm text-ink3">오늘 입주하거나 퇴실하는 계약이 없습니다</p>
        ) : (
          <ul className="flex flex-col">{data.moves_today.map((m) => <MoveItem key={`${m.kind}-${m.lease_id}`} m={m} />)}</ul>
        )}
      </div>
      <div>
        <div className="label-caps mb-1.5">이번 주</div>
        {data.moves_week.length === 0 ? (
          <p className="text-sm text-ink3">7일 안에 잡힌 입주·퇴실이 없다</p>
        ) : (
          <ul className="flex flex-col">{data.moves_week.map((m) => <MoveItem key={`${m.kind}-${m.lease_id}`} m={m} />)}</ul>
        )}
      </div>
    </div>
  );
}
