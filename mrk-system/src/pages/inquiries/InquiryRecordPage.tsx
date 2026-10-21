import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Send, StickyNote, CalendarPlus } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { CHANNEL, INQUIRY_FUNNEL, INQUIRY_STAGE, LEASE_STATUS, LOST_REASONS, NATIONALITY } from "@/lib/codes";
import { cx, fmt, man, minutes, timeLabel, won } from "@/lib/format";
import { plusDays } from "@/lib/dates";
import { Badge, Button, Dialog, ErrorBox, Field, Input, KeyValue, LinkButton, Loading, Section, Segmented, Select, Textarea } from "@/components/ui";
import { MemosSection, HistoryList } from "@/components/RecordParts";
import type { InquiryStage, Message, Staff, Tour } from "@/types";
import type { InquiryDetail, UnitMatch } from "./model";
import { newLeaseUrl } from "@/pages/units/shared";

interface Template {
  id: string;
  title: string;
  shortcut: string;
  body: string;
}

export default function InquiryRecordPage() {
  const { inquiryId = "" } = useParams();
  const nav = useNavigate();
  const { today } = useBranch();
  const q = useApi<InquiryDetail>(["inquiries", "detail", inquiryId], `/api/inquiries/${inquiryId}`);
  const staff = useApi<Staff[]>(["staff"], "/api/staff");
  const [lostOpen, setLostOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const inv = [["inquiries"], ["customers"], ["units"]];
  const patch = useApiMutation({ invalidate: inv, success: "상담을 고쳤다" });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox error={q.error} />;
  const iq = q.data;
  const life = iq.kind === "life";
  const setStage = (stage: InquiryStage) => patch.mutate({ path: `/api/inquiries/${iq.id}`, method: "PATCH", body: { stage } });
  const firstReply = iq.first_reply_at ? Math.round((new Date(iq.first_reply_at).getTime() - new Date(iq.created_at).getTime()) / 60000) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => nav(-1)} className="inline-flex w-fit items-center gap-1 text-sm text-ink3 hover:text-ink">
          <ArrowLeft className="size-4" /> 상담
        </button>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[24px] font-semibold tracking-tight">{iq.party?.name ?? "고객"} {life ? "생활문의" : "문의"}</h1>
              {life ? <Badge tone={iq.closed_at ? "neutral" : "info"}>{iq.closed_at ? "완료" : "진행 중"}</Badge> : <Badge tone={INQUIRY_STAGE[iq.stage].tone}>{INQUIRY_STAGE[iq.stage].label}</Badge>}
              {iq.awaiting && <Badge tone="warn">답장 대기</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink3">
              {timeLabel(iq.created_at)} 접수 · {CHANNEL[iq.channel]} · {iq.branch_name ?? "지점 미정"}
              {iq.unit_code && ` · ${iq.unit_code}호`}
            </p>
          </div>
          {life && (
            <Button variant={iq.closed_at ? "secondary" : "primary"} loading={patch.isPending} onClick={() => patch.mutate({ path: `/api/inquiries/${iq.id}`, method: "PATCH", body: { close: !iq.closed_at } })}>
              {iq.closed_at ? "다시 열기" : "완료 처리"}
            </Button>
          )}
        </div>
      </div>

      {!life && (
        <StageStepper
          stage={iq.stage}
          lostReason={iq.lost_reason}
          busy={patch.isPending}
          onPick={setStage}
          onLost={() => setLostOpen(true)}
          onReopen={() => setStage("new")}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Conversation iq={iq} />
          <Section title="메모" hint="팀만 본다">
            <MemosSection kinds="inquiries" id={iq.id} />
          </Section>
          <Section title="이력">
            <HistoryList kinds="inquiries" id={iq.id} />
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <Section
            title="고객"
            actions={
              iq.party && (
                <Link to={`/customers/${iq.party.id}`} className="text-xs font-medium text-brass hover:underline">
                  고객 보기
                </Link>
              )
            }
          >
            {iq.party ? (
              <div className="flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  {iq.party.name}
                  {iq.party.kind === "corporation" && <Badge tone="navy" dot={false}>법인</Badge>}
                </div>
                {iq.party.contact_name && <div className="text-ink2">담당 {iq.party.contact_name}</div>}
                <div className="num text-ink2">{iq.party.phone || "전화 없음"}</div>
                <div className="break-all text-ink2">{iq.party.email || "이메일 없음"}</div>
                <div className="text-xs text-ink3">
                  {NATIONALITY[iq.party.nationality] ?? iq.party.nationality ?? "국적 미상"} · 문의 {iq.party.inquiry_count}건 · 계약 {iq.party.lease_count}건
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink3">고객 정보가 없다</p>
            )}
          </Section>

          <Section title={life ? "문의" : "문의 조건"}>
            <div className="flex flex-col gap-4">
              <Field label="담당" htmlFor="iq-assignee">
                <Select
                  id="iq-assignee"
                  value={iq.assignee_id ?? ""}
                  onChange={(e) => patch.mutate({ path: `/api/inquiries/${iq.id}`, method: "PATCH", body: { assignee_id: e.target.value || null } })}
                  placeholder="담당 없음"
                  options={(staff.data ?? []).map((s) => ({ value: s.id, label: `${s.name} · ${s.role}` }))}
                />
              </Field>
              <KeyValue
                cols={2}
                items={[
                  ...(!life
                    ? ([
                        ["희망 입주", iq.desired_move_in ? fmt(iq.desired_move_in, "yy.M.d (EEE)") : "—"],
                        ["희망 기간", iq.stay_months ? `${iq.stay_months}개월` : "—"],
                        ["월 예산", iq.monthly_budget ? man(iq.monthly_budget) : "—"],
                        ["방 수", `${iq.rooms}개`],
                        ["유입경로", `${iq.source_group} · ${iq.source_detail}`],
                      ] as Array<[string, string]>)
                    : []),
                  ["접수 채널", CHANNEL[iq.channel]],
                  ["첫 답장", firstReply === null ? "답장 기록 없음" : minutes(firstReply)],
                ]}
              />
            </div>
          </Section>

          {!life && <Tours iq={iq} onAdd={() => setTourOpen(true)} />}
          {!life && iq.stage !== "concluded" && iq.stage !== "lost" && <Matches iq={iq} today={today} />}

          {iq.leases.length > 0 && (
            <Section title="연결된 계약">
              <ul className="flex flex-col gap-2">
                {iq.leases.map((l) => (
                  <li key={l.id}>
                    <Link to={`/leases/${l.id}`} className="flex items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm hover:bg-sunken">
                      <span>
                        <b>{l.unit_code}호</b> · {fmt(l.start_date, "yy.M.d")}~{fmt(l.end_date, "yy.M.d")} · {won(l.rent)}
                      </span>
                      <Badge tone={LEASE_STATUS[l.status].tone}>{LEASE_STATUS[l.status].label}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </aside>
      </div>

      <LostDialog open={lostOpen} onClose={() => setLostOpen(false)} inquiryId={iq.id} />
      <TourDialog open={tourOpen} onClose={() => setTourOpen(false)} iq={iq} today={today} />
    </div>
  );
}

/** 단계 — 문의 → 투어 → 계약 작성 → 서명 요청 → 체결, 옆에 결렬 */
function StageStepper({ stage, lostReason, busy, onPick, onLost, onReopen }: { stage: InquiryStage; lostReason: string | null; busy: boolean; onPick: (s: InquiryStage) => void; onLost: () => void; onReopen: () => void }) {
  const idx = INQUIRY_FUNNEL.indexOf(stage);
  if (stage === "lost")
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-sunken px-4 py-3 text-sm">
        <span>
          결렬 · <b>{lostReason ?? "사유 없음"}</b>
        </span>
        <Button size="sm" onClick={onReopen} loading={busy}>
          다시 열기
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <ol className="flex flex-1 overflow-x-auto rounded-md border border-line bg-surface">
        {INQUIRY_FUNNEL.map((s, i) => {
          const done = i < idx;
          const cur = i === idx;
          return (
            <li key={s} className="flex-1">
              <button
                type="button"
                disabled={busy || cur}
                onClick={() => onPick(s)}
                title={cur ? "지금 단계" : `${INQUIRY_STAGE[s].label}(으)로 옮기기`}
                className={cx(
                  "flex w-full items-center justify-center gap-1.5 whitespace-nowrap border-r border-line px-3 py-2.5 text-[13px] font-medium last:border-0",
                  cur ? "bg-navy text-navy-fg" : done ? "text-ink hover:bg-sunken" : "text-ink3 hover:bg-sunken",
                )}
              >
                {done ? <Check className="size-3.5 text-good" /> : <span className="num text-[11px] opacity-70">{i + 1}</span>}
                {INQUIRY_STAGE[s].label}
              </button>
            </li>
          );
        })}
      </ol>
      {stage !== "concluded" && (
        <Button variant="danger" size="sm" onClick={onLost}>
          결렬
        </Button>
      )}
    </div>
  );
}

function Conversation({ iq }: { iq: InquiryDetail }) {
  const [mode, setMode] = useState<"outbound" | "note">("outbound");
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const tpl = useApi<Template[]>(["materials", "templates", iq.branch_id ?? "all"], `/api/reply-templates?branch_id=${iq.branch_id ?? "all"}`);
  const send = useApiMutation<Message>({
    invalidate: [["inquiries"], ["customers"]],
    success: (m) => (m.direction === "note" ? "내부 메모를 남겼다" : "답장을 보냈다"),
    onSuccess: () => setText(""),
  });
  useEffect(() => endRef.current?.scrollIntoView({ block: "nearest" }), [iq.messages.length]);

  const fill = (body: string) =>
    body
      .replace(/\{이름\}/g, iq.party?.name ?? "고객")
      .replace(/\{지점명\}/g, iq.branch_name ?? "MR.K")
      .replace(/\{입주일\}/g, iq.desired_move_in ? fmt(iq.desired_move_in, "M월 d일") : "희망하신 날짜");

  return (
    <Section title="대화" hint={`${iq.messages.length}개 메시지 · 고객 메시지가 마지막이면 답장 대기다`} bodyClassName="p-0">
      <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto px-4 py-4">
        {iq.messages.length === 0 && <p className="py-8 text-center text-sm text-ink3">아직 대화가 없다</p>}
        {iq.messages.map((m) =>
          m.direction === "note" ? (
            <div key={m.id} className="rounded-md border border-dashed border-brass/60 bg-brass/5 px-3 py-2 text-sm">
              <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-brass">
                <StickyNote className="size-3" /> 내부 메모 · {m.author} · {timeLabel(m.at)}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </div>
          ) : (
            <div key={m.id} className={cx("flex flex-col", m.direction === "outbound" ? "items-end" : "items-start")}>
              <div className={cx("max-w-[85%] whitespace-pre-wrap rounded-lg px-3.5 py-2 text-sm", m.direction === "outbound" ? "rounded-br-sm bg-navy text-navy-fg" : "rounded-bl-sm bg-sunken text-ink")}>{m.body}</div>
              <span className="mt-1 text-[11px] text-ink3">
                {m.author} · {CHANNEL[m.via] ?? m.via} · {timeLabel(m.at)}
              </span>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex flex-col gap-2 border-t border-line px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate({ path: `/api/inquiries/${iq.id}/conversations`, body: { direction: mode, body: text, via: "email" } });
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Segmented<"outbound" | "note">
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "outbound", label: "답장 · 메일" },
              { value: "note", label: "내부 메모" },
            ]}
          />
          {mode === "outbound" && (tpl.data ?? []).length > 0 && (
            <select
              aria-label="정형 답변 넣기"
              className="field h-8 w-auto max-w-[220px] text-[13px]"
              value=""
              onChange={(e) => {
                const t = tpl.data?.find((x) => x.id === e.target.value);
                if (t) setText((prev) => (prev ? `${prev}\n\n` : "") + fill(t.body));
              }}
            >
              <option value="">정형 답변 넣기</option>
              {tpl.data!.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          )}
        </div>
        <Textarea
          id="iq-compose"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "note" ? "팀만 보는 메모" : `${iq.party?.name ?? "고객"}에게 보낼 답장`}
          className={mode === "note" ? "border-brass/50" : undefined}
        />
        <div className="flex justify-end">
          <Button type="submit" variant={mode === "note" ? "brass" : "primary"} size="sm" icon={mode === "note" ? <StickyNote className="size-3.5" /> : <Send className="size-3.5" />} loading={send.isPending} disabled={!text.trim()}>
            {mode === "note" ? "메모 남기기" : "보내기"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

const TOUR_STATUS: Record<Tour["status"], { label: string; tone: "info" | "good" | "bad" | "neutral" }> = {
  scheduled: { label: "예정", tone: "info" },
  done: { label: "다녀감", tone: "good" },
  no_show: { label: "안 옴", tone: "bad" },
  cancelled: { label: "취소", tone: "neutral" },
};

function Tours({ iq, onAdd }: { iq: InquiryDetail; onAdd: () => void }) {
  const upd = useApiMutation({ invalidate: [["inquiries"]], success: "투어를 고쳤다" });
  return (
    <Section
      title="투어"
      actions={
        <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={onAdd}>
          투어 잡기
        </Button>
      }
    >
      {iq.tours.length === 0 ? (
        <p className="text-sm text-ink3">잡힌 투어가 없다</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {iq.tours.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm">
              <div className="min-w-0">
                <div className="num font-medium">{fmt(t.at, "M.d (EEE) HH:mm")}</div>
                <div className="text-xs text-ink3">
                  {t.unit_codes.map((c) => `${c}호`).join(", ")}
                  {t.memo && ` · ${t.memo}`}
                </div>
              </div>
              <select
                aria-label="투어 결과"
                className="field h-8 w-auto text-[13px]"
                value={t.status}
                onChange={(e) => upd.mutate({ path: `/api/inquiries/${iq.id}/tours/${t.id}`, method: "PATCH", body: { status: e.target.value } })}
              >
                {Object.entries(TOUR_STATUS).map(([v, s]) => (
                  <option key={v} value={v}>
                    {s.label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function useMatches(iq: InquiryDetail, today: string) {
  const body = useMemo(
    () => ({ branch_id: iq.branch_id ?? "all", move_in: iq.desired_move_in && iq.desired_move_in > today ? iq.desired_move_in : today, months: iq.stay_months ?? 1, budget: iq.monthly_budget, inquiry_id: iq.id }),
    [iq.branch_id, iq.desired_move_in, iq.stay_months, iq.monthly_budget, iq.id, today],
  );
  // 조회지만 조건이 길어 POST 로 보낸다. 호실이 바뀌면(["units"] 무효화) 다시 읽는다
  const q = useQuery({ queryKey: ["units", "matches", body], queryFn: () => api<UnitMatch[]>("/api/inquiries/matches", { method: "POST", body }) });
  return { rows: q.data ?? (q.isLoading ? null : []), err: q.error, start: body.move_in };
}

/** 추천 방 — 희망 기간 내내 비어 있고 예산에 맞는 호실 */
function Matches({ iq, today }: { iq: InquiryDetail; today: string }) {
  const { rows, err, start } = useMatches(iq, today);
  return (
    <Section title="추천 방" hint={`${fmt(start, "M.d")}부터 ${iq.stay_months ?? 1}개월 내내 비고${iq.monthly_budget ? ` 월 ${man(iq.monthly_budget)} 안팎인` : ""} 방`}>
      {err ? (
        <p className="text-sm text-ink3">추천 방을 불러오지 못했다</p>
      ) : rows === null ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink3">조건에 맞는 빈 방이 없다. 기간이나 예산을 넓혀 본다</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((m) => (
            <li key={m.unit_id} className="flex flex-col gap-1.5 rounded border border-line px-3 py-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <Link to={`/units/${m.unit_id}`} className="font-semibold hover:text-brass">
                  {m.code}호 <span className="text-xs font-normal text-ink3">{[m.branch_name, m.type_name, `${m.area_m2}㎡`].filter(Boolean).join(" · ")}</span>
                </Link>
                <span className="num whitespace-nowrap">{m.rent ? `월 ${man(m.rent)}` : "모집가 없음"}</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={cx("text-xs", m.over_budget ? "text-warn" : "text-good")}>
                  {m.reason}
                  {m.free_until && ` · ${fmt(m.free_until, "M.d")}까지 빔`}
                </span>
                <LinkButton size="sm" to={newLeaseUrl(m.unit_id, start, iq.id)}>
                  이 방으로 계약 작성
                </LinkButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function LostDialog({ open, onClose, inquiryId }: { open: boolean; onClose: () => void; inquiryId: string }) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const save = useApiMutation({ invalidate: [["inquiries"], ["customers"]], success: "결렬로 닫았다", onSuccess: onClose });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="결렬로 닫기"
      description="사유는 대시보드의 «결렬 사유» 집계에 들어간다"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="danger" disabled={!reason} loading={save.isPending} onClick={() => save.mutate({ path: `/api/inquiries/${inquiryId}`, method: "PATCH", body: { stage: "lost", lost_reason: reason } })}>
            결렬
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="결렬 사유">
        {LOST_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={cx("rounded-full border px-3 py-1.5 text-sm", reason === r ? "border-navy bg-navy text-navy-fg" : "border-line hover:bg-sunken")}
          >
            {r}
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function TourDialog({ open, onClose, iq, today }: { open: boolean; onClose: () => void; iq: InquiryDetail; today: string }) {
  const { rows } = useMatches(iq, today);
  const [at, setAt] = useState(`${plusDays(today, 1)}T14:00`);
  const [picked, setPicked] = useState<string[]>([]);
  const [memo, setMemo] = useState("");
  useEffect(() => {
    if (open) {
      setAt(`${plusDays(today, 1)}T14:00`);
      setPicked([]);
      setMemo("");
    }
  }, [open, today]);
  const save = useApiMutation({ invalidate: [["inquiries"]], success: "투어를 잡았다", onSuccess: onClose });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="투어 잡기"
      description="문의 단계면 «투어»로 넘어간다"
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!picked.length || !at} loading={save.isPending} onClick={() => save.mutate({ path: `/api/inquiries/${iq.id}/tours`, body: { at: `${at}:00+09:00`, unit_ids: picked, memo } })}>
            투어 잡기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="일시" htmlFor="tour-at">
          <Input id="tour-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </Field>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium text-ink2">보여줄 방 (추천 방 중에서)</legend>
          {rows === null ? (
            <Loading />
          ) : rows.length === 0 ? (
            <p className="text-sm text-ink3">추천할 빈 방이 없다</p>
          ) : (
            rows.map((m) => (
              <label key={m.unit_id} className="flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-2 text-sm hover:bg-sunken">
                <input type="checkbox" checked={picked.includes(m.unit_id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.unit_id] : p.filter((x) => x !== m.unit_id)))} />
                <b>{m.code}호</b>
                <span className="text-ink3">{[m.branch_name, m.type_name].filter(Boolean).join(" · ")}</span>
                <span className="num ml-auto">{m.rent ? man(m.rent) : "—"}</span>
              </label>
            ))
          )}
        </fieldset>
        <Field label="메모" htmlFor="tour-memo">
          <Input id="tour-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 부모님 동행" />
        </Field>
      </div>
    </Dialog>
  );
}

