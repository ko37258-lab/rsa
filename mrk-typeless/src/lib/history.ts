import type { EngineId } from "./settings";
import type { ModeId } from "./modes";

export interface HistoryItem {
  id: string;
  createdAt: number;
  kind: "dictation" | "edit";
  /** 받아쓰기는 모드, 음성 편집은 지시문 */
  mode?: ModeId;
  command?: string;
  raw: string;
  result: string;
  engine: EngineId;
  spokenMs?: number;
  savedMs: number;
}

export const HISTORY_LIMIT = 300;

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 이어서 말해 다시 정리한 경우(원문이 앞 기록을 이어 씀)는 앞 기록을 새 기록으로 바꿉니다. */
const CONTINUE_WINDOW_MS = 10 * 60_000;

/**
 * 새 기록을 맨 위에 넣습니다.
 * replaceId를 주면 그 기록만 새 기록으로 바꾸고, null이면 아무것도 바꾸지 않습니다
 * ('지우기'를 누르고 새로 말한 글은 앞 기록과 첫머리가 같아도 따로 남아야 하므로, 화면이 직접 알려 줍니다).
 * 주지 않으면 예전처럼 원문을 보고 '이어서 말한 것'인지 짐작합니다.
 */
export function addToHistory(list: HistoryItem[], item: HistoryItem, replaceId?: string | null): HistoryItem[] {
  if (replaceId !== undefined) {
    const rest = replaceId === null ? list : list.filter((h) => h.id !== replaceId);
    return [item, ...rest.filter((h) => h.id !== item.id)].slice(0, HISTORY_LIMIT);
  }
  const prev = list[0];
  const continues =
    prev !== undefined &&
    prev.kind === "dictation" &&
    item.kind === "dictation" &&
    prev.mode === item.mode &&
    item.createdAt - prev.createdAt < CONTINUE_WINDOW_MS &&
    item.raw.startsWith(prev.raw);
  return [item, ...(continues ? list.slice(1) : list)].slice(0, HISTORY_LIMIT);
}

/**
 * 다른 탭이 방금 저장한 기록(stored)과 이 탭이 들고 있는 기록(local)을 id로 합칩니다.
 * 저장된 쪽을 기준으로 하고, 이 탭에만 있는 기록(아직 저장 못 한 것)을 더해 최신순으로 둡니다.
 */
export function mergeHistory(stored: HistoryItem[], local: HistoryItem[]): HistoryItem[] {
  const ids = new Set(stored.map((h) => h.id));
  const onlyLocal = local.filter((h) => !ids.has(h.id));
  if (onlyLocal.length === 0) return stored;
  return [...stored, ...onlyLocal].sort((a, b) => b.createdAt - a.createdAt).slice(0, HISTORY_LIMIT);
}

export function formatWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `오늘 ${hh}:${mm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}
