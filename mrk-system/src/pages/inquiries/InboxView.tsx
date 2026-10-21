import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClipboardPaste, Link2, FilePlus2, StickyNote } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { CHANNEL } from "@/lib/codes";
import { cx, fmt, man, timeLabel } from "@/lib/format";
import { extract } from "@/mock/handlers/sales-extract";
import { Badge, Button, DataTable, Dialog, EmptyState, ErrorBox, Field, FormGrid, Input, Loading, Select, Sheet, Textarea, type Column } from "@/components/ui";
import type { Channel } from "@/types";
import type { ConversationDetail, ConversationRow, ExtractedFields } from "./model";
import { AttachmentChips, ReplyComposer } from "./ReplyComposer";

/** 읽은 조건을 짧은 칩으로 */
export function ExtractChips({ ex, compact }: { ex: ExtractedFields; compact?: boolean }) {
  const chips = [
    ex.move_in && `입주 ${fmt(ex.move_in.value, "M.d")}`,
    ex.months && `${ex.months.value}개월`,
    ex.budget && `월 ${man(ex.budget.value)}`,
    ex.people && `${ex.people.value}명`,
    !compact && ex.phone && ex.phone.value,
    !compact && ex.email && ex.email.value,
  ].filter(Boolean) as string[];
  if (!chips.length) return <span className="text-xs text-ink3">읽은 조건 없음</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className="num whitespace-nowrap rounded bg-info/10 px-1.5 py-0.5 text-[11px] text-info">
          {c}
        </span>
      ))}
    </span>
  );
}

/**
 * 미연결 대화 — 원본 메일 수신함 대체. 받은 메일·카톡을 붙여넣고, 맞는 상담·계약에 붙이거나 새 문의로 만든다.
 */
export function InboxView({ rows, loading, error, pasteOpen, setPasteOpen }: { rows: ConversationRow[]; loading: boolean; error: unknown; pasteOpen: boolean; setPasteOpen: (v: boolean) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const columns: Column<ConversationRow>[] = [
    { id: "at", header: "받은 시각", sort: (c) => c.last_activity_at, cell: (c) => <span className="num text-ink2">{timeLabel(c.last_activity_at)}</span> },
    {
      id: "from",
      header: "보낸 사람",
      sort: (c) => c.from_name,
      cell: (c) => (
        <div className="flex flex-col">
          <span className="font-medium">{c.from_name}</span>
          <span className="block max-w-[26ch] truncate text-xs text-ink3">{c.from_contact || "연락처 없음"}</span>
        </div>
      ),
    },
    {
      id: "subject",
      header: "제목 · 첫 문장",
      cell: (c) => (
        <div className="flex flex-col">
          <span className="block max-w-[34ch] truncate">{c.subject}</span>
          <span className="block max-w-[40ch] truncate text-xs text-ink3">{c.extracted.first_sentence ?? c.preview}</span>
        </div>
      ),
    },
    { id: "channel", header: "채널", cell: (c) => CHANNEL[c.channel], hideOnMobile: true },
    { id: "ex", header: "읽은 조건", cell: (c) => <ExtractChips ex={c.extracted} compact />, hideOnMobile: true },
    {
      id: "cand",
      header: "붙일 곳",
      sort: (c) => c.candidate_count,
      cell: (c) => (c.candidate_count ? <Badge tone="violet">후보 {c.candidate_count}</Badge> : <span className="text-xs text-ink3">새 문의</span>),
    },
  ];
  return (
    <>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="붙이지 않은 대화가 없다"
          body="메일·카톡·문자로 받은 내용을 붙여넣으면 여기 모인다. 맞는 상담이나 계약에 붙이거나 새 문의로 만든다."
          action={
            <Button variant="primary" icon={<ClipboardPaste className="size-4" />} onClick={() => setPasteOpen(true)}>
              대화 붙여넣기
            </Button>
          }
        />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} onRowClick={(c) => setOpenId(c.id)} selectedKey={openId} rowClassName={(c) => (c.awaiting ? "bg-warn/5" : undefined)} />
      )}
      <ConversationSheet id={openId} onClose={() => setOpenId(null)} />
      <PasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} onCreated={(id) => setOpenId(id)} />
    </>
  );
}

function ConversationSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const nav = useNavigate();
  const { branches } = useBranch();
  const q = useApi<ConversationDetail>(["inquiries", "conversation", id], id ? `/api/conversations/${id}` : null);
  const [branchId, setBranchId] = useState("");
  useEffect(() => setBranchId(q.data?.branch_id ?? ""), [q.data?.branch_id]);
  const inv = [["inquiries"], ["customers"], ["leases"]];
  const link = useApiMutation<{ inquiry_id?: string; lease_id?: string }>({
    invalidate: inv,
    success: (r) => (r.inquiry_id ? "상담에 붙였다" : "계약에 붙였다"),
    onSuccess: (r) => {
      onClose();
      if (r.inquiry_id) nav(`/inquiries/${r.inquiry_id}`);
    },
  });
  const make = useApiMutation<{ inquiry_id: string }>({
    invalidate: inv,
    success: "새 문의로 만들었다",
    onSuccess: (r) => {
      onClose();
      nav(`/inquiries/${r.inquiry_id}`);
    },
  });
  const c = q.data;
  return (
    <Sheet open={!!id} onClose={onClose} title={c ? c.subject : "대화"} subtitle={c ? `${c.from_name} · ${c.from_contact || "연락처 없음"} · ${CHANNEL[c.channel]}` : undefined} width="max-w-2xl">
      {q.isLoading || !c ? (
        <Loading />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            {c.messages.map((m) =>
              m.direction === "note" ? (
                <div key={m.id} className="rounded-md border border-dashed border-brass/60 bg-brass/5 px-3 py-2 text-sm">
                  <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-brass">
                    <StickyNote className="size-3" /> 내부 메모 · {m.author} · {timeLabel(m.at)}
                  </div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ) : (
                <div key={m.id} className={cx("flex flex-col", m.direction === "outbound" ? "items-end" : "items-start")}>
                  <div className={cx("max-w-[90%] whitespace-pre-wrap rounded-lg px-3.5 py-2 text-sm", m.direction === "outbound" ? "rounded-br-sm bg-navy text-navy-fg" : "rounded-bl-sm bg-sunken")}>
                    {m.subject && <div className="mb-1 text-xs font-semibold opacity-80">{m.subject}</div>}
                    {m.body}
                    <AttachmentChips files={m.attachments} inverted={m.direction === "outbound"} />
                  </div>
                  <span className="mt-1 text-[11px] text-ink3">
                    {m.author} · {timeLabel(m.at)}
                  </span>
                </div>
              ),
            )}
          </div>

          <section className="flex flex-col gap-2 rounded-md border border-line p-3">
            <div className="label-caps">메시지에서 읽은 조건</div>
            {c.extracted.first_sentence && <p className="border-l-2 border-line pl-2 text-sm text-ink2">«{c.extracted.first_sentence}»</p>}
            <ExtractChips ex={c.extracted} />
          </section>

          <section className="flex flex-col gap-2">
            <div className="label-caps">붙일 곳</div>
            {c.candidates.length === 0 ? (
              <p className="text-sm text-ink3">연락처·이름이 맞는 상담이나 계약이 없다. 새 문의로 만든다.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {c.candidates.map((k) => (
                  <li key={`${k.kind}-${k.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium">
                        <Badge tone={k.kind === "lease" ? "navy" : "info"} dot={false}>
                          {k.kind === "lease" ? "계약" : "상담"}
                        </Badge>
                        {k.title}
                      </div>
                      <div className="text-xs text-ink3">
                        {k.sub} · {k.reason}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      icon={<Link2 className="size-3.5" />}
                      loading={link.isPending}
                      onClick={() => link.mutate({ path: `/api/conversations/${c.id}/link`, body: k.kind === "lease" ? { lease_id: k.id } : { inquiry_id: k.id } })}
                    >
                      {k.kind === "lease" ? "이 계약에 붙이기" : "이 상담에 붙이기"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-line p-3">
              <Field label="희망 지점" htmlFor="inbox-branch" className="w-48">
                <Select id="inbox-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} placeholder="정하지 않음" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
              </Field>
              <Button variant="primary" icon={<FilePlus2 className="size-4" />} loading={make.isPending} onClick={() => make.mutate({ path: `/api/conversations/${c.id}/to-inquiry`, body: { branch_id: branchId || null } })}>
                문의로 만들기
              </Button>
              <span className="text-xs text-ink3">읽은 입주일·기간·예산을 채워 만든다</span>
            </div>
          </section>

          <section className="-mx-5 border-t border-line">
            <ReplyComposer
              postPath={`/api/conversations/${c.id}/messages`}
              invalidate={[["inquiries"]]}
              branchId={c.branch_id}
              to={{ name: c.from_name, email: c.from_contact.includes("@") ? c.from_contact : c.extracted.email?.value ?? null }}
              vars={{ 이름: c.from_name, 입주일: c.extracted.move_in ? fmt(c.extracted.move_in.value, "M월 d일") : "희망하신 날짜" }}
              defaultSubject={c.subject.startsWith("Re:") ? c.subject : `Re: ${c.subject}`}
            />
          </section>
        </div>
      )}
    </Sheet>
  );
}

const PASTE_CHANNELS: Channel[] = ["email", "kakao", "phone", "web", "platform"];

function PasteDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { branchId, branches, today } = useBranch();
  const [f, setF] = useState({ from_name: "", from_contact: "", channel: "email" as Channel, subject: "", body: "", branch_id: "" });
  useEffect(() => {
    if (open) setF({ from_name: "", from_contact: "", channel: "email", subject: "", body: "", branch_id: branchId === "all" ? "" : branchId });
  }, [open, branchId]);
  const ex = useMemo(() => extract([f.subject, f.body].join("\n"), today), [f.subject, f.body, today]);
  const save = useApiMutation<ConversationRow>({
    invalidate: [["inquiries"]],
    success: "대화를 붙여넣었다",
    onSuccess: (r) => {
      onClose();
      onCreated(r.id);
    },
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="대화 붙여넣기"
      description="메일·카톡·문자로 받은 내용을 그대로 붙여넣는다. 연락처가 맞는 상담·계약을 찾아 주고, 입주일·기간·예산을 읽어 둔다."
      footer={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!f.body.trim()} loading={save.isPending} onClick={() => save.mutate({ path: "/api/conversations", body: { ...f, branch_id: f.branch_id || null } })}>
            붙여넣기
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
        <FormGrid cols={3}>
          <Field label="보낸 사람" htmlFor="paste-name">
            <Input id="paste-name" value={f.from_name} onChange={up("from_name")} placeholder="이름 또는 회사" />
          </Field>
          <Field label="연락처" htmlFor="paste-contact" hint="메일 주소나 전화">
            <Input id="paste-contact" value={f.from_contact} onChange={up("from_contact")} placeholder="a@b.com · 010-…" />
          </Field>
          <Field label="채널" htmlFor="paste-channel">
            <Select id="paste-channel" value={f.channel} onChange={up("channel")} options={PASTE_CHANNELS.map((c) => ({ value: c, label: c === "phone" ? "전화·문자" : CHANNEL[c] }))} />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label="제목" htmlFor="paste-subject" hint="비우면 첫 문장으로">
            <Input id="paste-subject" value={f.subject} onChange={up("subject")} />
          </Field>
          <Field label="지점" htmlFor="paste-branch">
            <Select id="paste-branch" value={f.branch_id} onChange={up("branch_id")} placeholder="정하지 않음" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
        </FormGrid>
        <Field label="받은 내용" htmlFor="paste-body">
          <Textarea id="paste-body" rows={7} value={f.body} onChange={up("body")} placeholder="고객이 보낸 글을 그대로 붙여넣는다" autoFocus />
        </Field>
        {f.body.trim() && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-sunken/50 px-3 py-2 text-xs">
            <span className="text-ink3">읽은 조건</span>
            <ExtractChips ex={ex} />
          </div>
        )}
      </form>
    </Dialog>
  );
}
