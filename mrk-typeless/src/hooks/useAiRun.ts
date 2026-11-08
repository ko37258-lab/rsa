import { useCallback, useRef, useState } from "react";
import { EngineError, runAi } from "../ai/engine";
import type { AiRequest } from "../lib/prompts";
import type { EngineId, Settings } from "../lib/settings";

export type RunStatus = "idle" | "thinking" | "streaming" | "done" | "error";

/** ms만큼 기다립니다. 그 전에 멈추면 바로 false로 끝납니다. */
export function waitUnlessAborted(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** AI 정리 한 번의 진행 상태(생각 중 → 쓰는 중 → 완료/오류)와 멈춤 버튼을 관리합니다. */
export function useAiRun() {
  const [status, setStatus] = useState<RunStatus>("idle");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ctlRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (engine: EngineId, req: AiRequest, settings: Settings, fresh = false): Promise<string | null> => {
      ctlRef.current?.abort();
      const ctl = new AbortController();
      ctlRef.current = ctl;
      setStatus("thinking");
      setText("");
      setError(null);
      try {
        const result = await runAi(engine, req, settings, {
          signal: ctl.signal,
          fresh,
          onText: (t) => {
            if (ctl.signal.aborted) return;
            setStatus("streaming");
            setText(t);
          },
        });
        if (ctlRef.current !== ctl) return null;
        setText(result);
        setStatus("done");
        return result;
      } catch (e) {
        if (ctlRef.current !== ctl) return null;
        const err = e instanceof EngineError ? e : new EngineError("failed", "정리 중 문제가 생겼습니다.");
        setText(err.partial ?? "");
        if (err.code === "cancelled") {
          setStatus(err.partial ? "done" : "idle");
        } else {
          setError(err.message);
          setStatus("error");
        }
        return null;
      } finally {
        if (ctlRef.current === ctl) ctlRef.current = null;
      }
    },
    [],
  );

  const cancel = useCallback(() => ctlRef.current?.abort(), []);

  /** 엔진 없이 만든 결과(기본 정리, 예시)를 그대로 보여줄 때 */
  const show = useCallback((value: string) => {
    ctlRef.current?.abort();
    ctlRef.current = null;
    setError(null);
    setText(value);
    setStatus(value ? "done" : "idle");
  }, []);

  /**
   * AI 없이 만든 결과도 잠깐 '정리하는 중' 화면(줄 긋기)을 보여 준 뒤 나타나게 합니다.
   * 그 사이 멈추기·Esc를 누르면 결과를 내지 않고 false를 돌려줍니다 (기록·복사도 하지 않게).
   */
  const simulate = useCallback(async (value: string, ms = 1100): Promise<boolean> => {
    ctlRef.current?.abort();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    setError(null);
    setText("");
    setStatus("thinking");
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const finished = await waitUnlessAborted(reduced ? 0 : ms, ctl.signal);
    if (ctlRef.current === ctl) ctlRef.current = null;
    if (!finished) {
      // 멈추기를 눌렀으면 비워 두고, 다른 정리가 이어받았으면 그쪽 화면을 건드리지 않습니다.
      if (ctlRef.current === null) setStatus((s) => (s === "thinking" ? "idle" : s));
      return false;
    }
    setText(value);
    setStatus(value ? "done" : "idle");
    return true;
  }, []);

  return { status, text, error, run, cancel, show, simulate, busy: status === "thinking" || status === "streaming" };
}
