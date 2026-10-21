import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useApi } from "./hooks";
import type { Branch, Me } from "@/types";

export type BranchWithCount = Branch & { unit_count: number };

interface BranchCtx {
  /** 선택한 지점 id, 또는 "all"(전 지점) */
  branchId: string;
  branch: BranchWithCount | null;
  branches: BranchWithCount[];
  setBranchId: (id: string) => void;
  me: (Me & { today: string }) | null;
  /** Mock/서버 기준 오늘 "yyyy-MM-dd" */
  today: string;
}

const Ctx = createContext<BranchCtx | null>(null);
const KEY = "mrk-branch";

function readSaved(): string {
  try {
    return localStorage.getItem(KEY) ?? "all";
  } catch {
    return "all";
  }
}

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branchId, setId] = useState<string>(readSaved);
  const branches = useApi<BranchWithCount[]>(["branches"], "/api/branches");
  const me = useApi<Me & { today: string }>(["me"], "/api/me");
  const list = branches.data ?? [];

  useEffect(() => {
    if (branchId !== "all" && list.length && !list.some((b) => b.id === branchId)) setId("all");
  }, [branchId, list]);

  const value = useMemo<BranchCtx>(
    () => ({
      branchId,
      branch: list.find((b) => b.id === branchId) ?? null,
      branches: list,
      setBranchId: (id) => {
        setId(id);
        try {
          localStorage.setItem(KEY, id);
        } catch {
          /* 저장 못 해도 화면은 동작 */
        }
      },
      me: me.data ?? null,
      today: me.data?.today ?? new Date().toISOString().slice(0, 10),
    }),
    [branchId, list, me.data],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBranch(): BranchCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("BranchProvider 밖에서 useBranch 를 불렀다");
  return v;
}
