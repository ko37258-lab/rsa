import { useCallback, useRef, useState } from "react";
import { EngineError, runAi } from "../ai/engine";
import type { AiRequest } from "../lib/prompts";
import type { EngineId, Settings } from "../lib/settings";

export type RunStatus = "idle" | "thinking" | "streaming" | "done" | "error";

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

  return { status, text, error, run, cancel, show, busy: status === "thinking" || status === "streaming" };
}
