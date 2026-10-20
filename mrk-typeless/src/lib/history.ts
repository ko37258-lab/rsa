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

export function addToHistory(list: HistoryItem[], item: HistoryItem): HistoryItem[] {
  const prev = list[0];
  const continues =
    prev !== undefined &&
    prev.kind === "dictation" &&
    item.kind === "dictation" &&
    item.createdAt - prev.createdAt < CONTINUE_WINDOW_MS &&
    item.raw.startsWith(prev.raw);
  return [item, ...(continues ? list.slice(1) : list)].slice(0, HISTORY_LIMIT);
}

export function formatWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameDay = new Date(now).toDateString() === d.toDateString();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `오늘 ${hh}:${mm}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}
