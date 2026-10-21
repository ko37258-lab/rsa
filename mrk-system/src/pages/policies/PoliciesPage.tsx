import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Pencil } from "lucide-react";
import { PageHeader, Segmented, SearchBox, Badge, Button, Dialog, Field, FormGrid, Input, Select, Textarea, Loading, ErrorBox, EmptyState } from "@/components/ui";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { fmt } from "@/lib/format";
import type { PolicyRow } from "@/pages/dashboard/ops-api";

const CATEGORIES = ["계약", "청구", "수납", "정산", "운영"];

interface Draft {
  id: string | null;
  code: string;
  scope: "공통" | "지점";
  branch_id: string;
  category: string;
  title: string;
  body: string;
  basis: string;
  state: "draft" | "confirmed";
}

const empty = (branchId: string): Draft => ({
  id: null,
  code: "",
  scope: branchId === "all" ? "공통" : "지점",
  branch_id: branchId === "all" ? "" : branchId,
  category: "운영",
  title: "",
  body: "",
  basis: "",
  state: "draft",
});

export default function PoliciesPage() {
  const { branchId, branches } = useBranch();
  const [params, setParams] = useSearchParams();
  const q = useApi<PolicyRow[]>(["policies", branchId], `/api/policies?branch_id=${branchId}`);
  const [cat, setCat] = useState("all");
  const [search, setSearch] = useState(params.get("code") ?? "");
  const [draft, setDraft] = useState<Draft | null>(null);
  const save = useApiMutation({ invalidate: [["policies"]], success: (r: unknown) => `${(r as PolicyRow).code} 정책을 저장했다`, onSuccess: () => setDraft(null) });

  const all = q.data ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return all.filter((p) => (cat === "all" || p.category === cat) && (!s || [p.code, p.title, p.body, p.basis].some((x) => x.toLowerCase().includes(s))));
  }, [all, cat, search]);
  const groups = useMemo(() => {
    const m = new Map<string, PolicyRow[]>();
    for (const p of rows) m.set(p.category, [...(m.get(p.category) ?? []), p]);
    return [...m.entries()].sort((a, b) => (CATEGORIES.indexOf(a[0]) + 99) % 99 - ((CATEGORIES.indexOf(b[0]) + 99) % 99));
  }, [rows]);
  const confirmed = all.filter((p) => p.state === "confirmed").length;
  const cats = [...new Set([...CATEGORIES.filter((c) => all.some((p) => p.category === c)), ...all.map((p) => p.category)])];

  const submit = () => {
    if (!draft) return;
    const body = { scope: draft.scope, branch_id: draft.scope === "지점" ? draft.branch_id : null, category: draft.category, title: draft.title, body: draft.body, basis: draft.basis, state: draft.state, code: draft.code };
    if (draft.id) save.mutate({ path: `/api/policies/${draft.id}`, method: "PATCH", body });
    else save.mutate({ path: "/api/policies", body });
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="운영정책"
        subtitle={q.data ? `확정 ${confirmed}/${all.length} · 공통 정책과 ${branchId === "all" ? "지점별" : "이 지점"} 정책. 고치면 판이 하나 올라간다.` : "정책을 불러오는 중"}
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDraft(empty(branchId))}>
            정책 더하기
          </Button>
        }
      >
        <Segmented value={cat} onChange={setCat} options={[{ value: "all", label: "전체", count: all.length }, ...cats.map((c) => ({ value: c, label: c, count: all.filter((p) => p.category === c).length }))]} />
        <SearchBox
          id="policy-search"
          value={search}
          onChange={(v) => {
            setSearch(v);
            if (params.get("code")) setParams({}, { replace: true });
          }}
          placeholder="정책·근거·ID"
        />
      </PageHeader>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : !groups.length ? (
        <EmptyState title={all.length ? "맞는 정책이 없다" : "아직 정책이 없다"} body={all.length ? "검색어나 분류를 바꿔 본다" : "«정책 더하기»로 첫 정책을 적는다"} />
      ) : (
        groups.map(([category, ps]) => (
          <section key={category} className="flex flex-col gap-2">
            <h2 className="label-caps">
              {category} · {ps.length}
            </h2>
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
              {ps.map((p) => (
                <li key={p.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="num w-24 shrink-0 font-mono text-xs font-medium text-ink3 sm:pt-0.5">{p.code}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{p.title}</h3>
                      <Badge tone={p.state === "confirmed" ? "good" : "warn"}>{p.state === "confirmed" ? "확정" : "초안"}</Badge>
                      <Badge tone="neutral" dot={false}>
                        {p.scope === "공통" ? "공통" : p.branch_name ?? "지점"}
                      </Badge>
                    </div>
                    <p className="mt-1 max-w-[80ch] whitespace-pre-wrap text-sm leading-relaxed text-ink2">{p.body}</p>
                    <p className="mt-1 text-xs text-ink3">
                      근거: {p.basis || "—"} · {p.version}판 · {fmt(p.updated_at, "yy.M.d")} 고침
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="size-3.5" />}
                    className="self-start"
                    onClick={() => setDraft({ id: p.id, code: p.code, scope: p.scope, branch_id: p.branch_id ?? "", category: p.category, title: p.title, body: p.body, basis: p.basis, state: p.state })}
                  >
                    고치기
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <Dialog
        open={!!draft}
        onClose={() => setDraft(null)}
        wide
        title={draft?.id ? `${draft.code} 고치기` : "정책 더하기"}
        description={draft?.id ? "제목이나 내용을 바꾸면 새 판이 된다" : "ID를 비우면 분류에 맞춰 자동으로 붙는다"}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>취소</Button>
            <Button variant="primary" loading={save.isPending} disabled={!draft?.title.trim() || !draft?.body.trim() || (draft?.scope === "지점" && !draft.branch_id)} onClick={submit}>
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-3">
            <FormGrid cols={3}>
              <Field label="범위" htmlFor="po-scope">
                <Select id="po-scope" value={draft.scope} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, scope: e.target.value as Draft["scope"] })} options={[{ value: "공통", label: "공통" }, { value: "지점", label: "지점" }]} />
              </Field>
              {draft.scope === "지점" ? (
                <Field label="지점" htmlFor="po-branch">
                  <Select id="po-branch" value={draft.branch_id} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })} placeholder="지점을 고른다" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
                </Field>
              ) : (
                <Field label="ID" htmlFor="po-code">
                  <Input id="po-code" value={draft.code} disabled={!!draft.id} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} placeholder="자동" />
                </Field>
              )}
              <Field label="분류" htmlFor="po-cat">
                <Select id="po-cat" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </Field>
            </FormGrid>
            <Field label="제목" htmlFor="po-title">
              <Input id="po-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="예: 중도 퇴실" />
            </Field>
            <Field label="정책" htmlFor="po-body">
              <Textarea id="po-body" rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="직원이 그대로 따라 할 수 있게 한두 문장으로" />
            </Field>
            <FormGrid>
              <Field label="근거" htmlFor="po-basis">
                <Input id="po-basis" value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })} placeholder="예: 표준 계약서 제11조, Q&A 확정 답변" />
              </Field>
              <Field label="상태" htmlFor="po-state">
                <Select id="po-state" value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value as Draft["state"] })} options={[{ value: "draft", label: "초안" }, { value: "confirmed", label: "확정" }]} />
              </Field>
            </FormGrid>
          </div>
        )}
      </Dialog>
    </div>
  );
}
