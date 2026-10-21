import { useMemo, useRef, useState } from "react";
import type { QueryKey } from "@tanstack/react-query";
import { Paperclip, Send, StickyNote, Copy, Mail, X, Upload } from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi, useApiMutation } from "@/lib/hooks";
import { cx } from "@/lib/format";
import { storeFile, fileUrl, fileSize } from "@/lib/files";
import { Button, Input, Segmented, Textarea, useToast } from "@/components/ui";
import type { FileRef, Message, PreparedFile, Signature } from "@/types";

interface Template {
  id: string;
  title: string;
  shortcut: string;
  body: string;
}

type SigLang = "ko" | "en" | "none";

/**
 * 답장 입력창 — 원본 PMS 의 답장 입력창을 메일 연동 없이 옮긴 것.
 * 서명(한국어 · English · 없음), 정형 답변(목록 또는 «/단축어»), 첨부(준비된 파일 · 새 파일),
 * 보내는 방법(기록만 · 메일 앱으로 · 본문 복사). 어느 쪽이든 보낸 답장으로 기록된다.
 */
export function ReplyComposer({
  postPath,
  invalidate,
  branchId,
  to,
  vars,
  defaultSubject = "",
  allowNote = true,
}: {
  postPath: string;
  invalidate: QueryKey[];
  branchId: string | null;
  to: { name: string; email: string | null };
  vars: Record<string, string>;
  defaultSubject?: string;
  allowNote?: boolean;
}) {
  const { branches, me } = useBranch();
  const toast = useToast();
  const [mode, setMode] = useState<"outbound" | "note">("outbound");
  const [text, setText] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [sig, setSig] = useState<SigLang>("ko");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const [pickFile, setPickFile] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const b = branchId ?? "all";
  const tpl = useApi<Template[]>(["materials", "templates", b], `/api/reply-templates?branch_id=${b}`);
  const sigs = useApi<Signature[]>(["materials", "signatures", b], `/api/reply-signatures?branch_id=${b}`);
  const prepared = useApi<PreparedFile[]>(["materials", "files", b], `/api/prepared-files?branch_id=${b}`);
  const branch = branches.find((x) => x.id === branchId) ?? null;

  // 자리 채우기 — 원본 서명·정형 답변의 {자리}
  const fields: Record<string, string> = useMemo(
    () => ({
      지점명: branch?.name ?? "",
      "지점 영문": branch?.name_en ?? "",
      "지점 주소": branch?.address ?? "",
      "지점 영문 주소": branch?.address ?? "",
      "지점 받는 메일 주소": branch?.email ?? "",
      "보내는 직원": me?.name ?? "",
      ...vars,
    }),
    [branch, me, vars],
  );
  const fill = (s: string) => s.replace(/\{([^{}]+)\}/g, (m, k: string) => fields[k] ?? m);

  // 지점 서명이 있으면 공통 대신. {지점명} 이 비면 그 서명은 못 고르고, 다른 자리가 비면 그 줄만 뺀다
  const signature = useMemo(() => {
    const list = sigs.data ?? [];
    return list.find((x) => x.branch_id === branchId) ?? list.find((x) => x.branch_id === null) ?? null;
  }, [sigs.data, branchId]);
  const renderSig = (body: string | null | undefined): string | null => {
    if (!body) return null;
    if (/\{지점명\}/.test(body) && !fields.지점명) return null;
    return body
      .split("\n")
      .filter((line) => !/\{([^{}]+)\}/.test(line) || [...line.matchAll(/\{([^{}]+)\}/g)].every((m) => fields[m[1]]))
      .map(fill)
      .join("\n")
      .trim();
  };
  const sigKo = renderSig(signature?.body_ko);
  const sigEn = renderSig(signature?.body_en);
  const sigText = mode === "note" ? null : sig === "ko" ? sigKo : sig === "en" ? sigEn : null;
  const fullBody = [text.trim(), sigText].filter(Boolean).join("\n\n");

  // «/단축어» — 줄 맨 앞의 /로 시작하는 단어
  const slash = /(?:^|\n)\/(\S*)$/.exec(text);
  const slashHits = slash ? (tpl.data ?? []).filter((t) => !slash[1] || t.shortcut.includes(slash[1]) || t.title.includes(slash[1])).slice(0, 6) : [];
  const insert = (t: Template) => {
    const body = fill(t.body);
    setText((prev) => (slash ? prev.replace(/\/(\S*)$/, body) : (prev ? `${prev}\n\n` : "") + body));
    setTimeout(() => area.current?.focus(), 0);
  };

  const send = useApiMutation<Message>({
    invalidate,
    success: (m) => (m.direction === "note" ? "내부 메모를 남겼다" : "보낸 답장으로 기록했다"),
    onSuccess: () => {
      setText("");
      setFiles([]);
      setPickFile(false);
    },
  });
  const record = (via: Message["via"] = "email") =>
    send.mutate({
      path: postPath,
      body: { direction: mode, body: mode === "note" ? text.trim() : fullBody, via, subject: mode === "note" ? null : subject || null, attachments: mode === "note" ? [] : files },
    });

  const mailto = to.email ? `mailto:${encodeURIComponent(to.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullBody + (files.length ? `\n\n첨부: ${files.map((f) => f.name).join(", ")}` : ""))}` : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullBody);
      toast.show("본문을 복사했다 · 카톡이나 문자에 붙여넣는다", "good");
      record("kakao");
    } catch {
      setCopyFallback(fullBody);
    }
  };

  const addFile = async (f: File | undefined) => {
    if (!f) return;
    const ref = await storeFile(f, f.name, "attachment");
    setFiles((xs) => [...xs, ref]);
  };
  const addPrepared = (p: PreparedFile) => {
    const mime = p.kind === "pdf" ? "application/pdf" : p.kind === "image" ? "image/*" : "application/octet-stream";
    setFiles((xs) => (xs.some((x) => x.id === (p.file_id ?? p.id)) ? xs : [...xs, { id: p.file_id ?? p.id, name: p.name, size: p.size, mime, kind: "prepared", created_at: p.updated_at }]));
    setPickFile(false);
  };

  const canSend = mode === "note" ? !!text.trim() : !!fullBody;

  return (
    <form
      className="flex flex-col gap-2 border-t border-line px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) record();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {allowNote ? (
          <Segmented<"outbound" | "note">
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: "outbound", label: "답장" },
              { value: "note", label: "내부 메모" },
            ]}
          />
        ) : (
          <span className="text-xs font-medium text-ink2">답장</span>
        )}
        {mode === "outbound" && (tpl.data ?? []).length > 0 && (
          <select
            aria-label="정형 답변 넣기"
            className="field h-8 w-auto max-w-[220px] text-[13px]"
            value=""
            onChange={(e) => {
              const t = tpl.data?.find((x) => x.id === e.target.value);
              if (t) insert(t);
            }}
          >
            <option value="">정형 답변 넣기 (또는 /)</option>
            {tpl.data!.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} · /{t.shortcut}
              </option>
            ))}
          </select>
        )}
      </div>

      {mode === "outbound" && (
        <Input id={`subject-${postPath}`} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="제목(메일로 보낼 때)" className="h-8 text-[13px]" />
      )}

      <div className="relative">
        <Textarea
          ref={area}
          id={`compose-${postPath}`}
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mode === "note" ? "팀만 보는 메모" : `${to.name}에게 보낼 답장 · 줄 맨 앞에 / 를 치면 정형 답변을 고른다`}
          className={mode === "note" ? "border-brass/50" : undefined}
        />
        {mode === "outbound" && slash && slashHits.length > 0 && (
          <ul className="absolute left-2 right-2 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-xl" role="listbox" aria-label="정형 답변">
            {slashHits.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => insert(t)} className="flex w-full flex-col rounded px-2.5 py-1.5 text-left hover:bg-sunken">
                  <span className="text-sm font-medium">
                    {t.title} <span className="text-xs text-ink3">/{t.shortcut}</span>
                  </span>
                  <span className="truncate text-xs text-ink3">{t.body.replace(/\s+/g, " ")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "outbound" && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-ink3">서명</span>
            <Segmented<SigLang>
              size="sm"
              value={sig === "en" && !sigEn ? "ko" : sig}
              onChange={(v) => {
                if (v === "en" && !sigEn) return toast.show("English 서명이 없다 · 응대 자료에서 만든다", "info");
                if (v === "ko" && !sigKo) return toast.show("한국어 서명을 쓸 수 없다(지점명이 비었다)", "info");
                setSig(v);
              }}
              options={[
                { value: "ko", label: "한국어" },
                { value: "en", label: sigEn ? "English" : "English 없음" },
                { value: "none", label: "없음" },
              ]}
            />
            <span className="mx-1 h-4 w-px bg-line" />
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-ink2 hover:bg-sunken" onClick={() => setPickFile((x) => !x)}>
              <Paperclip className="size-3.5" /> 준비된 파일
            </button>
            <button type="button" className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-ink2 hover:bg-sunken" onClick={() => upload.current?.click()}>
              <Upload className="size-3.5" /> 파일 올리기
            </button>
            <input ref={upload} type="file" className="hidden" onChange={(e) => (void addFile(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
          {pickFile && (
            <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto rounded-md border border-line p-1">
              {(prepared.data ?? []).length === 0 && <p className="px-2 py-1.5 text-xs text-ink3">준비된 파일이 없다 · 응대 자료에서 올린다</p>}
              {(prepared.data ?? []).map((p) => (
                <button key={p.id} type="button" onClick={() => addPrepared(p)} className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-sunken">
                  <span className="truncate">{p.name}</span>
                  <span className="num shrink-0 text-xs text-ink3">{fileSize(p.size)}</span>
                </button>
              ))}
            </div>
          )}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {files.map((f) => (
                <span key={f.id} className="inline-flex items-center gap-1 rounded border border-line bg-sunken px-2 py-0.5 text-xs">
                  <Paperclip className="size-3 text-ink3" />
                  {f.name}
                  <button type="button" aria-label={`${f.name} 빼기`} onClick={() => setFiles((xs) => xs.filter((x) => x.id !== f.id))} className="text-ink3 hover:text-bad">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          {sigText && <pre className="whitespace-pre-wrap rounded border border-dashed border-line px-2.5 py-1.5 font-sans text-xs text-ink3">{sigText}</pre>}
        </>
      )}

      {copyFallback !== null && (
        <div className="flex flex-col gap-1.5 rounded-md border border-warn/50 bg-warn/5 p-2">
          <p className="text-xs text-ink2">이 화면에서는 자동 복사가 막혀 있다. 아래 글을 길게 눌러 복사한 뒤 «복사했다»를 누른다.</p>
          <textarea readOnly className="field h-28 py-2 text-xs" value={copyFallback} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex justify-end gap-2">
            <Button size="sm" onClick={() => setCopyFallback(null)}>
              닫기
            </Button>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setCopyFallback(null);
                record("kakao");
              }}
            >
              복사했다 · 기록
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {mode === "outbound" && to.email && (
          <span className="mr-auto min-w-0 select-all truncate text-xs text-ink3" title="메일 앱이 안 열리면 이 주소로 직접 보낸다">
            받는 사람 {to.email}
          </span>
        )}
        {mode === "outbound" ? (
          <>
            <Button size="sm" icon={<Copy className="size-3.5" />} disabled={!canSend || send.isPending} onClick={() => void copy()}>
              본문 복사
            </Button>
            {mailto && (
              <a
                href={canSend ? mailto : undefined}
                onClick={(e) => {
                  if (!canSend) return e.preventDefault();
                  record("email");
                }}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded border border-line bg-surface px-2.5 text-[13px] font-medium text-ink hover:bg-sunken",
                  !canSend && "pointer-events-none opacity-50",
                )}
              >
                <Mail className="size-3.5" /> 메일 앱으로 보내기
              </a>
            )}
            <Button type="submit" variant="primary" size="sm" icon={<Send className="size-3.5" />} loading={send.isPending} disabled={!canSend}>
              기록만
            </Button>
          </>
        ) : (
          <Button type="submit" variant="brass" size="sm" icon={<StickyNote className="size-3.5" />} loading={send.isPending} disabled={!canSend}>
            메모 남기기
          </Button>
        )}
      </div>
    </form>
  );
}

/** 메시지에 붙은 파일 — 누르면 이 브라우저에 있는 파일을 새 탭에서 연다 */
export function AttachmentChips({ files, inverted }: { files: FileRef[] | undefined; inverted?: boolean }) {
  const toast = useToast();
  if (!files?.length) return null;
  const open = async (f: FileRef) => {
    const url = await fileUrl(f.id);
    if (!url) return toast.show(`«${f.name}» 내용은 이 브라우저에 없다 · 이름만 기록돼 있다`, "info");
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    a.click();
  };
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {files.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => void open(f)}
          className={cx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] underline-offset-2 hover:underline", inverted ? "bg-navy-fg/15" : "bg-surface")}
        >
          <Paperclip className="size-3" />
          {f.name}
          <span className="opacity-70">{fileSize(f.size)}</span>
        </button>
      ))}
    </div>
  );
}
