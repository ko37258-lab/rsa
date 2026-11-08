import { useCallback, useEffect, useRef, useState } from "react";
import { canSwitchStt, SttError, transcribe, type SttProvider } from "../ai/transcribe";
import type { SpeechProblem, StopResult } from "./useSpeech";

const MIME_CANDIDATES: [string, string][] = [
  ["audio/webm;codecs=opus", "webm"],
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
  ["audio/ogg;codecs=opus", "ogg"],
];

function pickFormat(): { mimeType: string; ext: string } {
  if (typeof MediaRecorder === "undefined") return { mimeType: "", ext: "webm" };
  for (const [mimeType, ext] of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, ext };
  }
  return { mimeType: "", ext: "webm" };
}

// 너무 짧은 녹음(버튼을 실수로 누른 경우)은 받아쓰지 않습니다.
const MIN_SPOKEN_MS = 500;

interface RecorderOptions {
  lang: string;
  provider: SttProvider;
  apiKey: string;
  hints?: string[];
  /**
   * ElevenLabs·OpenAI가 크레딧·키·차단 문제로 거절하면 같은 녹음을 이 Gemini 키로 다시 받아씁니다.
   * 성공하면 onSwitched가 불려 다음부터 Gemini를 쓰게 설정을 바꿉니다.
   */
  geminiKey?: string;
  onSwitched?: (from: SttProvider, reason: string) => void;
}

export type RecordingOutcome = { text: string; notice?: string } | { error: string };

/**
 * 녹음 하나를 받아씁니다. ElevenLabs·OpenAI가 크레딧·키 문제로 거절하면 같은 녹음을 Gemini로 다시 받아씁니다.
 * 멈췄으면(Esc) null을 돌려줍니다.
 */
export async function transcribeRecording(
  audio: Blob,
  filename: string,
  opts: RecorderOptions,
  signal: AbortSignal,
): Promise<RecordingOutcome | null> {
  try {
    const text = await transcribe(audio, filename, { ...opts, signal });
    return signal.aborted ? null : { text };
  } catch (e) {
    if (signal.aborted) return null;
    const geminiKey = opts.geminiKey?.trim();
    if (!(canSwitchStt(e) && opts.provider !== "gemini" && geminiKey))
      return { error: e instanceof SttError ? e.message : "받아쓰기 중 문제가 생겼습니다. 다시 말해 주세요." };
    // 크레딧이 떨어졌거나 키가 막힌 서비스 대신, 같은 녹음을 Gemini로 다시 받아씁니다.
    try {
      const text = await transcribe(audio, filename, { ...opts, provider: "gemini", apiKey: geminiKey, signal });
      if (signal.aborted) return null;
      opts.onSwitched?.(opts.provider, (e as SttError).message);
      return { text, notice: `${(e as SttError).message.split(".")[0]}. 그래서 Gemini로 받아썼고, 앞으로도 Gemini로 받아씁니다.` };
    } catch (e2) {
      if (signal.aborted) return null;
      return {
        error: `${(e as SttError).message} Gemini로도 받아쓰지 못했습니다: ${e2 instanceof SttError ? e2.message : "다시 말해 주세요."}`,
      };
    }
  }
}

interface Recording {
  audio: Blob;
  filename: string;
  spokenMs: number;
}

/**
 * 녹음 받아쓰기: 마이크 소리를 녹음했다가, 멈추면 받아쓰기 API로 보내 onFinal로 넘깁니다.
 * useSpeech와 같은 모양으로 쓰도록 맞췄습니다.
 */
export function useRecorder(options: RecorderOptions, onFinal: (text: string) => void) {
  const supported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem>(null);
  const [error, setError] = useState<string | null>(null);
  /** 오류는 아니지만 알려 줄 일(예: ElevenLabs 크레딧이 떨어져 Gemini로 받아씀) */
  const [notice, setNotice] = useState<string | null>(null);
  /** 받아쓰지 못한 녹음이 남아 있어 '다시 받아쓰기'를 할 수 있는지 */
  const [canRetry, setCanRetry] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pulse, setPulse] = useState(0);

  const optionsRef = useRef(options);
  const onFinalRef = useRef(onFinal);
  optionsRef.current = options;
  onFinalRef.current = onFinal;

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const meterRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const startingRef = useRef<Promise<void> | null>(null);
  const cancelledRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const stopWaitersRef = useRef<((r: StopResult) => void)[]>([]);
  const failedRef = useRef<Recording | null>(null);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    return () => window.clearInterval(timer);
  }, [listening]);

  const releaseMic = useCallback(() => {
    if (meterRef.current !== null) window.clearInterval(meterRef.current);
    meterRef.current = null;
    void audioRef.current?.close().catch(() => undefined);
    audioRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const settle = useCallback((result: StopResult) => {
    const waiters = stopWaitersRef.current;
    stopWaitersRef.current = [];
    waiters.forEach((resolve) => resolve(result));
  }, []);

  /** 받아쓰기 API로 보내 결과를 onFinal로 넘깁니다. 서버 오류로 실패하면 녹음을 남겨 '다시 받아쓰기'로 다시 보낼 수 있게 합니다. */
  const runTranscribe = useCallback(async (rec: Recording): Promise<boolean> => {
    const ctl = new AbortController();
    abortRef.current = ctl;
    setTranscribing(true);
    try {
      // 다시 받아쓸 때는 그 사이 설정에서 고친 키·서비스로 보냅니다.
      const out = await transcribeRecording(rec.audio, rec.filename, optionsRef.current, ctl.signal);
      if (!out) return false;
      if ("error" in out) {
        failedRef.current = rec;
        setCanRetry(true);
        setError(out.error);
        return false;
      }
      failedRef.current = null;
      setCanRetry(false);
      setError(null);
      if (out.notice) setNotice(out.notice);
      if (out.text) onFinalRef.current(out.text);
      else setError("말소리를 알아듣지 못했습니다. 마이크에 조금 더 가까이 대고 말해 주세요.");
      return !!out.text;
    } finally {
      if (abortRef.current === ctl) abortRef.current = null;
      setTranscribing(false);
    }
  }, []);

  /** 받아쓰지 못한 지난 녹음을 다시 보냅니다. heard는 이번에 받아쓴 글이 생겼는지입니다. */
  const retry = useCallback(async (): Promise<StopResult & { heard: boolean }> => {
    const rec = failedRef.current;
    if (!rec || recorderRef.current || startingRef.current || abortRef.current) return { spokenMs: 0, heard: false };
    cancelledRef.current = false;
    // 지난 오류는 다시 받아쓰는 동안에도 남겨 둡니다 (Esc로 멈춰도 다시 누를 수 있게). 받아쓰면 지워집니다.
    setNotice(null);
    const heard = await runTranscribe(rec);
    return { spokenMs: rec.spokenMs, heard, cancelled: cancelledRef.current };
  }, [runTranscribe]);

  /** 화면의 오류(와 알림)를 지웁니다. 다른 방법(파일·직접 정리)으로 넘어가면 지난 녹음 오류를 남겨 두지 않습니다. */
  const clearMessages = useCallback((alsoNotice = true) => {
    setError(null);
    if (alsoNotice) setNotice(null);
    failedRef.current = null;
    setCanRetry(false);
  }, []);

  const start = useCallback(() => {
    if (recorderRef.current || startingRef.current) return;
    cancelledRef.current = false;
    setError(null);
    setNotice(null);
    setProblem(null);
    // 새로 녹음하면 받아쓰지 못한 지난 녹음은 버립니다.
    failedRef.current = null;
    setCanRetry(false);

    startingRef.current = (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setProblem(name === "NotFoundError" || name === "NotReadableError" ? "no-mic" : "blocked");
        return;
      }
      if (cancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const { mimeType, ext } = pickFormat();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        const spokenMs = Date.now() - startedAtRef.current;
        recorderRef.current = null;
        releaseMic();
        setListening(false);
        setElapsedMs(spokenMs);
        if (cancelledRef.current || spokenMs < MIN_SPOKEN_MS || chunks.length === 0) {
          settle({ spokenMs, cancelled: cancelledRef.current });
          return;
        }
        const audio = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
        try {
          await runTranscribe({ audio, filename: `speech.${ext}`, spokenMs });
        } finally {
          settle({ spokenMs });
        }
      };

      // 말하는 소리 크기에 맞춰 소리 막대를 움직입니다.
      try {
        const audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        audioRef.current = audioCtx;
        meterRef.current = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (const v of samples) sum += v * v;
          if (Math.sqrt(sum / samples.length) > 0.02) setPulse((p) => p + 1);
        }, 140);
      } catch {
        // 소리 막대는 없어도 녹음은 됩니다.
      }

      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setListening(true);
      recorder.start(1000);
    })().finally(() => {
      startingRef.current = null;
    });
  }, [releaseMic, runTranscribe, settle]);

  /** 녹음을 멈추고, 받아쓰기가 끝난 뒤에 끝납니다. */
  const stop = useCallback(async (): Promise<StopResult> => {
    if (startingRef.current) await startingRef.current;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return { spokenMs: 0 };
    return new Promise<StopResult>((resolve) => {
      stopWaitersRef.current.push(resolve);
      recorder.stop();
    });
  }, []);

  /** 녹음과 받아쓰기를 버립니다 (Esc). */
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    abortRef.current?.abort();
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  useEffect(
    () => () => {
      cancelledRef.current = true;
      abortRef.current?.abort();
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      releaseMic();
    },
    [releaseMic],
  );

  return {
    supported,
    listening,
    transcribing,
    problem,
    error,
    notice,
    canRetry,
    elapsedMs,
    pulse,
    start,
    stop,
    cancel,
    retry,
    clearMessages,
  };
}
