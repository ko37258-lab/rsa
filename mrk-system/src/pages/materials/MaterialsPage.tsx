import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil, Trash2, Upload, FileText, FileImage, File as FileIcon } from "lucide-react";
import { PageHeader, Segmented, SearchBox, Badge, Button, Dialog, Field, FormGrid, Input, Select, Loading, ErrorBox, EmptyState, KeyValue, DataTable, IconButton, useToast, type Column } from "@/components/ui";
import { useApi, useApiMutation } from "@/lib/hooks";
import { api } from "@/api/client";
import { useBranch, type BranchWithCount } from "@/lib/branch";
import { cx, fmt } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import type { PreparedFile, ReplyTemplate, Signature } from "@/types";

type View = "templates" | "files" | "signatures" | "branch";

const TEMPLATE_SLOTS = ["지점명", "지점 영문", "지점 주소", "이름", "입주일", "투어일시", "청구월", "금액", "보내는 직원"];
const SIGNATURE_SLOTS = ["보내는 직원", "지점명", "지점 영문", "지점 주소", "지점 영문 주소", "지점 받는 메일 주소"];

/** "{이름}" 자리를 칩으로 보여준다 */
function SlotText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(\{[^}]+\})/g);
  return (
    <p className={cx("whitespace-pre-wrap text-sm leading-relaxed text-ink2", className)}>
      {parts.map((p, i) =>
        /^\{[^}]+\}$/.test(p) ? (
          <span key={i} className="mx-0.5 rounded bg-brass/15 px-1 py-px text-[12px] font-medium text-brass">
            {p.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

/** 커서 자리에 {자리}를 넣는 버튼 줄 */
function SlotButtons({ slots, onInsert }: { slots: string[]; onInsert: (slot: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {slots.map((s) => (
        <button key={s} type="button" onClick={() => onInsert(`{${s}}`)} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink2 hover:border-brass hover:text-brass" title={`{${s}} 넣기`}>
          + {s}
        </button>
      ))}
    </div>
  );
}

function useSlotInsert(value: string, set: (v: string) => void) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const insert = (slot: string) => {
    const el = ref.current;
    const at = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    set(value.slice(0, at) + slot + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + slot.length, at + slot.length);
    });
  };
  return { ref, insert };
}

const scopeLabel = (branches: BranchWithCount[], id: string | null) => (id ? branches.find((b) => b.id === id)?.name ?? "지점" : "공통");

// ── 정형 답변 ─────────────────────────────────────────
function Templates({ branchId }: { branchId: string }) {
  const { branches } = useBranch();
  const q = useApi<ReplyTemplate[]>(["materials", "templates", branchId], `/api/reply-templates?branch_id=${branchId}`);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<{ id: string | null; branch_id: string; title: string; shortcut: string; body: string } | null>(null);
  const [del, setDel] = useState<ReplyTemplate | null>(null);
  const save = useApiMutation({ invalidate: [["materials"]], success: "정형 답변을 저장했다", onSuccess: () => setDraft(null) });
  const remove = useApiMutation({ invalidate: [["materials"]], success: "정형 답변을 지웠다", onSuccess: () => setDel(null) });
  const slot = useSlotInsert(draft?.body ?? "", (v) => draft && setDraft({ ...draft, body: v }));

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((t) => !s || t.title.toLowerCase().includes(s) || t.body.toLowerCase().includes(s) || t.shortcut.toLowerCase().includes(s));
  }, [q.data, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox id="tpl-search" value={search} onChange={setSearch} placeholder="이름·본문 찾기" />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ id: null, branch_id: branchId === "all" ? "" : branchId, title: "", shortcut: "", body: "" })}>
          답변 더하기
        </Button>
      </div>
      <p className="text-xs text-ink3">답장 입력창에서 «/» 또는 이름으로 고른다 · {"{자리}"}는 보낼 때 채운다. 지점 답변은 그 지점 대화에서만 보인다.</p>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !rows.length ? (
        <EmptyState title={search ? "맞는 답변이 없다" : "정형 답변이 없다"} body="자주 쓰는 답장을 저장해 두면 상담 화면에서 한 번에 넣는다" />
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((t) => (
            <li key={t.id} className="flex min-w-0 flex-col gap-2 rounded-md border border-line bg-surface px-4 py-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t.title}</h3>
                    {t.shortcut && <span className="rounded bg-sunken px-1.5 font-mono text-[11px] text-ink2">/{t.shortcut}</span>}
                    <Badge tone="neutral" dot={false}>
                      {scopeLabel(branches, t.branch_id)}
                    </Badge>
                  </div>
                </div>
                <IconButton label="고치기" onClick={() => setDraft({ id: t.id, branch_id: t.branch_id ?? "", title: t.title, shortcut: t.shortcut, body: t.body })}>
                  <Pencil className="size-3.5" />
                </IconButton>
                <IconButton label="지우기" onClick={() => setDel(t)} className="hover:text-bad">
                  <Trash2 className="size-3.5" />
                </IconButton>
              </div>
              <SlotText text={t.body} />
              <div className="text-[11px] text-ink3">{fmt(t.updated_at, "yy.M.d")} 고침</div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        wide
        title={draft?.id ? "정형 답변 고치기" : "정형 답변 더하기"}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>취소</Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft?.title.trim() || !draft?.body.trim()}
              onClick={() =>
                draft &&
                save.mutate({
                  path: draft.id ? `/api/reply-templates/${draft.id}` : "/api/reply-templates",
                  method: draft.id ? "PATCH" : "POST",
                  body: { branch_id: draft.branch_id || null, title: draft.title, shortcut: draft.shortcut, body: draft.body },
                })
              }
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-3">
            <FormGrid cols={3}>
              <Field label="이름" htmlFor="tpl-title" className="sm:col-span-2">
                <Input id="tpl-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 첫 답장 · 빈 방 안내" />
              </Field>
              <Field label="단축어" htmlFor="tpl-shortcut" hint="/ 다음에 쓰는 말">
                <Input id="tpl-shortcut" value={draft.shortcut} onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })} placeholder="빈방" />
              </Field>
            </FormGrid>
            <Field label="쓰는 곳" htmlFor="tpl-branch">
              <Select id="tpl-branch" value={draft.branch_id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })} options={[{ value: "", label: "공통 · 모든 지점" }, ...branches.map((b) => ({ value: b.id, label: b.name }))]} />
            </Field>
            <Field label="본문" htmlFor="tpl-body">
              <textarea ref={slot.ref} id="tpl-body" rows={6} className="field" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-ink3">넣을 자리</span>
              <SlotButtons slots={TEMPLATE_SLOTS} onInsert={slot.insert} />
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`«${del?.title}» 지우기`}
        description="지우면 상담 답장 입력창에서 더는 고를 수 없다"
        footer={
          <>
            <Button onClick={() => setDel(null)}>취소</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => del && remove.mutate({ path: `/api/reply-templates/${del.id}`, method: "DELETE" })}>
              지우기
            </Button>
          </>
        }
      >
        <SlotText text={del?.body ?? ""} />
      </Dialog>
    </div>
  );
}

// ── 준비된 파일 ───────────────────────────────────────
function sizeLabel(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}MB`;
  if (n >= 1000) return `${Math.round(n / 1000)}KB`;
  return `${n}B`;
}

function Files({ branchId }: { branchId: string }) {
  const { branches } = useBranch();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useApi<PreparedFile[]>(["materials", "files", branchId], `/api/prepared-files?branch_id=${branchId}`);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<PreparedFile | null>(null);
  const remove = useApiMutation({ invalidate: [["materials"]], success: "파일을 지웠다", onSuccess: () => setDel(null) });
  const input = useRef<HTMLInputElement>(null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const f of Array.from(list)) {
        const kind = f.type.startsWith("image/") ? "image" : f.type === "application/pdf" || /\.pdf$/i.test(f.name) ? "pdf" : "doc";
        await api("/api/prepared-files", { method: "POST", body: { branch_id: branchId === "all" ? null : branchId, name: f.name, size: f.size, kind } });
      }
      await qc.invalidateQueries({ queryKey: ["materials"] });
      toast.show(`파일 ${list.length}개를 올렸다`, "good");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "올리지 못했다", "bad");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const rows = (q.data ?? []).filter((f) => !search.trim() || f.name.toLowerCase().includes(search.trim().toLowerCase()));
  const cols: Column<PreparedFile>[] = [
    {
      id: "name",
      header: "파일",
      cell: (f) => (
        <span className="flex min-w-0 items-center gap-2">
          {f.kind === "pdf" ? <FileText className="size-4 shrink-0 text-bad" /> : f.kind === "image" ? <FileImage className="size-4 shrink-0 text-info" /> : <FileIcon className="size-4 shrink-0 text-ink3" />}
          <span className="truncate">{f.name}</span>
        </span>
      ),
      sort: (f) => f.name,
    },
    { id: "size", header: "크기", align: "right", cell: (f) => sizeLabel(f.size), sort: (f) => f.size },
    { id: "scope", header: "쓰는 곳", cell: (f) => <Badge tone="neutral" dot={false}>{scopeLabel(branches, f.branch_id)}</Badge> },
    { id: "at", header: "올린 날", align: "right", cell: (f) => fmt(f.updated_at, "yy.M.d"), sort: (f) => f.updated_at, hideOnMobile: true },
    {
      id: "x",
      header: "",
      align: "right",
      cell: (f) => (
        <IconButton label={`${f.name} 지우기`} onClick={() => setDel(f)} className="hover:text-bad">
          <Trash2 className="size-3.5" />
        </IconButton>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchBox id="file-search" value={search} onChange={setSearch} placeholder="파일 이름 찾기" />
        <input ref={input} id="file-upload" type="file" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
        <Button variant="primary" icon={<Upload className="size-4" />} loading={busy} onClick={() => input.current?.click()}>
          파일 올리기
        </Button>
      </div>
      <p className="text-xs text-ink3">
        답장 입력창의 «첨부»에서 바로 붙인다. 지점 파일은 그 지점 대화에서만 보인다. {branchId === "all" ? "지금 올리면 공통 파일이 된다." : "지금 올리면 이 지점 파일이 된다."} 시연 데이터에서는 파일 이름과 크기만 기록한다.
      </p>
      {q.isLoading ? <Loading /> : q.error ? <ErrorBox error={q.error} /> : <DataTable rows={rows} columns={cols} rowKey={(f) => f.id} empty={search ? "맞는 파일이 없다" : "준비된 파일이 없다"} initialSort={{ id: "at", dir: "desc" }} />}
      <Dialog
        open={!!del}
        onClose={() => setDel(null)}
        title="파일 지우기"
        description={del?.name}
        footer={
          <>
            <Button onClick={() => setDel(null)}>취소</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => del && remove.mutate({ path: `/api/prepared-files/${del.id}`, method: "DELETE" })}>
              지우기
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink2">이미 보낸 메일의 첨부는 그대로 남는다.</p>
      </Dialog>
    </div>
  );
}

// ── 서명 ─────────────────────────────────────────────
/** 서명 미리 보기. 값이 빈 자리가 있는 줄은 통째로 뺀다(원본 규칙) */
function fillSignature(text: string, b: BranchWithCount | undefined, staff: string) {
  const map: Record<string, string> = {
    "보내는 직원": staff,
    지점명: b?.name ?? "",
    "지점 영문": b?.name_en ?? "",
    "지점 주소": b?.address ?? "",
    "지점 영문 주소": "", // 지점 정보에 영문 주소가 아직 없다
    "지점 받는 메일 주소": b?.email ?? "",
  };
  return text
    .split("\n")
    .filter((line) => !/\{([^}]+)\}/.test(line) || [...line.matchAll(/\{([^}]+)\}/g)].every((m) => (map[m[1]] ?? "x") !== ""))
    .map((line) => line.replace(/\{([^}]+)\}/g, (_, k: string) => map[k] ?? `{${k}}`))
    .join("\n");
}

function Signatures({ branchId }: { branchId: string }) {
  const { branches, me } = useBranch();
  const q = useApi<Signature[]>(["materials", "signatures", branchId], `/api/reply-signatures?branch_id=${branchId}`);
  const [draft, setDraft] = useState<{ id: string | null; branch_id: string | null; body_ko: string; body_en: string } | null>(null);
  const [lang, setLang] = useState<"ko" | "en">("ko");
  const [del, setDel] = useState<Signature | null>(null);
  const save = useApiMutation({ invalidate: [["materials"]], success: "서명을 저장했다", onSuccess: () => setDraft(null) });
  const remove = useApiMutation({ invalidate: [["materials"]], success: "지점 서명을 지웠다 · 이제 공통 서명을 쓴다", onSuccess: () => setDel(null) });
  const body = draft ? (lang === "ko" ? draft.body_ko : draft.body_en) : "";
  const slot = useSlotInsert(body, (v) => draft && setDraft(lang === "ko" ? { ...draft, body_ko: v } : { ...draft, body_en: v }));

  const list = q.data ?? [];
  const common = list.find((s) => s.branch_id === null);
  const branchSigs = list.filter((s) => s.branch_id !== null);
  const previewBranch = branches.find((b) => b.id === (draft?.branch_id ?? (branchId === "all" ? null : branchId))) ?? branches[0];
  const missing = branchId !== "all" && !branchSigs.some((s) => s.branch_id === branchId);

  const card = (s: Signature) => {
    const b = branches.find((x) => x.id === s.branch_id) ?? (branchId !== "all" ? branches.find((x) => x.id === branchId) : branches[0]);
    return (
      <li key={s.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-sm font-semibold">{s.branch_id ? `${scopeLabel(branches, s.branch_id)} 서명` : "공통 서명"}</h3>
          <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDraft({ id: s.id, branch_id: s.branch_id, body_ko: s.body_ko, body_en: s.body_en ?? "" })}>
            서명 고치기
          </Button>
          {s.branch_id && (
            <IconButton label="지점 서명 지우기" onClick={() => setDel(s)} className="hover:text-bad">
              <Trash2 className="size-3.5" />
            </IconButton>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <div className="label-caps mb-1">한국어</div>
            <SlotText text={s.body_ko} />
            <p className="mt-2 whitespace-pre-wrap rounded bg-sunken/70 px-2.5 py-2 text-xs text-ink2">{fillSignature(s.body_ko, b, me?.name ?? "직원")}</p>
          </div>
          <div className="min-w-0">
            <div className="label-caps mb-1">English</div>
            {s.body_en ? (
              <>
                <SlotText text={s.body_en} />
                <p className="mt-2 whitespace-pre-wrap rounded bg-sunken/70 px-2.5 py-2 text-xs text-ink2">{fillSignature(s.body_en, b, me?.name ?? "Staff")}</p>
              </>
            ) : (
              <p className="text-sm text-ink3">없음 · 고를 수 없다{s.branch_id && common?.body_en ? " (공통 English 서명을 쓴다)" : ""}</p>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-[80ch] text-xs leading-relaxed text-ink3">
          직원 답장 끝에 붙는다. 답장 입력창에서 «한국어 | English | 없음»으로 고른다. 지점 서명이 있으면 공통 대신 그것을 쓴다. 이름 자리({"{보내는 직원}"})가 비면 그 서명은 고를 수 없고, 다른 자리가 비면 그 줄만 빠진다.
        </p>
        {missing && (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft({ id: null, branch_id: branchId, body_ko: common?.body_ko ?? "", body_en: common?.body_en ?? "" })}>
            지점 서명 만들기
          </Button>
        )}
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : (
        <ul className="flex flex-col gap-3">
          {common && card(common)}
          {branchSigs.map(card)}
          {!common && !branchSigs.length && <EmptyState title="서명이 없다" />}
        </ul>
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        wide
        title={draft ? `${draft.branch_id ? scopeLabel(branches, draft.branch_id) : "공통"} ${draft.id ? "서명 고치기" : "서명 만들기"}` : ""}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>취소</Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft?.body_ko.trim()}
              onClick={() =>
                draft &&
                save.mutate({
                  path: draft.id ? `/api/reply-signatures/${draft.id}` : "/api/reply-signatures",
                  method: draft.id ? "PATCH" : "POST",
                  body: { branch_id: draft.branch_id, body_ko: draft.body_ko, body_en: draft.body_en },
                })
              }
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-3">
            <Segmented size="sm" value={lang} onChange={setLang} options={[{ value: "ko", label: "한국어" }, { value: "en", label: "English" }]} />
            <Field label={lang === "ko" ? "한국어 서명" : "English 서명"} htmlFor="sig-body" hint={lang === "en" ? "비우면 English 서명을 고를 수 없다" : undefined}>
              <textarea ref={slot.ref} id="sig-body" rows={5} className="field" value={body} onChange={(e) => setDraft(lang === "ko" ? { ...draft, body_ko: e.target.value } : { ...draft, body_en: e.target.value })} />
            </Field>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-ink3">서명 자리</span>
              <SlotButtons slots={SIGNATURE_SLOTS} onInsert={slot.insert} />
            </div>
            <div>
              <div className="label-caps mb-1">미리 보기 · {previewBranch?.name}</div>
              <p className="whitespace-pre-wrap rounded bg-sunken/70 px-3 py-2 text-sm text-ink2">{fillSignature(body, previewBranch, me?.name ?? "직원") || "—"}</p>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!del}
        onClose={() => setDel(null)}
        title="지점 서명 지우기"
        description="지우면 이 지점 답장에는 공통 서명이 붙는다"
        footer={
          <>
            <Button onClick={() => setDel(null)}>취소</Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => del && remove.mutate({ path: `/api/reply-signatures/${del.id}`, method: "DELETE" })}>
              지우기
            </Button>
          </>
        }
      >
        <SlotText text={del?.body_ko ?? ""} />
      </Dialog>
    </div>
  );
}

// ── 지점 정보 ─────────────────────────────────────────
function BranchInfo({ branchId }: { branchId: string }) {
  const { branches } = useBranch();
  const list = branchId === "all" ? branches : branches.filter((b) => b.id === branchId);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink3">정형 답변·서명의 {"{자리}"}에 들어가는 값. 바꾸려면 본사에 요청한다.</p>
      <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {list.map((b) => (
          <li key={b.id} className="rounded-md border border-line bg-surface px-4 py-3">
            <h3 className="mb-3 text-sm font-semibold">{b.name}</h3>
            <KeyValue
              items={[
                ["지점명", b.name],
                ["지점 영문", b.name_en],
                ["지점 주소", b.address],
                ["지점 받는 메일 주소", <span className="break-all">{b.email}</span>],
                ["대표 전화", b.phone],
                ["입금 계좌", b.bank_account],
              ]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MaterialsPage() {
  const { branchId } = useBranch();
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view: View = raw === "files" || raw === "signatures" || raw === "branch" ? raw : "templates";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="응대 자료" subtitle="상담 답장에 쓰는 정형 답변·준비된 파일·서명을 한곳에서 관리한다">
        <Segmented
          value={view}
          onChange={(v) => setParams(v === "templates" ? {} : { view: v }, { replace: true })}
          options={[
            { value: "templates", label: "정형 답변" },
            { value: "files", label: "준비된 파일" },
            { value: "signatures", label: "서명" },
            { value: "branch", label: "지점 정보" },
          ]}
        />
      </PageHeader>
      {view === "templates" && <Templates branchId={branchId} />}
      {view === "files" && <Files branchId={branchId} />}
      {view === "signatures" && <Signatures branchId={branchId} />}
      {view === "branch" && <BranchInfo branchId={branchId} />}
    </div>
  );
}
