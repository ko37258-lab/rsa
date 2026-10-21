import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { Search, DoorOpen, FileSignature, User, MessagesSquare, CornerDownLeft, Zap } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { useBranch } from "@/lib/branch";
import { cx } from "@/lib/format";
import type { SearchHit } from "@/mock/handlers/platform";

/** 빠른 작업(원본 명령 팔레트의 actions) — 키워드로도 찾는다 */
const ACTIONS: Array<{ label: string; to: string; keywords: string[] }> = [
  { label: "입주문의 접수", to: "/inquiries?new=1", keywords: ["상담", "문의", "새"] },
  { label: "계약 작성", to: "/leases?new=1", keywords: ["계약", "새"] },
  { label: "호실 등록", to: "/units?new=1", keywords: ["방", "새"] },
  { label: "직접 청구", to: "/billing?new=1", keywords: ["청구", "돈", "새"] },
  { label: "입금 기록", to: "/collections?view=receipts&new=1", keywords: ["입금", "수납", "돈"] },
  { label: "은행 거래내역 올리기", to: "/collections?view=receipts", keywords: ["은행", "엑셀", "입금"] },
  { label: "이번 달 청구서", to: "/billing", keywords: ["청구", "발송"] },
  { label: "퇴실 정산", to: "/settle", keywords: ["정산", "퇴실", "보증금"] },
  { label: "설정", to: "/settings", keywords: ["지점", "계약 조건", "직원"] },
  { label: "백업 파일 내려받기", to: "/settings?tab=backup", keywords: ["백업", "저장", "옮기기"] },
  { label: "빈 상태로 시작", to: "/settings", keywords: ["실사용", "시작", "초기화"] },
];

const GROUP: Record<SearchHit["group"], { label: string; icon: typeof DoorOpen }> = {
  unit: { label: "호실", icon: DoorOpen },
  lease: { label: "계약", icon: FileSignature },
  customer: { label: "고객", icon: User },
  inquiry: { label: "상담", icon: MessagesSquare },
};

type Item = { key: string; label: string; sub?: string; to: string; kind: "action" | SearchHit["group"] };

function useDebounced<T>(v: T, ms: number): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const { branchId } = useBranch();
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dq = useDebounced(q.trim(), 140);
  const res = useApi<SearchHit[]>(["search", branchId, dq], open && dq ? `/api/search?q=${encodeURIComponent(dq)}&branch_id=${branchId}` : null);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const s = q.trim().toLowerCase();
    const actions = ACTIONS.filter((a) => !s || a.label.toLowerCase().includes(s) || a.keywords.some((k) => k.includes(s) || s.includes(k))).map<Item>((a) => ({
      key: `a:${a.to}:${a.label}`,
      label: a.label,
      to: a.to,
      kind: "action",
    }));
    const hits = (s ? res.data ?? [] : []).map<Item>((h) => ({ key: `${h.group}:${h.id}`, label: h.label, sub: h.sub, to: h.to, kind: h.group }));
    return s ? [...hits, ...actions] : actions;
  }, [q, res.data]);

  useEffect(() => setActive(0), [items.length, dq]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (it: Item | undefined) => {
    if (!it) return;
    onClose();
    nav(it.to);
  };

  // 그룹 머리글을 넣어 그린다
  let lastKind: Item["kind"] | null = null;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-start justify-center bg-ink/40 sm:pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="찾기와 빠른 작업"
        className="flex max-h-[100dvh] w-full flex-col overflow-hidden border-line bg-surface shadow-2xl sm:max-h-[70vh] sm:max-w-xl sm:rounded-lg sm:border"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(items.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(items[active]);
          }
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 shrink-0 text-ink3" />
          <input
            ref={inputRef}
            id="command-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="호실, 이름, 전화, 이메일 또는 할 일"
            aria-label="찾기"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink placeholder:text-ink3 focus:outline-none"
            autoComplete="off"
          />
          <button type="button" onClick={onClose} className="rounded px-1.5 py-0.5 text-xs text-ink3 hover:bg-sunken">
            닫기
          </button>
        </div>
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink3">{res.isFetching ? "찾는 중" : `«${q}»에 맞는 것이 없다`}</p>
          ) : (
            items.map((it, i) => {
              const header = it.kind !== lastKind ? (it.kind === "action" ? "빠른 작업" : GROUP[it.kind].label) : null;
              lastKind = it.kind;
              const Icon = it.kind === "action" ? Zap : GROUP[it.kind].icon;
              return (
                <div key={it.key}>
                  {header && <div className="label-caps px-2.5 pb-1 pt-2.5">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    data-idx={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(it)}
                    className={cx("flex w-full items-center gap-3 rounded px-2.5 py-2 text-left", i === active ? "bg-navy/[0.07]" : "hover:bg-sunken")}
                  >
                    <Icon className={cx("size-4 shrink-0", i === active ? "text-brass" : "text-ink3")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{it.label}</span>
                      {it.sub && <span className="block truncate text-xs text-ink3">{it.sub}</span>}
                    </span>
                    {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-ink3" />}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="hidden items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-ink3 sm:flex">
          <span>↑↓ 고르기</span>
          <span>Enter 열기</span>
          <span>Esc 닫기</span>
          <span className="ml-auto">Ctrl·⌘ + K</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
