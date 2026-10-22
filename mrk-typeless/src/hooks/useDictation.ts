import { useCallback, useEffect, useRef, useState } from "react";
import { browserName, hasNativeSpeechService } from "../lib/browser";
import { sttKeyFor, sttProviderFor, type Settings } from "../lib/settings";
import { load, save } from "../lib/storage";
import { useRecorder } from "./useRecorder";
import { useSpeech, type StopResult } from "./useSpeech";

/**
 * 받아쓰기 엔진 고르기.
 * - 브라우저 음성인식: 무료, 말하는 동안 글자가 바로 보임. 단, Chrome은 구글 서버를 거치므로
 *   Aside·웨일·브레이브 같은 Chrome 바탕 브라우저나 막힌 네트워크에서는 "연결 실패"가 납니다.
 * - 녹음 받아쓰기: 다 말한 뒤 녹음 파일을 받아쓰기 API로 보냅니다. 어느 브라우저에서나 됩니다.
 * "자동"이면 브라우저 음성인식을 먼저 쓰고, 연결에 실패하면 녹음 받아쓰기로 이어서 듣습니다.
 */
// 한 번 실패한 브라우저는 기억해 두고, 다음부터 바로 안내하거나 녹음 받아쓰기로 시작합니다.
// Chrome·Edge·Safari는 잠깐의 네트워크 문제일 수 있어 기억하지 않습니다.
const FAILED_KEY = "speechFailedBrowsers";

function rememberedFailure(): boolean {
  const name = browserName();
  return !hasNativeSpeechService(name) && (load<string[]>(FAILED_KEY) ?? []).includes(name);
}

function rememberFailure(failed: boolean): void {
  const name = browserName();
  if (hasNativeSpeechService(name)) return;
  const list = (load<string[]>(FAILED_KEY) ?? []).filter((n) => n !== name);
  save(FAILED_KEY, failed ? [...list, name] : list);
}

export function useDictation(settings: Settings, onFinal: (text: string) => void, hints?: string[]) {
  const [browserFailed, setBrowserFailed] = useState(rememberedFailure);
  const failedRef = useRef(browserFailed);
  failedRef.current = browserFailed;

  const speech = useSpeech(settings.speechLang, (text) => {
    // 브라우저 음성인식이 실제로 되면 실패 기억을 지웁니다.
    if (failedRef.current) {
      setBrowserFailed(false);
      rememberFailure(false);
    }
    onFinal(text);
  });
  const recorder = useRecorder(
    { lang: settings.speechLang, provider: sttProviderFor(settings), apiKey: sttKeyFor(settings), hints },
    onFinal,
  );
  const hasKey = !__ARTIFACT__ && sttKeyFor(settings).trim().length > 0 && recorder.supported;
  const wantRef = useRef(false);

  const useRecord =
    settings.speechEngine === "record"
      ? hasKey
      : settings.speechEngine === "auto" && hasKey && (browserFailed || !speech.supported);

  // 브라우저 음성인식이 서버에 연결하지 못하면, 누르고 있던 그대로 녹음 받아쓰기로 이어 갑니다.
  useEffect(() => {
    if (speech.problem !== "network") return;
    setBrowserFailed(true);
    rememberFailure(true);
    if (settings.speechEngine === "auto" && hasKey && wantRef.current) recorder.start();
    // recorder.start는 바뀌지 않는 함수입니다.
  }, [speech.problem, settings.speechEngine, hasKey, recorder.start]);

  const start = useCallback(() => {
    wantRef.current = true;
    if (useRecord) recorder.start();
    else speech.start();
  }, [useRecord, recorder, speech]);

  const stop = useCallback(async (): Promise<StopResult> => {
    wantRef.current = false;
    const [a, b] = await Promise.all([speech.stop(), recorder.stop()]);
    return { spokenMs: Math.max(a.spokenMs, b.spokenMs), cancelled: !!(a.cancelled || b.cancelled) };
  }, [speech, recorder]);

  const cancel = useCallback(() => {
    wantRef.current = false;
    speech.cancel();
    recorder.cancel();
  }, [speech, recorder]);

  const recording = recorder.listening;
  // 녹음 받아쓰기로 넘어갔으면 연결 실패는 더 보여주지 않고,
  // 아직 키가 없으면 누르기 전에도 이 브라우저에서는 안 된다고 미리 알려 줍니다.
  const speechProblem = speech.problem ?? (browserFailed ? ("network" as const) : null);

  return {
    engine: useRecord || recording ? ("record" as const) : ("browser" as const),
    supported: speech.supported || hasKey,
    listening: speech.listening || recording,
    transcribing: recorder.transcribing,
    interim: speech.interim,
    problem: useRecord ? recorder.problem : speechProblem,
    error: recorder.error,
    elapsedMs: recording || useRecord ? recorder.elapsedMs : speech.elapsedMs,
    pulse: speech.pulse + recorder.pulse,
    hasKey,
    start,
    stop,
    cancel,
  };
}
