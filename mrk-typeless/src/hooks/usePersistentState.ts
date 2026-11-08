import { useEffect, useRef, useState } from "react";
import { load, PREFIX, save } from "../lib/storage";

/**
 * 이 브라우저에 저장되는 상태. init은 저장된 값(없으면 undefined)으로 첫 값을 만듭니다.
 * shrink를 주면, 저장 공간이 가득 차 저장에 실패했을 때 더 작은 값을 만들어 그것으로 바꿉니다 (기록 줄이기).
 * sync가 켜져 있으면(기본) 같은 앱을 연 다른 탭이 저장한 값을 받아 와, 오래된 탭이 새 키·기록을 덮어쓰지 않게 합니다.
 * 보고 있는 메뉴처럼 탭마다 따로 가져야 하는 값은 sync를 끕니다.
 */
export function usePersistentState<T>(
  key: string,
  init: (stored: T | undefined) => T,
  shrink?: (value: T) => T | null,
  sync = true,
) {
  const [value, setValue] = useState<T>(() => init(load<T>(key)));
  const initRef = useRef(init);
  initRef.current = init;
  useEffect(() => {
    if (save(key, value) || !shrink) return;
    const smaller = shrink(value);
    if (smaller !== null) setValue(smaller);
  }, [key, value, shrink]);
  useEffect(() => {
    if (!sync) return;
    // storage 이벤트는 다른 탭이 저장했을 때만 옵니다. 같은 값을 다시 저장하면 오지 않아 서로 주고받으며 돌지 않습니다.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== PREFIX + key) return;
      setValue(initRef.current(load<T>(key)));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, sync]);
  return [value, setValue] as const;
}
