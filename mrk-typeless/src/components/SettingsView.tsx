import { useState } from "react";
import { STT_PROVIDERS } from "../ai/transcribe";
import {
  GEMINI_MODEL_OPTIONS,
  MODEL_OPTIONS,
  SPEECH_LANGS,
  TARGET_LANGS,
  TIER_OPTIONS,
  type EngineChoice,
  type EngineId,
  type Settings,
  type SpeechEngine,
} from "../lib/settings";
import { ENGINE_LABEL } from "./DictateView";

interface Props {
  settings: Settings;
  onSettings: (patch: Partial<Settings>) => void;
  engine: EngineId;
  accountAvailable: boolean;
}

interface EngineOption {
  id: EngineChoice;
  label: string;
  desc: string;
  available: boolean;
  why?: string;
}

const SPEECH_ENGINES: { id: SpeechEngine; label: string; desc: string }[] = [
  { id: "auto", label: "자동 (권장)", desc: "브라우저 음성인식을 먼저 쓰고, 연결이 안 되면 녹음 받아쓰기로 넘어갑니다." },
  { id: "browser", label: "브라우저 음성인식", desc: "무료. 말하는 동안 글자가 바로 보입니다. Chrome·Edge·Safari에서 됩니다." },
  { id: "record", label: "녹음 받아쓰기", desc: "다 말하면 녹음을 받아쓰기 API로 보냅니다. 어느 브라우저에서나 됩니다." },
];

export function SettingsView({ settings, onSettings, engine, accountAvailable }: Props) {
  const [showKey, setShowKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showSttKey, setShowSttKey] = useState(false);
  const stt = STT_PROVIDERS.find((p) => p.id === settings.sttProvider) ?? STT_PROVIDERS[0];
  // Gemini 받아쓰기는 정리용 Gemini 키를 같이 씁니다 (어느 칸에 넣어도 같은 키).
  const sttUsesGemini = settings.sttProvider === "gemini";
  const sttKey = sttUsesGemini ? settings.geminiKey : settings.sttKey;

  const options: EngineOption[] = [
    { id: "auto", label: "자동", desc: "쓸 수 있는 방식을 알아서 고릅니다.", available: true },
    {
      id: "account",
      label: "내 Claude 계정",
      desc: "claude.ai에서 열었을 때, 로그인한 계정으로 정리합니다. 키가 필요 없습니다.",
      available: accountAvailable,
      why: "claude.ai 아티팩트로 열었을 때만 쓸 수 있습니다.",
    },
    ...(__ARTIFACT__
      ? []
      : [
          {
            id: "apikey" as const,
            label: "Claude API 키",
            desc: "내 Anthropic API 키로 정리합니다. 키는 이 브라우저에만 저장됩니다.",
            available: true,
          },
          {
            id: "gemini" as const,
            label: "Gemini API 키",
            desc: "내 Google Gemini API 키로 정리합니다. 키는 이 브라우저에만 저장됩니다.",
            available: true,
          },
        ]),
    { id: "local", label: "AI 없이", desc: "군더더기 말과 반복만 지우는 기본 정리입니다.", available: true },
  ];

  return (
    <div className="view settings">
      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">AI 정리 방식</h2>
          <p className="panel__desc">
            지금 쓰는 방식: <strong>{ENGINE_LABEL[engine]}</strong>
          </p>
        </header>
        <div className="engines" role="radiogroup" aria-label="AI 정리 방식">
          {options.map((o) => (
            <label key={o.id} className={`engine${settings.engine === o.id ? " is-on" : ""}${o.available ? "" : " is-off"}`}>
              <input
                type="radio"
                name="engine"
                id={`engine-${o.id}`}
                checked={settings.engine === o.id}
                disabled={!o.available}
                onChange={() => onSettings({ engine: o.id })}
              />
              <span className="engine__label">{o.label}</span>
              <span className="engine__desc">{o.available ? o.desc : o.why}</span>
            </label>
          ))}
        </div>

        {accountAvailable && (
          <div className="field">
            <span className="label">정리 속도 (Claude 계정)</span>
            <div className="tier" role="radiogroup" aria-label="정리 속도">
              {TIER_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.accountTier === t.id}
                  className={`tier__item${settings.accountTier === t.id ? " is-on" : ""}`}
                  onClick={() => onSettings({ accountTier: t.id })}
                >
                  <span>{t.label}</span>
                  <small>{t.note}</small>
                </button>
              ))}
            </div>
          </div>
        )}

        {!__ARTIFACT__ && (
          <div className="api">
            <div className="field">
              <label htmlFor="api-key" className="label">
                Anthropic API 키
              </label>
              <div className="field__row">
                <input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.apiKey}
                  placeholder="sk-ant-…"
                  onChange={(e) => onSettings({ apiKey: e.target.value })}
                />
                <button type="button" className="btn btn--ghost" onClick={() => setShowKey((v) => !v)}>
                  {showKey ? "숨기기" : "보기"}
                </button>
              </div>
              <a className="key-link" href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">
                Anthropic API 키 발급받기 ↗
              </a>
              <p className="field__hint">
                Claude 개발자 플랫폼에 로그인해 키를 만들고 붙여넣으세요. 키는 이 브라우저에만 저장되고 Claude 서버로만 전송됩니다.
                여러 사람이 쓰는 컴퓨터에서는 쓰지 마세요.
              </p>
            </div>
            <div className="field__grid">
              <div className="field">
                <label htmlFor="model" className="label">
                  모델
                </label>
                <select id="model" value={settings.model} onChange={(e) => onSettings({ model: e.target.value as Settings["model"] })}>
                  {MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.note}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="effort" className="label">
                  생각하는 정도 <small className="label__note">Claude·Gemini 공통</small>
                </label>
                <select id="effort" value={settings.effort} onChange={(e) => onSettings({ effort: e.target.value as Settings["effort"] })}>
                  <option value="low">빠르게 (받아쓰기에 권장)</option>
                  <option value="medium">꼼꼼하게</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {!__ARTIFACT__ && (
          <div className="api">
            <div className="field">
              <label htmlFor="gemini-key" className="label">
                Gemini API 키
              </label>
              <div className="field__row">
                <input
                  id="gemini-key"
                  type={showGeminiKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.geminiKey}
                  placeholder="AIza…"
                  onChange={(e) => onSettings({ geminiKey: e.target.value })}
                />
                <button type="button" className="btn btn--ghost" onClick={() => setShowGeminiKey((v) => !v)}>
                  {showGeminiKey ? "숨기기" : "보기"}
                </button>
              </div>
              <a className="key-link" href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">
                Gemini API 키 발급받기 ↗
              </a>
              <p className="field__hint">
                Google AI Studio에 로그인해 키를 만들고 붙여넣으세요. 키는 이 브라우저에만 저장되고 Google 서버로만 전송됩니다. 두 키를
                모두 넣으면 정리된 글 아래 <em>Claude·Gemini 비교</em>로 같은 원문을 나란히 견줘 볼 수 있습니다.
              </p>
            </div>
            <div className="field__grid">
              <div className="field">
                <label htmlFor="gemini-model" className="label">
                  Gemini 모델
                </label>
                <select
                  id="gemini-model"
                  value={settings.geminiModel}
                  onChange={(e) => onSettings({ geminiModel: e.target.value as Settings["geminiModel"] })}
                >
                  {GEMINI_MODEL_OPTIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} — {m.note}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">받아쓰기</h2>
        </header>
        <div className="field__grid">
          <div className="field">
            <label htmlFor="speech-lang" className="label">
              말하는 언어
            </label>
            <select id="speech-lang" value={settings.speechLang} onChange={(e) => onSettings({ speechLang: e.target.value })}>
              {SPEECH_LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="target-lang" className="label">
              번역할 언어
            </label>
            <select id="target-lang" value={settings.targetLanguage} onChange={(e) => onSettings({ targetLanguage: e.target.value })}>
              {TARGET_LANGS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!__ARTIFACT__ && (
          <div className="api">
            <div className="field">
              <span className="label">음성 인식 방식</span>
              <div className="engines engines--3" role="radiogroup" aria-label="음성 인식 방식">
                {SPEECH_ENGINES.map((o) => (
                  <label key={o.id} className={`engine${settings.speechEngine === o.id ? " is-on" : ""}`}>
                    <input
                      type="radio"
                      name="speech-engine"
                      id={`speech-engine-${o.id}`}
                      checked={settings.speechEngine === o.id}
                      onChange={() => onSettings({ speechEngine: o.id })}
                    />
                    <span className="engine__label">{o.label}</span>
                    <span className="engine__desc">{o.desc}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field__grid">
              <div className="field">
                <label htmlFor="stt-provider" className="label">
                  녹음 받아쓰기 서비스
                </label>
                <select
                  id="stt-provider"
                  value={settings.sttProvider}
                  onChange={(e) => onSettings({ sttProvider: e.target.value as Settings["sttProvider"] })}
                >
                  {STT_PROVIDERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="stt-key" className="label">
                  {stt.label} API 키
                </label>
                <div className="field__row">
                  <input
                    id="stt-key"
                    type={showSttKey ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={sttKey}
                    placeholder={stt.keyPlaceholder}
                    onChange={(e) => onSettings(sttUsesGemini ? { geminiKey: e.target.value } : { sttKey: e.target.value })}
                  />
                  <button type="button" className="btn btn--ghost" onClick={() => setShowSttKey((v) => !v)}>
                    {showSttKey ? "숨기기" : "보기"}
                  </button>
                </div>
              </div>
            </div>
            <a className="key-link" href={stt.keyUrl} target="_blank" rel="noopener noreferrer">
              {stt.label} API 키 발급받기 ↗
            </a>
            <p className="field__hint">
              {stt.keyHint} 키는 이 브라우저에만 저장되고 받아쓰기 서버로만 전송됩니다. 녹음 받아쓰기는 이용한 시간만큼 해당 서비스 요금이 나옵니다.
              {settings.speechEngine === "record" && !sttKey.trim() && " 키를 넣기 전까지는 브라우저 음성인식을 씁니다."}
            </p>
          </div>
        )}
        <label className="toggle" htmlFor="auto-polish">
          <input id="auto-polish" type="checkbox" checked={settings.autoPolish} onChange={(e) => onSettings({ autoPolish: e.target.checked })} />
          <span>
            말을 마치면 바로 정리
            <small>끄면 원문을 고친 뒤 직접 '정리하기'를 누릅니다.</small>
          </span>
        </label>
        <label className="toggle" htmlFor="auto-copy">
          <input id="auto-copy" type="checkbox" checked={settings.autoCopy} onChange={(e) => onSettings({ autoCopy: e.target.checked })} />
          <span>
            정리가 끝나면 클립보드에 복사
            <small>쓰던 곳에 바로 붙여넣을 수 있습니다. 일부 화면에서는 막힐 수 있습니다.</small>
          </span>
        </label>
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">나만의 문체</h2>
          <p className="panel__desc">모든 정리에 함께 적용됩니다.</p>
        </header>
        <div className="field">
          <label htmlFor="style-note" className="label">
            문체 지시
          </label>
          <textarea
            id="style-note"
            rows={3}
            value={settings.styleNote}
            placeholder="예: '~습니다'체로, 문장은 짧게. 법령 이름은 정식 명칭으로."
            onChange={(e) => onSettings({ styleNote: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="signature" className="label">
            이메일 서명
          </label>
          <input
            id="signature"
            value={settings.signature}
            placeholder="예: 미스터홈즈 드림"
            onChange={(e) => onSettings({ signature: e.target.value })}
          />
        </div>
      </section>
    </div>
  );
}
