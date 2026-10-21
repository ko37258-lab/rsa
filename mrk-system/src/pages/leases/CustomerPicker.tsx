import { useEffect, useState } from "react";
import { useApi } from "@/lib/hooks";
import { cx } from "@/lib/format";
import { Badge } from "@/components/ui";
import type { Party, PartyCard } from "@/types";

type CustomerHit = Party & { lease_count?: number; inquiry_count?: number };

/**
 * 기존 고객 찾기. 상담 영역의 GET /api/customers?q= 를 쓴다.
 * 고른 고객은 PartyCard 로 돌려준다.
 */
export function CustomerPicker({ id, value, onChange, kind }: { id: string; value: PartyCard | null; onChange: (p: PartyCard | null) => void; kind?: Party["kind"] }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const h = setTimeout(() => setDebounced(q.trim()), 220);
    return () => clearTimeout(h);
  }, [q]);
  const res = useApi<CustomerHit[]>(["customers", "pick", debounced], debounced ? `/api/customers?branch_id=all&q=${encodeURIComponent(debounced)}` : null);
  const hits = (res.data ?? []).filter((p) => !kind || p.kind === kind).slice(0, 8);

  if (value)
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-line bg-sunken/60 px-3 py-2">
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-1.5 font-medium">
            {value.name}
            {value.kind === "corporation" && <Badge tone="navy" dot={false}>법인</Badge>}
          </div>
          <div className="num truncate text-xs text-ink3">{[value.phone, value.email].filter(Boolean).join(" · ") || "연락처 없음"}</div>
        </div>
        <button type="button" className="shrink-0 text-xs font-medium text-brass hover:underline" onClick={() => onChange(null)}>
          다시 고르기
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-1.5">
      <input id={id} type="search" className="field" placeholder="이름, 전화, 이메일로 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      {debounced && (
        <div className="max-h-48 overflow-y-auto rounded border border-line">
          {res.isLoading ? (
            <p className="px-3 py-2 text-xs text-ink3">찾는 중</p>
          ) : res.isError ? (
            <p className="px-3 py-2 text-xs text-ink3">고객 목록을 불러오지 못했다. 새 고객으로 적는다</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink3">맞는 고객이 없다</p>
          ) : (
            hits.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange({ id: p.id, name: p.name, kind: p.kind, phone: p.phone, email: p.email })}
                className={cx("flex w-full items-center justify-between gap-2 border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-sunken")}
              >
                <span className="min-w-0">
                  <span className="font-medium">{p.name}</span>
                  {p.kind === "corporation" && <span className="ml-1.5 text-xs text-ink3">법인</span>}
                  <span className="num ml-2 text-xs text-ink3">{p.phone}</span>
                </span>
                {p.lease_count ? <span className="shrink-0 text-xs text-ink3">계약 {p.lease_count}</span> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
