// 모든 데이터(설정·사전·기록)는 이 브라우저에만 저장합니다.
// 사생활 보호 창이나 차단된 저장소에서는 읽기/쓰기가 실패할 수 있으므로 조용히 넘어갑니다.
// 저장 공간이 가득 차면(긴 강의 원고가 쌓이면 5MB를 넘길 수 있음) 그 사실을 알려 화면에서 안내합니다.
const PREFIX = "mrk-typeless:v1:";

let storageFull = false;
const listeners = new Set<(full: boolean) => void>();

function setFull(full: boolean): void {
  if (storageFull === full) return;
  storageFull = full;
  listeners.forEach((fn) => fn(full));
}

export function isStorageFull(): boolean {
  return storageFull;
}

/** 저장 공간이 가득 찼는지 바뀔 때 알려 줍니다. 돌려주는 함수로 구독을 끊습니다. */
export function onStorageFull(fn: (full: boolean) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function isQuotaError(e: unknown): boolean {
  const err = e as { name?: string; code?: number } | null;
  return !!err && (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED" || err.code === 22 || err.code === 1014);
}

export function load<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** 저장에 성공하면 true. 공간이 가득 차 실패하면 false (그 밖의 환경 문제도 false). */
export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    setFull(false);
    return true;
  } catch (e) {
    if (isQuotaError(e)) setFull(true);
    // 저장소를 쓸 수 없는 환경: 이번 방문 동안만 유지됩니다.
    return false;
  }
}
