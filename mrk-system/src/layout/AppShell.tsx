import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, DoorOpen, MessagesSquare, FileSignature, Users, Receipt, Wallet, Scale, BookOpen,
  ClipboardCheck, ShieldCheck, HelpCircle, ScrollText, FolderOpen, Bell, Menu, X, Plus, Sun, Moon, Monitor, RotateCcw,
} from "lucide-react";
import { useBranch } from "@/lib/branch";
import { useApi } from "@/lib/hooks";
import { api, API_MODE } from "@/api/client";
import { cx, fmt } from "@/lib/format";
import { useToast } from "@/components/ui";

const NAV: Array<{ group: string; items: Array<{ to: string; label: string; icon: typeof LayoutDashboard }> }> = [
  {
    group: "영업",
    items: [
      { to: "/dashboard", label: "대시보드", icon: LayoutDashboard },
      { to: "/units", label: "호실", icon: DoorOpen },
      { to: "/inquiries", label: "상담", icon: MessagesSquare },
      { to: "/leases", label: "계약", icon: FileSignature },
      { to: "/customers", label: "고객", icon: Users },
    ],
  },
  {
    group: "돈",
    items: [
      { to: "/billing", label: "청구", icon: Receipt },
      { to: "/collections", label: "수납", icon: Wallet },
      { to: "/settle", label: "정산", icon: Scale },
      { to: "/ledger", label: "장부", icon: BookOpen },
    ],
  },
  {
    group: "관리",
    items: [
      { to: "/readiness", label: "운영 준비", icon: ClipboardCheck },
      { to: "/integrity", label: "정합성", icon: ShieldCheck },
      { to: "/qa", label: "Q&A", icon: HelpCircle },
      { to: "/policies", label: "운영정책", icon: ScrollText },
      { to: "/materials", label: "응대 자료", icon: FolderOpen },
    ],
  },
];

function Logo() {
  return (
    <Link to="/dashboard" className="flex items-baseline gap-2 px-2">
      <span className="font-display text-[26px] font-bold leading-none tracking-tight text-ink">
        MR<span className="text-brass">.</span>K
      </span>
      <span className="text-[11px] font-semibold tracking-[0.14em] text-ink3">관리 시스템</span>
    </Link>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5" aria-label="주 메뉴">
      {NAV.map((g) => (
        <div key={g.group} className="flex flex-col gap-0.5">
          <div className="label-caps px-3 pb-1">{g.group}</div>
          {g.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx("flex items-center gap-2.5 rounded px-3 py-[7px] text-sm font-medium transition-colors", isActive ? "bg-navy/[0.07] text-ink" : "text-ink2 hover:bg-sunken hover:text-ink")
              }
            >
              {({ isActive }) => (
                <>
                  <it.icon className={cx("size-4", isActive ? "text-brass" : "text-ink3")} />
                  {it.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

type Theme = "system" | "light" | "dark";
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("mrk-theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("mrk-theme", theme);
    } catch {
      /* 무시 */
    }
  }, [theme]);
  return [theme, setTheme];
}

function Popover({ button, children, align = "right" }: { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {button(open, () => setOpen((o) => !o))}
      {open && <div className={cx("absolute top-full z-30 mt-1.5 min-w-[220px] rounded-md border border-line bg-surface p-1 shadow-xl", align === "right" ? "right-0" : "left-0")}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

const menuItem = "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-sm text-ink hover:bg-sunken";

function Alerts() {
  const { branchId } = useBranch();
  const q = useApi<{ alerts: Array<{ id: string; tone: "bad" | "warn" | "info"; text: string; to: string }> }>(["alerts", branchId], `/api/alerts?branch_id=${branchId}`);
  const n = q.data?.alerts.length ?? 0;
  return (
    <Popover
      button={(_, toggle) => (
        <button type="button" onClick={toggle} aria-label={`알림 ${n}건`} className="relative rounded p-2 text-ink2 hover:bg-sunken hover:text-ink">
          <Bell className="size-[18px]" />
          {n > 0 && <span className="num absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-bad text-[10px] font-semibold text-white">{n}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className="w-72">
          <div className="label-caps px-2.5 pb-1 pt-1.5">지금 할 일</div>
          {n === 0 && <p className="px-2.5 py-3 text-sm text-ink3">손봐야 할 일이 없다</p>}
          {q.data?.alerts.map((a) => (
            <Link key={a.id} to={a.to} onClick={close} className={menuItem}>
              <span className={cx("size-2 shrink-0 rounded-full", a.tone === "bad" ? "bg-bad" : a.tone === "warn" ? "bg-warn" : "bg-info")} />
              {a.text}
            </Link>
          ))}
        </div>
      )}
    </Popover>
  );
}

export function AppShell() {
  const { branchId, branches, setBranchId, me, today } = useBranch();
  const [drawer, setDrawer] = useState(false);
  const [theme, setTheme] = useTheme();
  const loc = useLocation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => setDrawer(false), [loc.pathname]);

  const reset = async () => {
    await api("/api/demo/reset", { method: "POST" });
    await qc.invalidateQueries();
    toast.show("시연 데이터를 오늘 기준으로 다시 만들었다", "good");
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 넓은 화면: 고정 내비 */}
      <aside className="hidden w-[232px] shrink-0 flex-col gap-6 border-r border-line bg-surface py-5 pl-3 pr-3 lg:flex" style={{ paddingLeft: "max(12px, env(safe-area-inset-left, 0px))" }}>
        <Logo />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SideNav />
        </div>
        <div className="border-t border-line px-2 pt-3 text-xs text-ink3">
          <div className="font-medium text-ink2">{me?.name ?? "—"}</div>
          <div>{me?.role === "owner" ? "대표 · 전체 권한" : "직원"}</div>
        </div>
      </aside>

      {/* 좁은 화면: 서랍 */}
      {drawer && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setDrawer(false)}>
          <aside className="flex h-full w-[260px] flex-col gap-6 overflow-y-auto bg-surface py-5 pr-3 shadow-2xl" style={{ paddingLeft: "max(12px, env(safe-area-inset-left, 0px))", paddingTop: "max(20px, env(safe-area-inset-top, 0px))" }}>
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" aria-label="메뉴 닫기" className="rounded p-1.5 text-ink3 hover:bg-sunken" onClick={() => setDrawer(false)}>
                <X className="size-4" />
              </button>
            </div>
            <SideNav onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="sticky z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/95 backdrop-blur"
          style={{ top: "env(safe-area-inset-top, 0px)", paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}
        >
          <button type="button" aria-label="메뉴 열기" className="rounded p-1.5 text-ink2 hover:bg-sunken lg:hidden" onClick={() => setDrawer(true)}>
            <Menu className="size-5" />
          </button>
          <span className="font-display text-lg font-bold lg:hidden">
            MR<span className="text-brass">.</span>K
          </span>
          <label htmlFor="branch-select" className="sr-only">
            지점
          </label>
          <select id="branch-select" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="field h-8 w-auto max-w-[180px] font-medium">
            <option value="all">전 지점</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <span className="num hidden text-sm text-ink3 md:inline">{fmt(today, "yyyy년 M월 d일 (EEE)")}</span>
          <div className="flex-1" />
          {API_MODE === "mock" && <span className="hidden rounded-full border border-brass/40 px-2 py-0.5 text-[11px] font-medium text-brass sm:inline">시연 데이터</span>}
          <Popover
            button={(_, toggle) => (
              <button type="button" onClick={toggle} className="inline-flex h-8 items-center gap-1 rounded bg-navy px-2.5 text-[13px] font-medium text-navy-fg hover:bg-navy/90">
                <Plus className="size-4" />
                <span className="hidden sm:inline">새로 만들기</span>
              </button>
            )}
          >
            {(close) => (
              <>
                {[
                  ["입주문의 접수", "/inquiries?new=1"],
                  ["계약 작성", "/leases?new=1"],
                  ["호실 등록", "/units?new=1"],
                  ["직접 청구", "/billing?new=1"],
                  ["입금 기록", "/collections?view=receipts&new=1"],
                ].map(([label, to]) => (
                  <button
                    key={to}
                    type="button"
                    className={menuItem}
                    onClick={() => {
                      close();
                      nav(to);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
          </Popover>
          <Alerts />
          <Popover
            button={(_, toggle) => (
              <button type="button" onClick={toggle} aria-label="화면 설정" className="rounded p-2 text-ink2 hover:bg-sunken hover:text-ink">
                {theme === "dark" ? <Moon className="size-[18px]" /> : theme === "light" ? <Sun className="size-[18px]" /> : <Monitor className="size-[18px]" />}
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="label-caps px-2.5 pb-1 pt-1.5">화면</div>
                {(
                  [
                    ["system", "기기 설정 따르기", Monitor],
                    ["light", "밝게", Sun],
                    ["dark", "어둡게", Moon],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button key={v} type="button" className={cx(menuItem, theme === v && "font-semibold")} onClick={() => setTheme(v)}>
                    <Icon className="size-4 text-ink3" />
                    {label}
                  </button>
                ))}
                {API_MODE === "mock" && (
                  <>
                    <div className="my-1 border-t border-line" />
                    <button
                      type="button"
                      className={menuItem}
                      onClick={() => {
                        close();
                        void reset();
                      }}
                    >
                      <RotateCcw className="size-4 text-ink3" />
                      시연 데이터 다시 만들기
                    </button>
                  </>
                )}
              </>
            )}
          </Popover>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] py-6" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
