import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ClipboardPaste } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import { CHANNEL, INQUIRY_STAGE } from "@/lib/codes";
import { fmt, man, minutes, timeLabel } from "@/lib/format";
import { Badge, Button, DataTable, EmptyState, ErrorBox, Loading, PageHeader, SearchBox, Segmented, type Column } from "@/components/ui";
import { useParam } from "@/pages/units/shared";
import type { ConversationRow, InquiryRow } from "./model";
import { InboxView } from "./InboxView";
import { InquiryCreateDialog } from "./InquiryCreateDialog";

type Kind = "inquiry" | "life" | "inbox";
type Status = "awaiting" | "active" | "done" | "all";

export default function InquiriesPage() {
  const { branchId } = useBranch();
  const nav = useNavigate();
  const [sp, set] = useParam();
  const kind: Kind = sp.get("kind") === "life" ? "life" : sp.get("kind") === "inbox" ? "inbox" : "inquiry";
  const status = ((sp.get("status") as Status) || "active") as Status;
  const [q, setQ] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const data = useApi<InquiryRow[]>(["inquiries", branchId, kind], kind === "inbox" ? null : `/api/inquiries?branch_id=${branchId}&kind=${kind}&include_unplaced=true`);
  const inbox = useApi<ConversationRow[]>(["inquiries", "unlinked", branchId], `/api/conversations/unlinked?branch_id=${branchId}`);
  const all = data.data ?? [];

  const counts = useMemo(
    () => ({
      awaiting: all.filter((x) => x.awaiting).length,
      active: all.filter((x) => !x.closed_at).length,
      done: all.filter((x) => !!x.closed_at).length,
      all: all.length,
    }),
    [all],
  );

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const d = s.replace(/\D/g, "");
    return all
      .filter((x) => (status === "awaiting" ? x.awaiting : status === "active" ? !x.closed_at : status === "done" ? !!x.closed_at : true))
      .filter((x) => {
        if (!s || !x.party) return !s;
        const p = x.party;
        return p.name.toLowerCase().includes(s) || p.email.toLowerCase().includes(s) || (p.contact_name ?? "").toLowerCase().includes(s) || (d.length >= 3 && p.phone.replace(/\D/g, "").includes(d));
      });
  }, [all, q, status]);

  const many = branchId === "all";
  const columns: Column<InquiryRow>[] = [
    { id: "at", header: "접수 시각", sort: (x) => x.created_at, cell: (x) => <span className="num whitespace-nowrap text-ink2">{timeLabel(x.created_at)}</span> },
    {
      id: "name",
      header: kind === "life" ? "입주자" : "이름",
      sort: (x) => x.party?.name ?? "",
      cell: (x) => (
        <div className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 font-medium">
            {x.party?.name ?? "—"}
            {x.party?.kind === "corporation" && <Badge tone="navy" dot={false}>법인</Badge>}
          </span>
          <span className="block max-w-[30ch] truncate text-xs text-ink3">{x.party?.contact_name ? `담당 ${x.party.contact_name}` : x.last_message ?? ""}</span>
        </div>
      ),
    },
    ...(kind === "life"
      ? [{ id: "unit", header: "호실", sort: (x: InquiryRow) => x.unit_code ?? "", cell: (x: InquiryRow) => (x.unit_code ? `${x.unit_code}호` : "—") } as Column<InquiryRow>]
      : [
          { id: "channel", header: "채널", cell: (x: InquiryRow) => CHANNEL[x.channel], hideOnMobile: true } as Column<InquiryRow>,
          { id: "src", header: "유입경로", sort: (x: InquiryRow) => x.source_group, cell: (x: InquiryRow) => <span className="whitespace-nowrap text-ink2">{x.source_group} · {x.source_detail}</span>, hideOnMobile: true } as Column<InquiryRow>,
          {
            id: "want",
            header: "희망",
            sort: (x: InquiryRow) => x.desired_move_in,
            cell: (x: InquiryRow) => (
              <span className="whitespace-nowrap text-ink2">
                {[x.desired_move_in && `입주 ${fmt(x.desired_move_in, "M.d")}`, x.stay_months && `${x.stay_months}개월`, x.monthly_budget && `예산 ${man(x.monthly_budget)}`, x.rooms > 1 && `방 ${x.rooms}개`].filter(Boolean).join(" · ") || "—"}
              </span>
            ),
          } as Column<InquiryRow>,
        ]),
    {
      id: "stage",
      header: "단계",
      sort: (x) => x.stage,
      cell: (x) =>
        kind === "life" ? (
          <Badge tone={x.closed_at ? "neutral" : "info"}>{x.closed_at ? "완료" : "진행 중"}</Badge>
        ) : (
          <div className="flex flex-col items-start gap-0.5">
            <Badge tone={INQUIRY_STAGE[x.stage].tone}>{INQUIRY_STAGE[x.stage].label}</Badge>
            {x.stage === "lost" && x.lost_reason && <span className="text-xs text-ink3">{x.lost_reason}</span>}
          </div>
        ),
    },
    ...(many ? [{ id: "branch", header: "지점", sort: (x: InquiryRow) => x.branch_name ?? "", cell: (x: InquiryRow) => x.branch_name ?? <span className="text-ink3">지점 미정</span>, hideOnMobile: true } as Column<InquiryRow>] : []),
    { id: "who", header: "담당", sort: (x) => x.assignee_name ?? "", cell: (x) => x.assignee_name ?? <span className="text-warn">없음</span>, hideOnMobile: true },
    {
      id: "last",
      header: "최근 활동",
      sort: (x) => x.last_activity_at,
      cell: (x) => (
        <div className="flex flex-col items-start gap-0.5">
          {x.awaiting && <Badge tone={x.awaiting_minutes !== null && x.awaiting_minutes > 60 * 24 ? "bad" : "warn"}>답장 대기 {minutes(x.awaiting_minutes)}</Badge>}
          <span className="num whitespace-nowrap text-xs text-ink3">{timeLabel(x.last_activity_at)}</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="상담"
        subtitle={
          kind === "inbox"
            ? inbox.data
              ? `붙이지 않은 대화 ${inbox.data.length}건 · 맞는 상담이나 계약에 붙이거나 새 문의로 만든다`
              : undefined
            : data.data
              ? `진행 중 ${counts.active}건 · 답장 대기 ${counts.awaiting}건`
              : undefined
        }
        actions={
          <>
            <Button icon={<ClipboardPaste className="size-4" />} onClick={() => (kind === "inbox" ? setPasteOpen(true) : (set("kind", "inbox"), setPasteOpen(true)))}>
              대화 붙여넣기
            </Button>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => set("new", "1")}>
              입주문의 접수
            </Button>
          </>
        }
      >
        <Segmented<Kind>
          value={kind}
          onChange={(v) => set("kind", v === "inquiry" ? null : v)}
          options={[
            { value: "inquiry", label: "입주문의" },
            { value: "life", label: "생활문의" },
            { value: "inbox", label: "미연결 대화", count: inbox.data?.length },
          ]}
        />
        {kind !== "inbox" && (
          <>
        <Segmented<Status>
          size="sm"
          value={status}
          onChange={(v) => set("status", v === "active" ? null : v)}
          options={[
            { value: "awaiting", label: "답장 대기", count: counts.awaiting },
            { value: "active", label: "진행 중", count: counts.active },
            { value: "done", label: "완료", count: counts.done },
            { value: "all", label: "전체", count: counts.all },
          ]}
        />
        <SearchBox id="inquiry-search" value={q} onChange={setQ} placeholder="이름, 이메일, 전화" />
          </>
        )}
      </PageHeader>

      {kind === "inbox" ? (
        <InboxView rows={inbox.data ?? []} loading={inbox.isLoading} error={inbox.error} pasteOpen={pasteOpen} setPasteOpen={setPasteOpen} />
      ) : data.isLoading ? (
        <Loading />
      ) : data.error ? (
        <ErrorBox error={data.error} />
      ) : all.length === 0 ? (
        <EmptyState title="들어온 상담이 없다" body="입주문의 접수를 눌러 전화·방문 문의를 접수한다" />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(x) => x.id}
          onRowClick={(x) => nav(`/inquiries/${x.id}`)}
          rowClassName={(x) => (x.awaiting ? "bg-warn/5" : undefined)}
          empty={
            <div className="flex flex-col items-center gap-2">
              조건에 맞는 상담이 없다
              <Button size="sm" onClick={() => (setQ(""), set("status", "all"))}>
                조건 초기화
              </Button>
            </div>
          }
        />
      )}

      <InquiryCreateDialog open={sp.get("new") === "1"} onClose={() => set("new", null)} />
    </>
  );
}
