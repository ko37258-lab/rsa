import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useApi, useApiMutation } from "@/lib/hooks";
import { timeLabel } from "@/lib/format";
import type { HistoryEvent, Memo } from "@/types";
import { Button, Textarea, Loading } from "@/components/ui";

type Kinds = "units" | "inquiries" | "leases" | "customers";

/** 내부 메모 — 호실·상담·계약·고객 상세에서 같이 쓴다 */
export function MemosSection({ kinds, id }: { kinds: Kinds; id: string }) {
  const q = useApi<Memo[]>(["memos", kinds, id], `/api/${kinds}/${id}/memos`);
  const [text, setText] = useState("");
  const add = useApiMutation({ invalidate: [["memos", kinds, id]], success: "메모를 남겼다", onSuccess: () => setText("") });
  const del = useApiMutation({ invalidate: [["memos", kinds, id]], success: "메모를 지웠다" });
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate({ path: `/api/${kinds}/${id}/memos`, body: { body: text } });
        }}
      >
        <Textarea id={`memo-${id}`} rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="팀만 보는 메모. 고객에게는 안 보인다" />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="primary" loading={add.isPending} disabled={!text.trim()}>
            메모 남기기
          </Button>
        </div>
      </form>
      {q.isLoading ? (
        <Loading />
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-xs text-ink3">아직 메모가 없다</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {q.data!.map((m) => (
            <li key={m.id} className="flex items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm">{m.body}</p>
                <p className="mt-1 text-xs text-ink3">
                  {m.author} · {timeLabel(m.at)}
                </p>
              </div>
              <button type="button" aria-label="메모 지우기" className="rounded p-1 text-ink3 hover:bg-sunken hover:text-bad" onClick={() => del.mutate({ path: `/api/memos/${m.id}`, method: "DELETE" })}>
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 변경 이력 */
export function HistoryList({ kinds, id }: { kinds: Kinds; id: string }) {
  const q = useApi<HistoryEvent[]>(["history", kinds, id], `/api/${kinds}/${id}/history`);
  if (q.isLoading) return <Loading />;
  const rows = q.data ?? [];
  if (!rows.length) return <p className="text-xs text-ink3">이력이 없다</p>;
  return (
    <ol className="relative flex flex-col gap-3 border-l border-line pl-4">
      {rows.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-ink3" />
          <p className="text-sm">{h.text}</p>
          <p className="text-xs text-ink3">
            {timeLabel(h.at)} · {h.author}
          </p>
        </li>
      ))}
    </ol>
  );
}
