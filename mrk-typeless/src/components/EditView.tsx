import { useCallback, useRef, useState } from "react";
import { useAiRun } from "../hooks/useAiRun";
import { useDictation } from "../hooks/useDictation";
import type { Dictionary } from "../lib/dictionary";
import { newId, type HistoryItem } from "../lib/history";
import { buildEditPrompt } from "../lib/prompts";
import { sanitizeDictation } from "../lib/sanitize";
import type { EngineId, Settings } from "../lib/settings";
import { MicButton } from "./MicButton";
import { ResultPanel } from "./ResultPanel";

const QUICK_COMMANDS = [
  "더 공손하게 바꿔줘",
  "세 줄로 요약해줘",
  "카톡용으로 짧게",
  "핵심만 목록으로",
  "보고서 개조식으로",
  "영어로 번역해줘",
];

interface Props {
  settings: Settings;
  dictionary: Dictionary;
  engine: EngineId;
  source: string;
  onSource: (text: string) => void;
  onSave: (item: HistoryItem) => void;
}

/** Typeless의 "말로 고치기": 글을 붙여넣고, 고칠 내용을 말하면 그대로 고칩니다. */
export function EditView({ settings, dictionary, engine, source, onSource, onSave }: Props) {
  const [command, setCommand] = useState("");
  const commandRef = useRef("");
  const ai = useAiRun();

  const updateCommand = useCallback((next: string) => {
    commandRef.current = next;
    setCommand(next);
  }, []);

  const speech = useDictation(
    settings,
    (said) => {
      const base = commandRef.current.trimEnd();
      updateCommand(base ? `${base} ${said}` : said);
    },
    dictionary.terms,
  );

  const apply = useCallback(
    async (instruction: string) => {
      const text = sanitizeDictation(source).trim();
      const cmd = sanitizeDictation(instruction).trim();
      if (!text || !cmd || engine === "local") return;
      const req = buildEditPrompt(text, cmd, {
        dictionary,
        styleNote: settings.styleNote,
        targetLanguage: settings.targetLanguage,
        signature: settings.signature,
      });
      const result = await ai.run(engine, req, settings, true);
      if (!result) return;
      onSave({
        id: newId(),
        createdAt: Date.now(),
        kind: "edit",
        command: cmd,
        raw: text,
        result,
        engine,
        savedMs: 0,
      });
    },
    [ai, dictionary, engine, onSave, settings, source],
  );

  const stopAndApply = useCallback(async () => {
    await speech.stop();
    if (commandRef.current.trim()) await apply(commandRef.current);
  }, [apply, speech]);

  const aiOff = engine === "local";

  return (
    <div className="view edit">
      <div className="field">
        <label htmlFor="edit-source" className="label">
          고칠 글
        </label>
        <textarea
          id="edit-source"
          className="pad__text"
          rows={7}
          value={source}
          placeholder="고칠 글을 붙여넣으세요. 받아쓰기 결과에서 '음성 편집으로 보내기'를 눌러도 됩니다."
          onChange={(e) => onSource(e.target.value)}
        />
      </div>

      <div className="command">
        <label htmlFor="edit-command" className="label">
          어떻게 고칠까요?
        </label>
        <div className="command__row">
          <MicButton
            size="small"
            listening={speech.listening}
            pulse={speech.pulse}
            disabled={aiOff || !speech.supported || speech.transcribing}
            label={speech.listening ? "지시 말하기 멈추고 적용" : "지시를 말로 하기"}
            onPressStart={() => {
              updateCommand("");
              speech.start();
            }}
            onHoldEnd={() => void stopAndApply()}
            onToggle={() => void stopAndApply()}
          />
          <input
            id="edit-command"
            className="command__input"
            value={speech.interim ? `${command} ${speech.interim}`.trim() : command}
            placeholder="예: 더 공손하게, 세 줄로 요약해줘"
            onChange={(e) => updateCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void apply(command);
              }
            }}
          />
          <button type="button" className="btn btn--primary" disabled={aiOff || !source.trim() || !command.trim() || ai.busy} onClick={() => void apply(command)}>
            적용
          </button>
        </div>
        <div className="command__quick">
          {QUICK_COMMANDS.map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              disabled={aiOff || !source.trim() || ai.busy}
              onClick={() => {
                updateCommand(c);
                void apply(c);
              }}
            >
              {c}
            </button>
          ))}
        </div>
        {aiOff && <p className="notice">음성 편집은 AI가 필요합니다. 설정에서 Claude 연결 방식을 골라 주세요.</p>}
        {(speech.problem === "blocked" || speech.problem === "network") && (
          <p className="notice">지금은 마이크로 지시를 받을 수 없어 글로 적어 주세요. 키보드의 음성 입력도 됩니다.</p>
        )}
        {speech.transcribing && <p className="notice">지시를 받아쓰는 중…</p>}
        {speech.error && <p className="notice">{speech.error}</p>}
      </div>

      <ResultPanel
        title="고친 글"
        status={ai.status}
        text={ai.text}
        error={ai.error}
        onCancel={ai.cancel}
        actions={
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              onSource(ai.text);
              ai.show("");
            }}
          >
            고칠 글을 이 결과로 바꾸기
          </button>
        }
        meta={command ? <span>지시: {command}</span> : null}
      />
    </div>
  );
}
