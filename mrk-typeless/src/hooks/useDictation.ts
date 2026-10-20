import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "../lib/settings";
import { useRecorder } from "./useRecorder";
import { useSpeech, type StopResult } from "./useSpeech";

/**
 * 받아쓰기 엔진 고르기.
 * - 브라우저 음성인식: 무료, 말하는 동안 글자가 바로 보임. 단, Chrome은 구글 서버를 거치므로
 *   웨일·브레이브 같은 브라우저나 막힌 네트워크에서는 "연결 실패"가 납니다.
 * - 녹음 받아쓰기: 다 말한 뒤 녹음 파일을 받아쓰기 API로 보냅니다. 어느 브라우저에서나 됩니다.
 * "자동"이면 브라우저 음성인식을 먼저 쓰고, 연결에 실패하면 녹음 받아쓰기로 이어서 듣습니다.
 */
export function useDictation(settings: Settings, onFinal: (text: string) => void) {
  const speech = useSpeech(settings.speechLang, onFinal);
  const recorder = useRecorder(
    { lang: settings.speechLang, provider: settings.sttProvider, apiKey: settings.sttKey },
    onFinal,
  );
  const hasKey = !__ARTIFACT__ && settings.sttKey.trim().length > 0 && recorder.supported;
  const [browserFailed, setBrowserFailed] = useState(false);
  const wantRef = useRef(false);

  const useRecord =
    settings.speechEngine === "record"
      ? hasKey
      : settings.speechEngine === "auto" && hasKey && (browserFailed || !speech.supported);

  // 브라우저 음성인식이 서버에 연결하지 못하면, 누르고 있던 그대로 녹음 받아쓰기로 이어 갑니다.
  useEffect(() => {
    if (speech.problem !== "network" || settings.speechEngine !== "auto" || !hasKey) return;
    setBrowserFailed(true);
    if (wantRef.current) recorder.start();
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
    return { spokenMs: Math.max(a.spokenMs, b.spokenMs) };
  }, [speech, recorder]);

  const cancel = useCallback(() => {
    wantRef.current = false;
    speech.cancel();
    recorder.cancel();
  }, [speech, recorder]);

  const recording = recorder.listening;
  // 녹음 받아쓰기로 넘어갔으면 브라우저 음성인식의 연결 실패는 더 보여주지 않습니다.
  const speechProblem = browserFailed && hasKey ? null : speech.problem;

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
