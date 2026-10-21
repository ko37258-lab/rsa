import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader, Segmented, SearchBox, Badge, Button, Dialog, Field, Select, Textarea, Loading, ErrorBox, EmptyState } from "@/components/ui";
import { useApi, useApiMutation } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { fmt } from "@/lib/format";
import type { QaItem } from "@/types";
import type { QaContractRow, QaContractsRes, QaRes, QaRow } from "@/pages/dashboard/ops-api";

type View = "open" | "answered" | "resolved" | "contracts";
const TOPICS = ["청구", "수납", "계약", "정산", "운영"];
const ANSWER_HINT = "번호를 붙여 한 번에 답해 주세요. 예: ① 다음 달에서 뺌 ② 부가세 포함";

function QaCard({ row, showBranch }: { row: QaRow; showBranch: boolean }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.answer ?? "");
  const save = useApiMutation<QaItem>({ invalidate: [["qa"], ["readiness"]], success: (r) => (r.state === "confirmed" ? "답을 확정했다" : "답을 남겼다"), onSuccess: () => setEditing(false) });
  const reopen = useApiMutation({ invalidate: [["qa"], ["readiness"]], success: "다시 열었다" });
  const resolved = row.state === "confirmed" || row.state === "auto_closed";
  const send = (confirm: boolean) => save.mutate({ path: `/api/qa/${row.id}/answer`, body: { answer: text, confirm } });

  return (
    <li className="flex min-w-0 flex-col gap-2.5 rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="navy" dot={false}>
          {row.topic}
        </Badge>
        {row.lease_id ? (
          <Link to={`/leases/${row.lease_id}`} className="font-medium text-ink hover:underline">
            {row.unit_code}호 계약{row.contractor_name ? ` · ${row.contractor_name}` : ""}
          </Link>
        ) : (
          <span className="text-ink2">지점 공통</span>
        )}
        {showBranch && <span className="text-ink3">{row.branch_name}</span>}
        {row.blocks_invoice && !resolved && <Badge tone="bad">청구서 안 나감</Badge>}
        <span className="ml-auto text-ink3">{fmt(row.created_at, "M.d")} 질문</span>
      </div>
      <p className="text-sm font-medium leading-relaxed text-ink">{row.question}</p>

      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea id={`qa-answer-${row.id}`} rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={ANSWER_HINT} autoFocus />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" onClick={() => setEditing(false)}>
              취소
            </Button>
            <Button size="sm" loading={save.isPending} disabled={!text.trim()} onClick={() => send(false)}>
              임시 저장
            </Button>
            <Button size="sm" variant="primary" loading={save.isPending} disabled={!text.trim()} onClick={() => send(true)}>
              확정 — 이 질문 해결
            </Button>
          </div>
        </div>
      ) : row.answer ? (
        <div className="rounded bg-sunken/70 px-3 py-2">
          <div className="mb-0.5 flex items-center gap-2 text-[11px] text-ink3">
            <span>{resolved ? "확정한 답" : "답 · 확정 전"}</span>
            {row.answered_at && <span>{fmt(row.answered_at, "M.d")}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-ink2">{row.answer}</p>
        </div>
      ) : null}

      {!editing && (
        <div className="flex flex-wrap justify-end gap-2">
          {resolved ? (
            <Button size="sm" variant="ghost" loading={reopen.isPending} onClick={() => reopen.mutate({ path: `/api/qa/${row.id}/reopen` })}>
              다시 열기
            </Button>
          ) : (
            <>
              {row.answer && (
                <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate({ path: `/api/qa/${row.id}/answer`, body: { answer: row.answer, confirm: true } })}>
                  답 정리해 확정
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => {
                  setText(row.answer ?? "");
                  setEditing(true);
                }}
              >
                {row.answer ? "답 고치기" : "답 쓰기"}
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

const CONTRACT_STATE: Record<QaContractRow["state"], { label: string; tone: "warn" | "info" | "good" }> = {
  open: { label: "답 기다리는 계약", tone: "warn" },
  answered: { label: "답 있음 · 확정 기다리는 계약", tone: "info" },
  resolved: { label: "해결된 계약", tone: "good" },
};

/** 계약별 보기 — 계약 하나에 걸린 질문을 묶어 확정 n/m 을 본다 */
function ContractsView({ branchId, search }: { branchId: string; search: string }) {
  const q = useApi<QaContractsRes>(["qa", "contracts", branchId], `/api/qa/contracts?branch_id=${branchId}`);
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorBox error={q.error} />;
  const s = search.trim().toLowerCase();
  const rows = (q.data?.rows ?? []).filter(
    (r) => !s || (r.unit_code ?? "").includes(s) || (r.contractor_name ?? "").toLowerCase().includes(s) || r.items.some((i) => i.question.toLowerCase().includes(s) || (i.answer ?? "").toLowerCase().includes(s)),
  );
  if (!rows.length) return <EmptyState title={s ? "맞는 계약이 없다" : "확인할 계약이 없다"} body="계약에 걸린 질문이 생기면 계약별로 모인다" />;
  const groups = (["open", "answered", "resolved"] as const).map((st) => ({ st, list: rows.filter((r) => r.state === st) })).filter((g) => g.list.length);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => (
        <section key={g.st} className="flex flex-col gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink2">
            {CONTRACT_STATE[g.st].label}
            <span className="num text-xs font-normal text-ink3">{g.list.length}</span>
          </h2>
          <ul className="flex flex-col gap-2">
            {g.list.map((r) => {
              const expanded = open.has(r.lease_id) || g.st !== "resolved";
              return (
                <li key={r.lease_id} className="rounded-md border border-line bg-surface">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                    onClick={() =>
                      setOpen((prev) => {
                        const n = new Set(prev);
                        if (n.has(r.lease_id)) n.delete(r.lease_id);
                        else n.add(r.lease_id);
                        return n;
                      })
                    }
                    aria-expanded={expanded}
                  >
                    <span className="num font-semibold">{r.unit_code ? `${r.unit_code}호 계약` : "계약"}</span>
                    {r.contractor_name && <span className="text-sm text-ink2">{r.contractor_name}</span>}
                    {branchId === "all" && <span className="text-xs text-ink3">{r.branch_name}</span>}
                    {r.blocks_invoice && <Badge tone="bad">청구서 안 나감</Badge>}
                    <span className="ml-auto flex items-center gap-2">
                      <Badge tone={CONTRACT_STATE[r.state].tone}>
                        확정 {r.confirmed}/{r.total}
                      </Badge>
                      <Link to={`/leases/${r.lease_id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-medium text-brass hover:underline">
                        계약 보기
                      </Link>
                    </span>
                  </button>
                  {expanded && (
                    <ul className="flex flex-col gap-2 border-t border-line p-3">
                      {r.items.map((it) => (
                        <QaCard key={`${it.id}-${it.state}-${it.answer ?? ""}`} row={it} showBranch={false} />
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default function QaPage() {
  const { branchId, branches } = useBranch();
  const [view, setView] = useState<View>("open");
  const [search, setSearch] = useState("");
  // 계약별 보기에서도 위 칸의 건수를 보이려고 목록 조회는 계속한다
  const listView = view === "contracts" ? "open" : view;
  const q = useApi<QaRes>(["qa", branchId, listView], `/api/qa?branch_id=${branchId}&state=${listView}`);
  const contracts = useApi<QaContractsRes>(["qa", "contracts", branchId], `/api/qa/contracts?branch_id=${branchId}`);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ branch_id: "", topic: "청구", question: "", blocks_invoice: false });
  const create = useApiMutation({
    invalidate: [["qa"]],
    success: "질문을 남겼다",
    onSuccess: () => {
      setCreating(false);
      setForm((f) => ({ ...f, question: "", blocks_invoice: false }));
      setView("open");
    },
  });

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data?.rows ?? []).filter((r) => !s || r.question.toLowerCase().includes(s) || (r.answer ?? "").toLowerCase().includes(s) || (r.unit_code ?? "").includes(s));
  }, [q.data, search]);
  const c = q.data?.counts;
  const formBranch = branchId === "all" ? form.branch_id : branchId;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Q&A"
        subtitle="청구·계약을 처리하다 막힌 질문과 답. 확정한 답은 운영정책의 근거가 된다."
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            새 질문
          </Button>
        }
      >
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "open", label: "답 기다리는", count: c?.open },
            { value: "answered", label: "답 있음 · 확정 기다리는", count: c?.answered },
            { value: "resolved", label: "해결된", count: c?.resolved },
            { value: "contracts", label: "계약별", count: contracts.data ? contracts.data.counts.open + contracts.data.counts.answered : undefined },
          ]}
        />
        <SearchBox id="qa-search" value={search} onChange={setSearch} placeholder="질문·답·호실" />
      </PageHeader>

      {view === "contracts" ? (
        <ContractsView branchId={branchId} search={search} />
      ) : q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorBox error={q.error} />
      ) : rows.length === 0 ? (
        <EmptyState title={search ? "맞는 질문이 없다" : view === "open" ? "답 기다리는 질문이 없다" : view === "answered" ? "확정 기다리는 답이 없다" : "해결된 질문이 없다"} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {rows.map((r) => (
            <QaCard key={`${r.id}-${r.state}-${r.answer ?? ""}`} row={r} showBranch={branchId === "all"} />
          ))}
        </ul>
      )}

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        title="새 질문"
        description="담당자가 답을 확정하기 전까지 «답 기다리는»에 남는다"
        footer={
          <>
            <Button onClick={() => setCreating(false)}>취소</Button>
            <Button
              variant="primary"
              loading={create.isPending}
              disabled={!form.question.trim() || !formBranch}
              onClick={() => create.mutate({ path: "/api/qa", body: { branch_id: formBranch, topic: form.topic, question: form.question, blocks_invoice: form.blocks_invoice } })}
            >
              질문 남기기
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {branchId === "all" && (
            <Field label="지점" htmlFor="qa-branch">
              <Select id="qa-branch" value={form.branch_id} onChange={(e) => setForm({ ...form, branch_id: e.target.value })} placeholder="지점을 고른다" options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            </Field>
          )}
          <Field label="주제" htmlFor="qa-topic">
            <Select id="qa-topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} options={TOPICS.map((t) => ({ value: t, label: t }))} />
          </Field>
          <Field label="질문" htmlFor="qa-question">
            <Textarea id="qa-question" rows={4} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} placeholder="예: 중도 입주한 달 관리비를 일할로 청구하나요?" />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink2" htmlFor="qa-blocks">
            <input id="qa-blocks" type="checkbox" checked={form.blocks_invoice} onChange={(e) => setForm({ ...form, blocks_invoice: e.target.checked })} className="size-4 accent-[rgb(var(--navy))]" />
            답이 나올 때까지 청구서를 보내지 않는다
          </label>
        </div>
      </Dialog>
    </div>
  );
}
