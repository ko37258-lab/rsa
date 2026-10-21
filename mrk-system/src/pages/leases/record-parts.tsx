import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileUp, Paperclip, Trash2, UserPlus, X } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { storeFile, fileUrl, deleteFile, fileSize } from "@/lib/files";
import { cx, fmt, timeLabel, won } from "@/lib/format";
import { CHANNEL, NATIONALITY } from "@/lib/codes";
import { Badge, Button, Dialog, EmptyState, ErrorBox, Field, FormGrid, Input, Loading, Section, Segmented, Select, Textarea, useToast } from "@/components/ui";
import type { Channel, FileRef, Message, PartyCard } from "@/types";
import { CustomerPicker } from "./CustomerPicker";
import { MONEY_KEYS, type GapRow, type LeaseConversation, type LeaseDetail } from "./types";
import { CopyButton, CopyFallback, PartyName, ROLE_LABEL, useCopy } from "./parts";

// ── 서명 요청(모두싸인 대체) ─────────────────────────────────

/** 계약자에게 보낼 서명 안내 글 */
export function signMessage(l: LeaseDetail): string {
  const who = l.contractor?.name ?? "계약자";
  return [
    `${who}님, 안녕하세요. ${l.branch_name}입니다.`,
    ``,
    `${l.unit_code}호 임대차 계약서를 보내드립니다.`,
    `· 기간: ${fmt(l.start_date)} ~ ${fmt(l.end_date)}`,
    `· 월세 ${won(l.rent)}${l.mgmt_fee ? ` · 관리비 ${won(l.mgmt_fee)}` : ""}`,
    l.renewal_of ? `· 보증금은 지금 계약에서 그대로 이어집니다` : `· 보증금 ${won(l.deposit + l.mgmt_deposit)} (계약금 ${won(l.contract_fee)})`,
    ``,
    `첨부한 계약서를 확인하시고 서명란에 서명하신 뒤, 서명한 계약서(사진이나 PDF)를 이 대화로 보내 주세요.`,
    `서명을 받으면 ${l.renewal_of ? "재계약이" : "계약금 안내와 함께 계약이"} 확정됩니다.`,
  ].join("\n");
}

export function SignRequestDialog({ lease: l, onClose }: { lease: LeaseDetail; onClose: () => void }) {
  const text = signMessage(l);
  const { copy, fallback, clear } = useCopy();
  const go = useApiMutation({ invalidate: MONEY_KEYS, success: "서명 안내를 복사하고 서명 대기로 바꿨다", onSuccess: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${l.unit_code}호 · 서명 요청`}
      description="계약서를 인쇄·PDF로 저장해 아래 안내 글과 함께 카카오톡이나 메일로 보낸다. 서명본을 받으면 「서명본 올리기」로 계약에 붙이고 체결한다."
      footer={
        <>
          {go.error && <p className="mr-auto self-center text-xs text-bad">{go.error.message}</p>}
          <Button onClick={onClose}>닫기</Button>
          <a href={`#/print/lease/${l.id}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded border border-line bg-surface px-3.5 text-sm font-medium hover:bg-sunken">
            <ExternalLink className="size-3.5" />
            계약서 열기
          </a>
          <Button
            variant="primary"
            loading={go.isPending}
            onClick={async () => {
              await copy(text);
              if (l.status === "draft") go.mutate({ path: `/api/leases/${l.id}/transition`, body: { to: "awaiting_signature" } });
              else onClose();
            }}
          >
            {l.status === "draft" ? "안내 복사 · 서명 대기로" : "안내 복사"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Textarea id="sign-msg" rows={10} readOnly value={text} onFocus={(e) => e.currentTarget.select()} />
        {fallback && <CopyFallback text={fallback} onClose={clear} />}
      </div>
    </Dialog>
  );
}

// ── 서명본 ─────────────────────────────────────────────

async function openFile(f: FileRef, onMissing: () => void) {
  const url = await fileUrl(f.id);
  if (!url) return onMissing();
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function SignedCopyDialog({ lease: l, onClose }: { lease: LeaseDetail; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [conclude, setConclude] = useState(l.status === "awaiting_signature" || l.status === "draft");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const add = useApiMutation({ invalidate: MONEY_KEYS });
  const go = useApiMutation({ invalidate: MONEY_KEYS });
  const toast = useToast();
  const canConclude = l.status === "awaiting_signature" || l.status === "draft";
  const submit = async () => {
    if (!file) return setErr("서명한 계약서 파일을 고른다");
    if (file.size > 20 * 1024 * 1024) return setErr("20MB 보다 큰 파일은 올리지 않는다");
    setErr(null);
    setBusy(true);
    try {
      const ref = await storeFile(file, file.name, "signed_copy");
      await add.mutateAsync({ path: `/api/leases/${l.id}/signed-copies`, body: { file: ref } });
      if (conclude && canConclude) {
        if (l.status === "draft") await go.mutateAsync({ path: `/api/leases/${l.id}/transition`, body: { to: "awaiting_signature" } });
        await go.mutateAsync({ path: `/api/leases/${l.id}/transition`, body: { to: "concluded", reason: "서명본 받음" } });
        toast.show("서명본을 붙이고 체결했다", "good");
      } else toast.show("서명본을 올렸다", "good");
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "올리지 못했다");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`${l.unit_code}호 · 서명본 올리기`}
      description="계약자가 서명한 계약서(PDF·사진)를 계약에 붙인다. 파일은 이 브라우저에 보관된다."
      footer={
        <>
          {err && <p className="mr-auto self-center text-xs text-bad">{err}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" loading={busy} onClick={submit}>
            올리기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="서명한 계약서" htmlFor="signed-file" hint="PDF, JPG, PNG · 20MB 까지">
          <input id="signed-file" type="file" accept="application/pdf,image/*" className="field py-1.5" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        {file && (
          <p className="text-xs text-ink2">
            {file.name} · {fileSize(file.size)}
          </p>
        )}
        {canConclude && (
          <label className="flex items-center gap-2 text-sm text-ink2">
            <input id="signed-conclude" type="checkbox" checked={conclude} onChange={(e) => setConclude(e.target.checked)} className="size-4 accent-[rgb(var(--navy))]" />
            서명 완료로 체결 처리(계약금·잔금과 이번 달 청구가 발송 대기에 들어간다)
          </label>
        )}
      </div>
    </Dialog>
  );
}

export function SignedCopies({ lease: l, onUpload }: { lease: LeaseDetail; onUpload: () => void }) {
  const q = useApi<FileRef[]>(["leases", "signed", l.id], `/api/leases/${l.id}/signed-copies`);
  const del = useApiMutation({ invalidate: [["leases"]], success: "서명본을 지웠다" });
  const toast = useToast();
  const [ask, setAsk] = useState<string | null>(null);
  const files = q.data ?? l.signed_copies ?? [];
  return (
    <Section title="서명본" hint="모두싸인 대신 서명한 계약서를 직접 붙인다" actions={<Button size="sm" icon={<FileUp className="size-3.5" />} onClick={onUpload}>서명본 올리기</Button>}>
      {q.isError ? (
        <ErrorBox error={q.error} />
      ) : files.length === 0 ? (
        <p className="text-sm text-ink3">{l.signed_at ? "서명은 기록됐지만 서명본 파일이 없다" : "아직 서명본이 없다"}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2">
              <Paperclip className="size-4 shrink-0 text-ink3" />
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => openFile(f, () => toast.show("이 브라우저에 파일이 없다. 올린 기기에서 연다", "bad"))}>
                {f.name}
              </button>
              <span className="num shrink-0 text-xs text-ink3">
                {fileSize(f.size)} · {fmt(f.created_at, "yy.M.d")}
              </span>
              {ask === f.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="danger"
                    loading={del.isPending}
                    onClick={async () => {
                      await del.mutateAsync({ path: `/api/leases/${l.id}/signed-copies/${f.id}`, method: "DELETE" });
                      await deleteFile(f.id);
                      setAsk(null);
                    }}
                  >
                    지우기
                  </Button>
                  <Button size="sm" onClick={() => setAsk(null)}>
                    그만
                  </Button>
                </span>
              ) : (
                <button type="button" aria-label="서명본 지우기" className="shrink-0 rounded p-1.5 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => setAsk(f.id)}>
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ── 당사자 ─────────────────────────────────────────────

export function PartiesSection({ lease: l }: { lease: LeaseDetail }) {
  const [adding, setAdding] = useState(false);
  const [payerEdit, setPayerEdit] = useState(false);
  const del = useApiMutation({ invalidate: [["leases"], ["customers"]], success: "입주자를 뺐다" });
  return (
    <Section
      title="사람"
      hint="계약자·납부자·함께 사는 사람"
      actions={
        <>
          <Button size="sm" onClick={() => setPayerEdit(true)}>
            납부자 바꾸기
          </Button>
          <Button size="sm" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)}>
            입주자 더하기
          </Button>
        </>
      }
    >
      <ul className="flex flex-col divide-y divide-line">
        {l.parties.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <Link to={`/customers/${p.id}`} className="min-w-0 hover:underline">
              <PartyName party={p} />
            </Link>
            <span className="flex gap-1">
              {p.roles.map((r) => (
                <Badge key={r} tone={r === "contractor" ? "navy" : r === "payer" ? "brass" : "neutral"} dot={false}>
                  {ROLE_LABEL[r]}
                </Badge>
              ))}
            </span>
            <span className="num min-w-0 flex-1 truncate text-xs text-ink3">
              {[p.phone, p.email, NATIONALITY[p.nationality] ?? p.nationality].filter(Boolean).join(" · ")}
            </span>
            {p.roles.length === 1 && p.roles[0] === "occupant" && (
              <button type="button" aria-label={`${p.name} 빼기`} className="rounded p-1 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => del.mutate({ path: `/api/leases/${l.id}/parties/${p.id}`, method: "DELETE" })}>
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {adding && <AddOccupantDialog leaseId={l.id} onClose={() => setAdding(false)} />}
      {payerEdit && <PayerDialog lease={l} onClose={() => setPayerEdit(false)} />}
    </Section>
  );
}

function AddOccupantDialog({ leaseId, onClose }: { leaseId: string; onClose: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pick, setPick] = useState<PartyCard | null>(null);
  const [n, setN] = useState({ name: "", phone: "", email: "", nationality: "KR" });
  const add = useApiMutation({ invalidate: [["leases"], ["customers"]], success: "입주자를 더했다", onSuccess: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title="입주자 더하기"
      footer={
        <>
          {add.error && <p className="mr-auto self-center text-xs text-bad">{add.error.message}</p>}
          <Button onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            loading={add.isPending}
            disabled={mode === "existing" ? !pick : !n.name.trim()}
            onClick={() => add.mutate({ path: `/api/leases/${leaseId}/parties`, body: mode === "existing" ? { party_id: pick?.id, role: "occupant" } : { new: n, role: "occupant" } })}
          >
            더하기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: "existing", label: "기존 고객" }, { value: "new", label: "새 사람" }]} />
        {mode === "existing" ? (
          <CustomerPicker id="occ-pick" value={pick} onChange={setPick} />
        ) : (
          <FormGrid>
            <Field label="이름" htmlFor="occ-name">
              <Input id="occ-name" value={n.name} onChange={(e) => setN((x) => ({ ...x, name: e.target.value }))} />
            </Field>
            <Field label="전화" htmlFor="occ-phone">
              <Input id="occ-phone" value={n.phone} onChange={(e) => setN((x) => ({ ...x, phone: e.target.value }))} />
            </Field>
            <Field label="이메일" htmlFor="occ-email">
              <Input id="occ-email" type="email" value={n.email} onChange={(e) => setN((x) => ({ ...x, email: e.target.value }))} />
            </Field>
            <Field label="국적" htmlFor="occ-nat">
              <Select id="occ-nat" value={n.nationality} onChange={(e) => setN((x) => ({ ...x, nationality: e.target.value }))} options={Object.entries(NATIONALITY).map(([value, label]) => ({ value, label }))} />
            </Field>
          </FormGrid>
        )}
      </div>
    </Dialog>
  );
}

function PayerDialog({ lease: l, onClose }: { lease: LeaseDetail; onClose: () => void }) {
  const [pick, setPick] = useState<PartyCard | null>(null);
  const save = useApiMutation({ invalidate: MONEY_KEYS, success: "납부자를 바꿨다", onSuccess: onClose });
  const sameAsContractor = l.payer?.id === l.contractor?.id;
  return (
    <Dialog
      open
      onClose={onClose}
      title="납부자 바꾸기"
      description="아직 안 보낸 청구는 새 납부자에게 간다. 이미 보낸 청구서는 그대로다."
      footer={
        <>
          {save.error && <p className="mr-auto self-center text-xs text-bad">{save.error.message}</p>}
          {!sameAsContractor && l.contractor && (
            <Button className="mr-auto" onClick={() => save.mutate({ path: `/api/leases/${l.id}`, method: "PATCH", body: { payer_id: l.contractor?.id } })}>
              계약자로 되돌리기
            </Button>
          )}
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!pick} loading={save.isPending} onClick={() => save.mutate({ path: `/api/leases/${l.id}`, method: "PATCH", body: { payer_id: pick?.id } })}>
            바꾸기
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-ink2">
          지금 납부자: <span className="font-medium text-ink">{l.payer?.name}</span>
          {sameAsContractor && <span className="text-ink3"> (계약자와 같음)</span>}
        </p>
        <CustomerPicker id="payer-pick" value={pick} onChange={setPick} />
      </div>
    </Dialog>
  );
}

// ── 계약 대화 ───────────────────────────────────────────

const DIRECTION: Record<Message["direction"], { label: string; tone: "neutral" | "info" | "brass" }> = {
  inbound: { label: "받음", tone: "info" },
  outbound: { label: "보냄", tone: "neutral" },
  note: { label: "내부 메모", tone: "brass" },
};

export function ConversationsTab({ lease: l }: { lease: LeaseDetail }) {
  const q = useApi<LeaseConversation[]>(["leases", "conversations", l.id], `/api/leases/${l.id}/conversations`);
  const [direction, setDirection] = useState<Message["direction"]>("inbound");
  const [via, setVia] = useState<Channel>("kakao");
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const add = useApiMutation({
    invalidate: [["leases", "conversations", l.id]],
    success: direction === "inbound" ? "받은 메시지를 붙였다" : direction === "note" ? "메모를 남겼다" : "보낸 메시지를 기록했다",
    onSuccess: () => {
      setBody("");
      setSubject("");
    },
  });
  const messages = (q.data ?? [])
    .flatMap((c) => c.messages.map((m) => ({ ...m, channel: c.channel, conv: c.subject })))
    .sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Section title="대화" hint="이 계약의 입주자와 나눈 메시지. 카톡·문자·메일로 받은 내용을 붙여 남긴다" bodyClassName="p-0">
        {q.isLoading ? (
          <Loading />
        ) : q.isError ? (
          <div className="p-4"><ErrorBox error={q.error} /></div>
        ) : messages.length === 0 ? (
          <div className="p-4">
            <EmptyState title="아직 대화가 없다" body="「남기기」에서 받은 메시지를 붙이거나 보낸 메시지를 기록한다" />
          </div>
        ) : (
          <ol className="flex max-h-[560px] flex-col gap-3 overflow-y-auto p-4">
            {messages.map((m) => (
              <li key={m.id} className={cx("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                <div
                  className={cx(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.direction === "outbound" ? "bg-navy text-navy-fg" : m.direction === "note" ? "border border-dashed border-brass/60 bg-brass/5" : "bg-sunken",
                  )}
                >
                  {m.subject && <div className="mb-0.5 text-xs font-semibold opacity-80">{m.subject}</div>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className={cx("mt-1 flex flex-wrap items-center gap-1.5 text-[11px]", m.direction === "outbound" ? "opacity-75" : "text-ink3")}>
                    <span>{DIRECTION[m.direction].label}</span>·<span>{CHANNEL[m.via] ?? m.via}</span>·<span>{m.author}</span>·<span className="num">{timeLabel(m.at)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Section>
      <Section title="남기기">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate({ path: `/api/leases/${l.id}/conversations`, body: { direction, via, body, subject: subject || undefined } });
          }}
        >
          <Segmented<Message["direction"]>
            size="sm"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "inbound", label: "받은 메시지" },
              { value: "outbound", label: "보낸 메시지" },
              { value: "note", label: "내부 메모" },
            ]}
          />
          {direction !== "note" && (
            <Field label="채널" htmlFor="lc-conv-via">
              <Select id="lc-conv-via" value={via} onChange={(e) => setVia(e.target.value as Channel)} options={(["kakao", "email", "phone", "visit", "web"] as Channel[]).map((c) => ({ value: c, label: CHANNEL[c] }))} />
            </Field>
          )}
          {via === "email" && direction !== "note" && (
            <Field label="제목" htmlFor="lc-conv-subject">
              <Input id="lc-conv-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
          )}
          <Field label={direction === "inbound" ? "받은 내용(붙여넣기)" : direction === "outbound" ? "보낼 내용" : "메모"} htmlFor="lc-conv-body" hint={direction === "outbound" ? "「복사」로 복사해 카톡·문자에 붙여 보낸 뒤 「기록」한다" : undefined}>
            <Textarea ref={ref} id="lc-conv-body" rows={6} value={body} onChange={(e) => setBody(e.target.value)} placeholder={direction === "inbound" ? "입주자가 보낸 메시지를 그대로 붙인다" : ""} />
          </Field>
          <div className="flex flex-wrap justify-end gap-2">
            {direction === "outbound" && body.trim() && <CopyButton text={body} label="본문 복사" />}
            <Button type="submit" variant="primary" loading={add.isPending} disabled={!body.trim()}>
              {direction === "inbound" ? "붙이기" : "기록"}
            </Button>
          </div>
          {add.error && <p className="text-xs text-bad">{add.error.message}</p>}
        </form>
      </Section>
    </div>
  );
}

// ── 청구 빠진 기간(청구 영역 API) ─────────────────────────────

export function GapsSection({ leaseId }: { leaseId: string }) {
  const { today } = useBranch();
  const q = useApi<{ gaps: GapRow[] }>(["billing", "gaps", leaseId], `/api/billing/leases/${leaseId}/gaps`);
  const fill = useApiMutation<{ created: number }>({ invalidate: MONEY_KEYS, success: (r) => `빠진 청구 ${r?.created ?? 0}줄을 만들었다` });
  if (q.isLoading || q.isError) return null; // 청구 영역이 아직이면 조용히 숨긴다
  const gaps = q.data?.gaps ?? [];
  if (!gaps.length) return null;
  return (
    <Section
      title="청구 빠진 기간"
      hint="계약 기간인데 청구가 없는 달. 청구일이 지났거나 이번 달까지인 것만 보인다"
      actions={
        <Button size="sm" variant="primary" loading={fill.isPending} onClick={() => fill.mutate({ path: `/api/billing/leases/${leaseId}/gaps/fill` })}>
          빠진 청구 만들기
        </Button>
      }
    >
      <ul className="flex flex-col divide-y divide-line text-sm">
        {gaps.map((g, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              {g.label}
              <span className="num ml-2 text-xs text-ink3">
                {fmt(g.period_from, "yy.M.d")} ~ {fmt(g.period_to, "M.d")} · 청구일 {fmt(g.bill_date, "M.d")}
                {g.bill_date < today ? " (지남)" : ""}
              </span>
            </span>
            <span className="num font-medium">{won(g.amount)}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
