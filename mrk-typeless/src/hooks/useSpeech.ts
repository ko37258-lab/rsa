import { useCallback, useEffect, useRef, useState } from "react";

export type SpeechProblem = "unsupported" | "blocked" | "no-mic" | "network" | null;

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

// 안드로이드 크롬은 continuous 모드에서 같은 문장을 여러 번 돌려주므로 짧게 끊어 다시 시작합니다.
const IS_ANDROID = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

export interface StopResult {
  /** 이번에 말한 시간 */
  spokenMs: number;
}

/**
 * 브라우저 음성인식(Web Speech API)으로 받아씁니다.
 * 확정된 문장은 onFinal로 넘기고, 아직 말하는 중인 부분은 interim으로 보여줍니다.
 */
export function useSpeech(lang: string, onFinal: (text: string) => void) {
  const supported = getRecognitionCtor() !== null;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [problem, setProblem] = useState<SpeechProblem>(supported ? null : "unsupported");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pulse, setPulse] = useState(0);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const startedAtRef = useRef(0);
  const interimRef = useRef("");
  const onFinalRef = useRef(onFinal);
  const stopWaitersRef = useRef<((r: StopResult) => void)[]>([]);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => window.clearInterval(timer);
  }, [listening]);

  const finish = useCallback(() => {
    const leftover = interimRef.current.trim();
    if (leftover) onFinalRef.current(leftover);
    interimRef.current = "";
    setInterim("");
    setListening(false);
    const spokenMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;
    setElapsedMs(spokenMs);
    const waiters = stopWaitersRef.current;
    stopWaitersRef.current = [];
    waiters.forEach((resolve) => resolve({ spokenMs }));
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor || wantRef.current) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = !IS_ANDROID;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const said = result[0]?.transcript ?? "";
        if (result.isFinal) {
          if (said.trim()) onFinalRef.current(said.trim());
        } else {
          live += said;
        }
      }
      interimRef.current = live;
      setInterim(live);
      setPulse((p) => p + 1);
    };
    rec.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setProblem("blocked");
      else if (event.error === "audio-capture") setProblem("no-mic");
      else if (event.error === "network") setProblem("network");
      wantRef.current = false;
    };
    rec.onend = () => {
      // 크롬은 잠깐 조용하면 스스로 끝납니다. 아직 말하는 중이면 이어서 듣습니다.
      if (wantRef.current) {
        const leftover = interimRef.current.trim();
        if (leftover) onFinalRef.current(leftover);
        interimRef.current = "";
        setInterim("");
        try {
          rec.start();
          return;
        } catch {
          wantRef.current = false;
        }
      }
      recRef.current = null;
      finish();
    };

    recRef.current = rec;
    wantRef.current = true;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setProblem(null);
    setListening(true);
    try {
      rec.start();
    } catch {
      wantRef.current = false;
      recRef.current = null;
      setProblem("blocked");
      finish();
    }
  }, [lang, finish]);

  /** 듣기를 멈추고, 마지막 문장까지 받은 뒤에 끝납니다. */
  const stop = useCallback((): Promise<StopResult> => {
    const rec = recRef.current;
    wantRef.current = false;
    if (!rec) return Promise.resolve({ spokenMs: 0 });
    return new Promise<StopResult>((resolve) => {
      stopWaitersRef.current.push(resolve);
      try {
        rec.stop();
      } catch {
        finish();
      }
      // 브라우저가 끝 신호를 주지 않는 경우를 대비
      window.setTimeout(() => {
        if (stopWaitersRef.current.length) {
          recRef.current = null;
          finish();
        }
      }, 2500);
    });
  }, [finish]);

  /** 받아쓰기를 버립니다 (Esc). */
  const cancel = useCallback(() => {
    wantRef.current = false;
    interimRef.current = "";
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      try {
        rec.abort();
      } catch {
        /* 이미 끝남 */
      }
    }
    finish();
  }, [finish]);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, interim, problem, elapsedMs, pulse, start, stop, cancel };
}
