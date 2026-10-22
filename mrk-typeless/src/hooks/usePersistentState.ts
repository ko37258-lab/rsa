import { useEffect, useState } from "react";
import { load, save } from "../lib/storage";

/**
 * 이 브라우저에 저장되는 상태. init은 저장된 값(없으면 undefined)으로 첫 값을 만듭니다.
 * shrink를 주면, 저장 공간이 가득 차 저장에 실패했을 때 더 작은 값을 만들어 그것으로 바꿉니다 (기록 줄이기).
 */
export function usePersistentState<T>(key: string, init: (stored: T | undefined) => T, shrink?: (value: T) => T | null) {
  const [value, setValue] = useState<T>(() => init(load<T>(key)));
  useEffect(() => {
    if (save(key, value) || !shrink) return;
    const smaller = shrink(value);
    if (smaller !== null) setValue(smaller);
  }, [key, value, shrink]);
  return [value, setValue] as const;
}
