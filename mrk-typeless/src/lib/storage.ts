// 모든 데이터(설정·사전·기록)는 이 브라우저에만 저장합니다.
// 사생활 보호 창이나 차단된 저장소에서는 읽기/쓰기가 실패할 수 있으므로 조용히 넘어갑니다.
const PREFIX = "mrk-typeless:v1:";

export function load<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // 저장소를 쓸 수 없는 환경: 이번 방문 동안만 유지됩니다.
  }
}
