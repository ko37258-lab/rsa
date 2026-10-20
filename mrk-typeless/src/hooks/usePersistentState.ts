import { useEffect, useState } from "react";
import { load, save } from "../lib/storage";

/** 이 브라우저에 저장되는 상태. init은 저장된 값(없으면 undefined)으로 첫 값을 만듭니다. */
export function usePersistentState<T>(key: string, init: (stored: T | undefined) => T) {
  const [value, setValue] = useState<T>(() => init(load<T>(key)));
  useEffect(() => {
    save(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
