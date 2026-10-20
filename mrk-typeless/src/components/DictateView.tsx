import { useCallback, useEffect, useRef, useState } from "react";
import { useAiRun } from "../hooks/useAiRun";
import { useDictation } from "../hooks/useDictation";
import { browserName } from "../lib/browser";
import { copyText } from "../lib/clipboard";
import { applyReplacements, type Dictionary } from "../lib/dictionary";
import { newId, type HistoryItem } from "../lib/history";
import { localCleanup } from "../lib/localCleanup";
import { MODES, getMode, type ModeId } from "../lib/modes";
import { buildPolishPrompt } from "../lib/prompts";
import type { EngineId, Settings } from "../lib/settings";
import { countChars, estimateSavedMs, formatClock, formatDuration } from "../lib/stats";
import { load, save } from "../lib/storage";
import { KeyboardDictationTip } from "./KeyboardDictationTip";
import { MicButton, Waveform } from "./MicButton";
import { ResultPanel } from "./ResultPanel";

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
  local: "기본 정리(AI 없이)",
};

interface Props {
  /** 받아쓰기 탭이 보일 때만 단축키가 동작합니다 */
  active: boolean;
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  dictionary: Dictionary;
  engine: EngineId;
  firstVisit: boolean;
  onSave: (item: HistoryItem) => void;
  onSendToEdit: (text: string) => void;
  onOpenSettings: () => void;
}

const MOD_KEY = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName);
}

export function DictateView({ active, settings, onSettings, dictionary, engine, firstVisit, onSave, onSendToEdit, onOpenSettings }: Props) {
  const [raw, setRaw] = useState<string>(() => load<string>("draft") ?? (firstVisit ? EXAMPLE_RAW : ""));
  const [isExample, setIsExample] = useState(() => load<string>("draft") === undefined && firstVisit);
  const [original, setOriginal] = useState(isExample ? EXAMPLE_RAW : "");
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const rawRef = useRef(raw);
  const exampleRef = useRef(isExample);
  const ai = useAiRun();

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

  const speech = useDictation(settings, appendFinal);

  useEffect(() => {
    if (isExample) ai.show(EXAMPLE_RESULT);
    // 첫 화면에서 한 번만 예시를 보여줍니다.
  }, []);

  useEffect(() => {
    if (!isExample) save("draft", raw);
  }, [raw, isExample]);

  const polish = useCallback(
    async (fresh = false, spokenMs?: number) => {
      const source = rawRef.current.trim();
      if (!source) return;
      leaveExample();
      setNote(null);
      setCopyNote(null);
      setLastSaved(null);
      setOriginal(source);
      const mode = getMode(settings.mode);
      const { text: corrected } = applyReplacements(source, dictionary.replacements);

      let result: string | null;
      if (engine === "local") {
        const { text, removed } = localCleanup(corrected);
        ai.show(text);
        result = text;
        setNote(
          mode.id === "clean"
            ? `군더더기 ${removed}개를 지웠습니다. 말을 바꾼 부분과 목록 정리는 AI 정리에서 됩니다.`
            : `AI가 꺼져 있어 '${mode.label}' 형식 대신 기본 정리만 했습니다. 설정에서 AI 정리를 켜 주세요.`,
        );
      } else {
        const req = buildPolishPrompt(corrected, mode, {
          dictionary,
          styleNote: settings.styleNote,
          targetLanguage: settings.targetLanguage,
          signature: settings.signature,
        });
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
        setCopyNote(ok ? "클립보드에 복사했습니다. 쓰던 곳에 붙여넣기만 하세요." : null);
      }
    },
    [ai, dictionary, engine, leaveExample, onSave, settings],
  );

  const spokenRef = useRef<number | undefined>(undefined);
  const rawAtStartRef = useRef<string | null>(null);
  const stopAndPolish = useCallback(async () => {
    const { spokenMs } = await speech.stop();
    spokenRef.current = spokenMs;
    // 이번에 받아쓴 말이 없으면(인식 실패 등) 예전 원문을 다시 정리하지 않습니다.
    const heardSomething = rawRef.current !== rawAtStartRef.current;
    rawAtStartRef.current = null;
    if (settings.autoPolish && heardSomething) await polish(false, spokenMs);
  }, [polish, settings.autoPolish, speech]);

  const startListening = useCallback(() => {
    ai.cancel();
    if (leaveExample()) updateRaw("");
    rawAtStartRef.current = rawRef.current;
    speech.start();
  }, [ai, leaveExample, speech, updateRaw]);

  // 단축키: Space 길게 누르기 = 말하기, Ctrl/⌘+Enter = 정리, Esc = 멈춤
  const latest = useRef({ active, startListening, stopAndPolish, polish, speech, ai });
  latest.current = { active, startListening, stopAndPolish, polish, speech, ai };
  useEffect(() => {
    let spaceHeld = false;
    const down = (e: KeyboardEvent) => {
      const { active, startListening, polish, speech, ai } = latest.current;
      if (!active) return;
      if (e.key === "Escape") {
        if (speech.listening || speech.transcribing) speech.cancel();
        ai.cancel();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void polish(false, spokenRef.current);
        return;
      }
      if (e.code === "Space" && !e.repeat && !isEditable(e.target) && !speech.listening && !speech.transcribing) {
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
      <fieldset className="modes">
        <legend className="label">글의 형식</legend>
        <div className="modes__list" role="radiogroup">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={settings.mode === m.id}
              className={`chip${settings.mode === m.id ? " is-on" : ""}`}
              onClick={() => onSettings({ mode: m.id as ModeId })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="modes__hint">
          {mode.hint}
          {mode.id === "translate" && ` · ${settings.targetLanguage}`}
        </p>
      </fieldset>

      <section className="stage">
        <div className="stage__mic">
          <MicButton
            listening={speech.listening}
            disabled={speech.transcribing}
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
            placeholder="마이크를 누르고 말하거나, 이 칸을 누르고 키보드의 음성 입력으로 말하세요."
            onChange={(e) => {
              leaveExample();
              updateRaw(e.target.value);
            }}
            rows={6}
          />
          {speech.interim && <p className="pad__interim">{speech.interim}</p>}
          {speech.listening && recordMode && <p className="pad__interim">녹음하고 있습니다. 다 말하면 마이크를 떼거나 다시 누르세요.</p>}
          <div className="pad__bar">
            <span className="pad__count">{countChars(raw)}자</span>
            <div className="pad__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  leaveExample();
                  updateRaw("");
                }}
                disabled={!raw}
              >
                지우기
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void polish(false, spokenRef.current)} disabled={!raw.trim() || ai.busy}>
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
            <strong>{browserName()}에서 음성인식 서버에 연결하지 못했습니다.</strong> 브라우저 음성인식은 구글 서버를 거치는데,
            웨일·브레이브 같은 일부 브라우저나 회사 네트워크에서는 막혀 있습니다.
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

      <ResultPanel
        title={`정리된 글 · ${mode.label}`}
        status={ai.status}
        text={ai.text}
        error={ai.error}
        badge={isExample ? <span className="tag">예시</span> : null}
        original={original}
        onCancel={ai.cancel}
        copyNote={copyNote ?? note}
        meta={
          ai.text && (
            <>
              <span>
                원문 {rawChars}자 → {resultChars}자
              </span>
              {lastSaved !== null && lastSaved > 0 && <span>약 {formatDuration(lastSaved)} 절약 (추정)</span>}
              <span>{isExample ? "예시 결과" : ENGINE_LABEL[engine]}</span>
            </>
          )
        }
        actions={
          <>
            {!isExample && engine !== "local" && (
              <button type="button" className="btn btn--ghost" onClick={() => void polish(true, spokenRef.current)}>
                다시 정리
              </button>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => onSendToEdit(ai.text)}>
              음성 편집으로 보내기
            </button>
          </>
        }
      />

      <p className="shortcuts">
        <kbd>Space</kbd> 길게 누르기 말하기 · <kbd>{MOD_KEY}</kbd>+<kbd>Enter</kbd> 정리 · <kbd>Esc</kbd> 멈춤
      </p>
    </div>
  );
}
