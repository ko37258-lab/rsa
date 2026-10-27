import { useCallback, useEffect, useRef, useState } from "react";
import { useAiRun } from "../hooks/useAiRun";
import { useDictation } from "../hooks/useDictation";
import { browserName, hasNativeSpeechService } from "../lib/browser";
import { copyText } from "../lib/clipboard";
import { applyReplacements, type Dictionary } from "../lib/dictionary";
import { newId, type HistoryItem } from "../lib/history";
import { localCleanup } from "../lib/localCleanup";
import { sanitizeDictation } from "../lib/sanitize";
import { MODES, getMode, type ModeId } from "../lib/modes";
import { buildPolishPrompt, type AiRequest } from "../lib/prompts";
import { sttKeyFor, sttProviderFor, type EngineId, type Settings } from "../lib/settings";
import { SttError } from "../ai/transcribe";
import {
  fileMime,
  MAX_FILE_BYTES,
  mediaDurationSec,
  transcribeAudioFile,
  type FileProgress,
} from "../ai/transcribeFile";
import { countChars, estimateSavedMs, formatClock, formatDuration } from "../lib/stats";
import { load, save } from "../lib/storage";
import { HandNote } from "./HandNote";
import { KeyboardDictationTip } from "./KeyboardDictationTip";
import { MicButton, Waveform } from "./MicButton";
import { ComparePanel } from "./ComparePanel";
import { ResultPanel } from "./ResultPanel";
import { Segmented } from "./Segmented";
import { StrikePreview } from "./StrikePreview";

const EXAMPLE_RAW =
  "음 그러니까 이번 주 목요일 아 아니다 금요일 오후 세 시에 어 분당 정자동 그 상가 건물 현장 답사 가기로 했고요 어 확인할 거는 일단 용도지역이랑 어 건폐률 용적율 그리고 뭐 지구 단위 계획 있는지 그거 확인하고 마지막으로 주차장 그 대수 확인하면 될 것 같아요";

const EXAMPLE_RESULT = `이번 주 금요일 오후 3시에 분당 정자동 상가 건물 현장 답사를 가기로 했습니다.

확인할 사항은 다음과 같습니다.
- 용도지역
- 건폐율·용적률
- 지구단위계획 수립 여부
- 주차장 대수`;

export const ENGINE_LABEL: Record<EngineId, string> = {
  account: "내 Claude 계정",
  apikey: "Claude API",
  gemini: "Gemini API",
  local: "기본 정리(AI 없이)",
};

interface Props {
  /** 받아쓰기 탭이 보일 때만 단축키가 동작합니다 */
  active: boolean;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  dictionary: Dictionary;
  engine: EngineId;
  accountAvailable: boolean;
  firstVisit: boolean;
  onSave: (item: HistoryItem) => void;
  onSendToEdit: (text: string) => void;
  onOpenSettings: () => void;
}

// 키보드 음성 입력(Win+H 등)으로 원문 칸에 말한 뒤 이만큼 조용하면 자동으로 정리합니다.
const VOICE_IDLE_MS = 3000;

const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName);
}

export function DictateView({
  active,
  settings,
  onSettings,
  dictionary,
  engine,
  accountAvailable,
  firstVisit,
  onSave,
  onSendToEdit,
  onOpenSettings,
}: Props) {
  const [raw, setRaw] = useState<string>(() => load<string>("draft") ?? (firstVisit ? EXAMPLE_RAW : ""));
  const [isExample, setIsExample] = useState(() => load<string>("draft") === undefined && firstVisit);
  const [original, setOriginal] = useState(isExample ? EXAMPLE_RAW : "");
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const rawRef = useRef(raw);
  const exampleRef = useRef(isExample);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const originalRef = useRef(original);
  originalRef.current = original;
  const ai = useAiRun();
  // 지금 보이는 정리 글을 만든 엔진 (비교에서 다른 쪽을 고르면 바뀝니다)
  const [resultEngine, setResultEngine] = useState<EngineId>(engine);
  const [compare, setCompare] = useState<{ id: number; req: AiRequest } | null>(null);
  const [swapKey, setSwapKey] = useState(0);

  const updateRaw = useCallback((next: string) => {
    rawRef.current = next;
    setRaw(next);
  }, []);

  const leaveExample = useCallback(() => {
    if (!exampleRef.current) return false;
    exampleRef.current = false;
    setIsExample(false);
    setOriginal("");
    return true;
  }, []);

  const appendFinal = useCallback(
    (text: string) => {
      const base = leaveExample() ? "" : rawRef.current.trimEnd();
      updateRaw(base ? `${base} ${text}` : text);
    },
    [leaveExample, updateRaw],
  );

  const speech = useDictation(settings, appendFinal, dictionary.terms, onSettings);

  useEffect(() => {
    if (isExample) ai.show(EXAMPLE_RESULT);
    // 첫 화면에서 한 번만 예시를 보여줍니다.
  }, []);

  useEffect(() => {
    if (!isExample) save("draft", raw);
  }, [raw, isExample]);

  // 키보드 음성 입력 감지: 손으로 친 글자는 키 누름이 먼저 오고, Win+H 같은 음성 입력은
  // 키 누름 없이 글자만 들어옵니다. 음성으로 들어온 글이 있고 잠시 조용해지면 자동 정리합니다.
  const lastKeyAtRef = useRef(0);
  const composingRef = useRef(false);
  const voiceTypedRef = useRef(false);
  const idleTimerRef = useRef<number | null>(null);
  const [voicePending, setVoicePending] = useState(false);

  const clearVoiceTimer = useCallback(() => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    setVoicePending(false);
  }, []);

  /** 사전의 바꿔쓰기를 적용한 원문과, 그 원문으로 만든 AI 지시 */
  const requestFor = useCallback(
    (source: string): { corrected: string; req: AiRequest } => {
      const { text: corrected } = applyReplacements(source, dictionary.replacements);
      const req = buildPolishPrompt(corrected, getMode(settings.mode), {
        dictionary,
        styleNote: settings.styleNote,
        targetLanguage: settings.targetLanguage,
        signature: settings.signature,
      });
      return { corrected, req };
    },
    [dictionary, settings.mode, settings.signature, settings.styleNote, settings.targetLanguage],
  );

  const polish = useCallback(
    async (fresh = false, spokenMs?: number) => {
      // Win+H가 끼워 넣은 깨진 문자는 원문 칸에서도 지웁니다.
      // 직접 '정리하기'를 눌렀으면 기다리던 음성 입력 자동 정리는 취소합니다.
      voiceTypedRef.current = false;
      clearVoiceTimer();
      const source = sanitizeDictation(rawRef.current).trim();
      if (!source) return;
      if (source !== rawRef.current.trim()) updateRaw(source);
      leaveExample();
      setNote(null);
      setCopyNote(null);
      setLastSaved(null);
      setOriginal(source);
      setCompare(null);
      setResultEngine(engine);
      const mode = getMode(settings.mode);
      const { corrected, req } = requestFor(source);

      let result: string | null;
      if (engine === "local") {
        const { text, removed } = localCleanup(corrected);
        await ai.simulate(text);
        result = text;
        setNote(
          mode.id === "clean"
            ? `군더더기 ${removed}개를 지웠습니다. 말을 바꾼 부분과 목록 정리는 AI 정리에서 됩니다.`
            : `AI가 꺼져 있어 '${mode.label}' 형식 대신 기본 정리만 했습니다. 설정에서 AI 정리를 켜 주세요.`,
        );
      } else {
        result = await ai.run(engine, req, settings, fresh);
      }
      if (!result) return;

      const savedMs = estimateSavedMs(result, source, spokenMs);
      setLastSaved(savedMs);
      onSave({
        id: newId(),
        createdAt: Date.now(),
        kind: "dictation",
        mode: mode.id,
        raw: source,
        result,
        engine,
        spokenMs,
        savedMs,
      });
      if (settings.autoCopy) {
        const ok = await copyText(result);
        // 모바일 Safari 등은 사용자가 직접 누르지 않은 복사를 막습니다. 그럴 땐 솔직히 알려 '복사' 버튼으로 이끕니다.
        setCopyNote(
          ok
            ? "클립보드에 복사했습니다. 쓰던 곳에 붙여넣기만 하세요."
            : "이 브라우저는 자동 복사를 막았습니다. 아래 '복사' 버튼을 눌러 주세요.",
        );
      }
    },
    [ai, clearVoiceTimer, engine, leaveExample, onSave, requestFor, settings, updateRaw],
  );

  const spokenRef = useRef<number | undefined>(undefined);
  const rawAtStartRef = useRef<string | null>(null);
  const stopAndPolish = useCallback(async () => {
    // 같은 세션을 두 번 멈추지 않습니다 (마이크 두 번 탭, Space 떼기 + 클릭 등).
    const rawAtStart = rawAtStartRef.current;
    if (rawAtStart === null) return;
    rawAtStartRef.current = null;
    const { spokenMs, cancelled } = await speech.stop();
    if (cancelled) return;
    spokenRef.current = spokenMs;
    // 이번에 받아쓴 말이 없으면(인식 실패 등) 예전 원문을 다시 정리하지 않습니다.
    const heardSomething = rawRef.current !== rawAtStart;
    if (settings.autoPolish && heardSomething) await polish(false, spokenMs);
  }, [polish, settings.autoPolish, speech]);

  // ── 녹음 파일 올리기: 휴대폰 녹음·강의 녹음·영상을 글로 바꾼 뒤 원문 칸에 넣고 정리합니다 ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileAbortRef = useRef<AbortController | null>(null);
  const [fileJob, setFileJob] = useState<{
    name: string;
    size: number;
    durationSec: number | null;
    progress: FileProgress | null;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileNotice, setFileNotice] = useState<string | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (fileAbortRef.current || speech.listening || speech.transcribing || ai.busy) return;
      setFileError(null);
      setFileNotice(null);
      const provider = sttProviderFor(settings);
      const apiKey = sttKeyFor(settings).trim();
      if (!apiKey) {
        setFileError("녹음 파일을 글로 바꾸려면 설정에서 Gemini API 키를 넣어 주세요. Google AI Studio에서 무료로 만들 수 있습니다.");
        return;
      }
      if (!fileMime(file.name, file.type)) {
        setFileError(`'${file.name}'은 녹음·영상 파일이 아닙니다. m4a·mp3·wav·mp4 같은 파일을 올려 주세요.`);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setFileError("파일이 2GB보다 큽니다. 나눠서 올려 주세요.");
        return;
      }
      const ctl = new AbortController();
      fileAbortRef.current = ctl;
      setFileJob({ name: file.name, size: file.size, durationSec: null, progress: null });
      try {
        const durationSec = await mediaDurationSec(file);
        if (ctl.signal.aborted) return;
        setFileJob((j) => j && { ...j, durationSec });
        const out = await transcribeAudioFile(file, {
          provider,
          apiKey,
          geminiKey: settings.geminiKey,
          lang: settings.speechLang,
          hints: dictionary.terms,
          durationSec,
          signal: ctl.signal,
          onProgress: (progress) => setFileJob((j) => j && { ...j, progress }),
        });
        if (ctl.signal.aborted) return;
        const notes: string[] = [];
        if (out.switchedFrom) {
          if (out.switchForGood) onSettings({ sttProvider: "gemini" });
          notes.push(`${out.reason}. 그래서 Gemini로 받아썼습니다.${out.switchForGood ? " 앞으로도 Gemini로 받아씁니다." : ""}`);
        }
        if (out.missed)
          notes.push(`${out.missed}곳은 받아쓰지 못해 원문에 [표시]를 남겼습니다. 그 부분만 다시 올리거나 직접 채워 주세요.`);
        if (out.stopped) notes.push(`뒷부분은 받아쓰지 못했습니다: ${out.stopped}`);
        const text = sanitizeDictation(out.text).trim();
        if (!text) {
          setFileError("이 녹음에서 말소리를 찾지 못했습니다. 다른 파일을 올려 주세요.");
          setFileNotice(notes.join(" ") || null); // Gemini로 넘긴 일은 알려 둡니다
          return;
        }
        // 첫 화면의 예시 결과가 남아 받아쓴 녹음의 정리 결과처럼 보이지 않게 지웁니다.
        const wasExample = leaveExample();
        if (wasExample) ai.show("");
        // 아직 정리하지 않은 글이 원문 칸에 있으면 지우지 않고 그 뒤에 이어 붙입니다 (마이크 받아쓰기처럼).
        const before = wasExample ? "" : rawRef.current.trim();
        const keep = before !== "" && before !== originalRef.current.trim();
        if (keep) notes.push("원문 칸에 있던 글 뒤에 이어 붙였습니다.");
        setFileError(null);
        updateRaw(keep ? `${before}\n\n${text}` : text);
        spokenRef.current = durationSec ? Math.round(durationSec * 1000) : undefined;
        fileAbortRef.current = null;
        setFileJob(null);
        // 받아쓰는 몇 분 사이에 형식·엔진을 바꿨을 수 있으니, 지금 화면의 설정으로 정리합니다.
        if (settingsRef.current.autoPolish) await latest.current.polish(false, spokenRef.current);
        else notes.push("받아쓴 글을 원문 칸에 넣었습니다. '정리하기'를 누르세요.");
        setFileNotice(notes.join(" ") || null);
      } catch (e) {
        if (!ctl.signal.aborted)
          setFileError(e instanceof SttError ? e.message : "녹음 파일을 받아쓰는 중 문제가 생겼습니다. 다시 올려 주세요.");
      } finally {
        if (fileAbortRef.current === ctl) fileAbortRef.current = null;
        setFileJob((j) => (fileAbortRef.current ? j : null));
      }
    },
    [ai, dictionary.terms, leaveExample, onSettings, settings, speech.listening, speech.transcribing, updateRaw],
  );

  const cancelFile = useCallback(() => {
    fileAbortRef.current?.abort();
    fileAbortRef.current = null;
    setFileJob(null);
    setFileNotice("녹음 파일 받아쓰기를 멈췄습니다.");
  }, []);

  // 화면 어디에든 녹음 파일을 끌어다 놓으면 받아씁니다. 받아쓰기 칸 밖에 놓쳐도 브라우저가 파일을 열어
  // 이 화면(받아쓴 글)을 떠나지 않게 막습니다.
  // 다른 탭(음성 편집 등)에 놓친 파일도 막아 둡니다: 받아쓰는 도중 페이지가 바뀌면 작업이 사라집니다.
  const handleFileRef = useRef(handleFile);
  handleFileRef.current = handleFile;
  const dropRef = useRef({ active, busy: false });
  dropRef.current = { active, busy: !!fileJob || ai.busy || speech.listening || speech.transcribing };
  useEffect(() => {
    if (__ARTIFACT__) return;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types?.includes("Files");
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const { active, busy } = dropRef.current;
      if (!active) return;
      const f = e.dataTransfer?.files?.[0];
      if (!f || !fileMime(f.name, f.type)) {
        setFileError("녹음·영상 파일만 올릴 수 있습니다 (m4a·mp3·wav·mp4 등).");
        return;
      }
      if (busy) {
        setFileNotice("지금 받아쓰거나 정리하는 중입니다. 끝난 뒤 다시 올려 주세요.");
        return;
      }
      void handleFileRef.current(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
    };
  }, []);

  // 받아쓰는 동안 창을 닫거나 새로 고치려 하면 한 번 묻습니다.
  const jobRunning = !!fileJob;
  useEffect(() => {
    if (!jobRunning) return;
    const ask = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [jobRunning]);

  // 비교에서 고른 글로 바꾸고, 방금 기록도 그 글로 고칩니다 (같은 원문이면 기록이 덮어써집니다).
  const adopt = useCallback(
    async (text: string, from: EngineId, brand: string) => {
      ai.show(text);
      setResultEngine(from);
      setSwapKey((k) => k + 1);
      setNote(null);
      const savedMs = estimateSavedMs(text, original, spokenRef.current);
      setLastSaved(savedMs);
      onSave({
        id: newId(),
        createdAt: Date.now(),
        kind: "dictation",
        mode: settings.mode,
        raw: original,
        result: text,
        engine: from,
        spokenMs: spokenRef.current,
        savedMs,
      });
      const ok = settings.autoCopy && (await copyText(text));
      setCopyNote(`${brand}가 정리한 글로 바꿨습니다.${ok ? " 클립보드에도 복사했습니다." : ""}`);
    },
    [ai, onSave, original, settings.autoCopy, settings.mode],
  );

  const [usedMic, setUsedMic] = useState(() => load<boolean>("usedMic") === true);

  const startListening = useCallback(() => {
    if (!usedMic) {
      setUsedMic(true);
      save("usedMic", true);
    }
    ai.cancel();
    if (leaveExample()) {
      updateRaw("");
      ai.show("");
    }
    rawAtStartRef.current = rawRef.current;
    speech.start();
  }, [ai, leaveExample, speech, updateRaw, usedMic]);

  // 단축키: Space 길게 누르기 = 말하기, Ctrl/⌘+Enter = 정리, Esc = 멈춤
  const latest = useRef({ active, startListening, stopAndPolish, polish, speech, ai, cancelFile });
  latest.current = { active, startListening, stopAndPolish, polish, speech, ai, cancelFile };

  const scheduleVoicePolish = useCallback(() => {
    clearVoiceTimer();
    if (!settings.autoPolish || !voiceTypedRef.current || composingRef.current) return;
    setVoicePending(true);
    idleTimerRef.current = window.setTimeout(() => {
      idleTimerRef.current = null;
      setVoicePending(false);
      if (!voiceTypedRef.current || composingRef.current) return;
      voiceTypedRef.current = false;
      void latest.current.polish(false);
    }, VOICE_IDLE_MS);
  }, [clearVoiceTimer, settings.autoPolish]);

  useEffect(() => clearVoiceTimer, [clearVoiceTimer]);

  useEffect(() => {
    let spaceHeld = false;
    const down = (e: KeyboardEvent) => {
      const { active, startListening, polish, speech, ai, cancelFile } = latest.current;
      // 사용법 같은 대화 상자가 열려 있으면 뒤에서 단축키가 동작하지 않게 합니다.
      if (!active || document.querySelector("dialog[open]")) return;
      // 녹음 파일을 받아쓰는 동안에는 Esc(멈추기)만 받습니다. Space로 마이크가 켜지거나 Ctrl+Enter로 옛 원문이 정리되지 않게.
      if (fileAbortRef.current) {
        if (e.key === "Escape") {
          // 정리가 돌고 있으면 그것부터 멈추고, 아니면 녹음 파일 받아쓰기를 멈춥니다.
          if (ai.busy) ai.cancel();
          else cancelFile();
        }
        return;
      }
      if (e.key === "Escape") {
        if (speech.listening || speech.transcribing) {
          speech.cancel();
          rawAtStartRef.current = null;
        }
        ai.cancel();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!ai.busy) void polish(false, spokenRef.current);
        return;
      }
      // 글 칸·버튼이 아니거나 마이크 버튼이면 Space는 말하기. (마우스로 누른 버튼은 press.ts가 포커스를 풀어 줍니다.)
      const onMic = !!(e.target as HTMLElement | null)?.closest?.(".mic");
      if (e.code === "Space" && !e.repeat && (onMic || !isEditable(e.target)) && !speech.listening && !speech.transcribing) {
        e.preventDefault();
        spaceHeld = true;
        startListening();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space" && spaceHeld) {
        spaceHeld = false;
        e.preventDefault();
        void latest.current.stopAndPolish();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const micUnavailable = speech.problem === "unsupported" || speech.problem === "blocked";
  const recordMode = speech.engine === "record";
  const stateLabel = speech.transcribing
    ? "받아쓰는 중…"
    : speech.listening
      ? recordMode
        ? "녹음 중"
        : "듣는 중"
      : micUnavailable
        ? "키보드 음성 입력"
        : "누르고 말하기";
  const mode = getMode(settings.mode);
  const resultChars = countChars(ai.text);
  const rawChars = countChars(original);

  return (
    <div className="view dictate">
      <section className="modes" aria-label="글의 형식">
        <p className="eyebrow">
          <span className="eyebrow__icon" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M3 4h10M3 8h7M3 12h9" />
            </svg>
          </span>
          글의 형식
        </p>
        <Segmented
          variant="chips"
          ariaLabel="글의 형식"
          value={settings.mode}
          onChange={(id) => onSettings({ mode: id as ModeId })}
          options={MODES.map((m) => ({ id: m.id, label: m.label }))}
        />
        <p key={mode.id} className="modes__hint">
          {mode.hint}
          {mode.id === "translate" && ` · ${settings.targetLanguage}`}
        </p>
      </section>

      <section className="stage">
        <div className="stage__mic">
          {!usedMic && <HandNote text="꾹 누르고 말해 보세요" className="stage__note" />}
          <MicButton
            listening={speech.listening}
            disabled={speech.transcribing || !!fileJob}
            pulse={speech.pulse}
            label={speech.listening ? "받아쓰기 멈추고 정리하기" : "누르고 말하기"}
            onPressStart={startListening}
            onHoldEnd={() => void stopAndPolish()}
            onToggle={() => void stopAndPolish()}
          />
          <div className="stage__status">
            <span className={`stage__state${speech.listening ? " is-live" : ""}`}>{stateLabel}</span>
            <span className="stage__clock">{formatClock(speech.elapsedMs)}</span>
          </div>
          <Waveform live={speech.listening} pulse={speech.pulse} />
          <p className="stage__help">
            길게 누르면 누르는 동안만, 짧게 누르면 다시 누를 때까지 받아씁니다.
          </p>
          <span className="stage__engine">{recordMode ? "녹음 받아쓰기" : "브라우저 음성인식"}</span>
          {!__ARTIFACT__ && (
            <>
              <button
                type="button"
                className="btn btn--ghost stage__file"
                onClick={() => fileInputRef.current?.click()}
                disabled={!!fileJob || speech.listening || speech.transcribing || ai.busy}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 16V4m0 0-4 4m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
                </svg>
                녹음 파일 올리기
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.webm,.mp4,.mov"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleFile(f);
                }}
              />
            </>
          )}
        </div>

        <div className="stage__pad">
          <div className="pad__head">
            <label htmlFor="raw" className="label">
              받아쓴 원문
            </label>
            {isExample && <span className="tag">예시</span>}
          </div>
          <textarea
            id="raw"
            className="pad__text"
            value={raw}
            readOnly={!!fileJob}
            placeholder="마이크를 누르고 말하거나, 이 칸을 누르고 키보드의 음성 입력으로 말하세요."
            onFocus={() => {
              // 예시 문장이 있으면 지우고 새로 받아씁니다.
              if (leaveExample()) {
                updateRaw("");
                ai.show("");
              }
            }}
            onKeyDown={(e) => {
              // 키보드로 친 글자는 '직접 입력'으로 봅니다 (Win+H 음성 입력은 키 누름 없이 글자만 들어옵니다).
              // 휴대폰 키보드는 code가 비어 있고 keyCode 229로 오므로 code는 보지 않습니다.
              if (!e.metaKey && e.key !== "Meta" && e.key !== "OS") {
                lastKeyAtRef.current = Date.now();
                voiceTypedRef.current = false;
                clearVoiceTimer();
              }
            }}
            onPaste={() => {
              lastKeyAtRef.current = Date.now();
              voiceTypedRef.current = false;
              clearVoiceTimer();
            }}
            onDrop={() => {
              lastKeyAtRef.current = Date.now();
              voiceTypedRef.current = false;
              clearVoiceTimer();
            }}
            onCompositionStart={() => {
              composingRef.current = true;
              if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
              idleTimerRef.current = null;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
              scheduleVoicePolish();
            }}
            onChange={(e) => {
              leaveExample();
              const grew = e.target.value.trim().length > rawRef.current.trim().length;
              updateRaw(e.target.value);
              // 직접 고친 글에는 지난 녹음 시간을 붙이지 않습니다 (아낀 시간 계산용).
              spokenRef.current = undefined;
              if (grew && Date.now() - lastKeyAtRef.current > 1200) voiceTypedRef.current = true;
              scheduleVoicePolish();
            }}
            rows={6}
          />
          {voicePending && (
            <p className="pad__interim pad__interim--voice">
              음성 입력을 받았습니다. 말을 멈추면 3초 뒤 자동으로 정리합니다.
            </p>
          )}
          {speech.interim && <p className="pad__interim">{speech.interim}</p>}
          {speech.listening && recordMode && <p className="pad__interim">녹음하고 있습니다. 다 말하면 마이크를 떼거나 다시 누르세요.</p>}
          {fileJob && <FileJobStatus job={fileJob} onCancel={cancelFile} />}
          <div className="pad__bar">
            <span className="pad__count">{countChars(raw)}자</span>
            <div className="pad__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  leaveExample();
                  updateRaw("");
                  spokenRef.current = undefined;
                }}
                disabled={!raw}
              >
                지우기
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void polish(false, spokenRef.current)} disabled={!raw.trim() || ai.busy || !!fileJob}>
                정리하기
                <kbd>{MOD_KEY} ↵</kbd>
              </button>
            </div>
          </div>
        </div>
      </section>

      {micUnavailable && <KeyboardDictationTip reason={speech.problem} />}
      {speech.problem === "no-mic" && <p className="notice">마이크를 찾지 못했습니다. 마이크가 연결되어 있는지 확인해 주세요.</p>}
      {speech.problem === "network" && (
        <aside className="tip tip--warn" aria-label="음성인식 연결 실패 안내">
          <p className="tip__head">
            {hasNativeSpeechService() ? (
              <>
                <strong>{browserName()}에서 음성인식 서버에 연결하지 못했습니다.</strong> 회사·학교 네트워크나 VPN이 구글 음성인식 서버를
                막고 있을 수 있습니다.
              </>
            ) : (
              <>
                <strong>{browserName()}에서는 무료 브라우저 음성인식을 쓸 수 없습니다.</strong> 이 기능은 구글 정식 Chrome·Edge에서만
                되고, Aside·웨일·브레이브처럼 Chrome을 바탕으로 만든 브라우저에서는 막혀 있습니다.
              </>
            )}
          </p>
          <ul className="tip__fixes">
            <li>
              <strong>가장 확실한 방법:</strong> 설정에서 <em>녹음 받아쓰기</em> API 키를 넣으면 어느 브라우저에서나 됩니다.{" "}
              <button type="button" className="link" onClick={onOpenSettings}>
                설정 열기
              </button>
            </li>
            <li>Chrome이나 Edge로 이 주소를 열어 보세요.</li>
            <li>당장은 원문 칸을 누르고 키보드의 음성 입력(Windows는 Win+H)으로 말해도 됩니다.</li>
          </ul>
        </aside>
      )}
      {speech.error && <p className="notice">{speech.error}</p>}
      {fileError && (
        <p className="notice" role="alert">
          {fileError}{" "}
          {!sttKeyFor(settings).trim() && (
            <button type="button" className="link" onClick={onOpenSettings}>
              설정 열기
            </button>
          )}
        </p>
      )}
      {fileNotice && !fileError && (
        <p className="notice notice--info" role="status">
          {fileNotice}
        </p>
      )}
      {speech.notice && !speech.error && (
        <p className="notice notice--info" role="status">
          {speech.notice}
        </p>
      )}

      <ResultPanel
        title={`정리된 글 · ${mode.label}`}
        status={ai.status}
        text={ai.text}
        error={ai.error}
        badge={isExample ? <span className="tag">예시</span> : null}
        original={original}
        onCancel={ai.cancel}
        copyNote={copyNote ?? note}
        preview={original ? <StrikePreview text={original} /> : null}
        swapKey={swapKey}
        meta={
          ai.text && (
            <>
              <span className="metric">
                <span className="metric__label">원문 → 정리</span>
                <span className="metric__value">
                  {rawChars}자 → {resultChars}자
                </span>
                {rawChars > 0 && (
                  <span className="metric__bar" aria-hidden="true">
                    <span style={{ width: `${Math.min(100, Math.round((resultChars / rawChars) * 100))}%` }} />
                  </span>
                )}
              </span>
              {lastSaved !== null && lastSaved > 0 && (
                <span className="metric">
                  <span className="metric__label">아낀 시간 (추정)</span>
                  <span className="metric__value">{formatDuration(lastSaved)}</span>
                </span>
              )}
              <span className="metric">
                <span className="metric__label">정리한 곳</span>
                <span className="metric__value">{isExample ? "예시 결과" : ENGINE_LABEL[resultEngine]}</span>
              </span>
            </>
          )
        }
        actions={
          <>
            {!isExample && engine !== "local" && !fileJob && (
              <button type="button" className="btn btn--ghost" onClick={() => void polish(true, spokenRef.current)}>
                다시 정리
              </button>
            )}
            {!isExample && !__ARTIFACT__ && original && !fileJob && (
              <button
                type="button"
                className="btn btn--ghost btn--compare"
                aria-expanded={!!compare}
                onClick={() => setCompare({ id: Date.now(), req: requestFor(original).req })}
              >
                <span className="btn--compare__dots" aria-hidden="true">
                  <i />
                  <i />
                </span>
                Claude·Gemini 비교
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => onSendToEdit(ai.text)}>
              음성 편집으로 보내기
            </button>
          </>
        }
      />

      {compare && (
        <ComparePanel
          key={compare.id}
          req={compare.req}
          settings={settings}
          accountAvailable={accountAvailable}
          onAdopt={(text, from, brand) => void adopt(text, from, brand)}
          onOpenSettings={onOpenSettings}
          onClose={() => setCompare(null)}
        />
      )}

      <p className="shortcuts">
        <kbd>Space</kbd> 길게 누르기 말하기 · <kbd>{MOD_KEY}</kbd>+<kbd>Enter</kbd> 정리 · <kbd>Esc</kbd> 멈춤
      </p>
    </div>
  );
}

function sizeMb(bytes: number): string {
  return bytes >= 100 * 1024 * 1024 ? `${Math.round(bytes / 1048576)}MB` : `${(bytes / 1048576).toFixed(1)}MB`;
}

function lengthLabel(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return `${Math.round(sec)}초`;
  return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`;
}

/** 녹음 파일 받아쓰기 진행 상황: 올리는 중 몇 %, 몇 번째 구간인지, 멈추기 */
function FileJobStatus({
  job,
  onCancel,
}: {
  job: { name: string; size: number; durationSec: number | null; progress: FileProgress | null };
  onCancel: () => void;
}) {
  const p = job.progress;
  let label = "녹음 길이를 확인하는 중…";
  let ratio: number | null = null;
  if (p?.stage === "upload") {
    ratio = p.total ? p.done / p.total : 0;
    label = `파일 올리는 중 · ${Math.round(ratio * 100)}% (${sizeMb(p.done)} / ${sizeMb(p.total)})`;
  } else if (p?.stage === "prepare") {
    label = "Gemini가 파일을 준비하는 중…";
  } else if (p?.stage === "transcribe") {
    ratio = p.total > 1 ? p.done / p.total : null;
    label = p.total > 1 ? `글로 바꾸는 중 · ${Math.min(p.done + 1, p.total)}/${p.total} 구간` : "글로 바꾸는 중…";
  }
  return (
    <div className="filejob" role="status" aria-live="polite">
      <div className="filejob__head">
        <span className="filejob__name">{job.name}</span>
        <span className="filejob__meta">
          {sizeMb(job.size)}
          {job.durationSec ? ` · ${lengthLabel(job.durationSec)}` : ""}
        </span>
      </div>
      <div className="filejob__bar" aria-hidden="true">
        <span className={ratio === null ? "is-indeterminate" : ""} style={ratio === null ? undefined : { width: `${Math.max(4, ratio * 100)}%` }} />
      </div>
      <div className="filejob__foot">
        <span className="filejob__label">{label}</span>
        <button type="button" className="btn btn--ghost filejob__cancel" onClick={onCancel}>
          멈추기
        </button>
      </div>
      {job.durationSec && job.durationSec > 20 * 60 && (
        <p className="filejob__hint">
          {p?.stage === "transcribe" && p.total > 1 ? "20분씩 나눠 받아씁니다. " : ""}긴 녹음은 몇 분 걸릴 수 있으니 이 화면을 닫지
          마세요.
        </p>
      )}
    </div>
  );
}
