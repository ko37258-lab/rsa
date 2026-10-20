import { useState } from "react";
import {
  MODEL_OPTIONS,
  SPEECH_LANGS,
  TARGET_LANGS,
  TIER_OPTIONS,
  type EngineChoice,
  type EngineId,
  type Settings,
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

export function SettingsView({ settings, onSettings, engine, accountAvailable }: Props) {
  const [showKey, setShowKey] = useState(false);

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
            <div className="seg" role="radiogroup" aria-label="정리 속도">
              {TIER_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={settings.accountTier === t.id}
                  className={`seg__item${settings.accountTier === t.id ? " is-on" : ""}`}
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
              <p className="field__hint">
                console.anthropic.com에서 발급합니다. 키는 이 브라우저에만 저장되고 Claude 서버로만 전송됩니다. 여러 사람이 쓰는 컴퓨터에서는 쓰지 마세요.
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
                  생각하는 정도
                </label>
                <select id="effort" value={settings.effort} onChange={(e) => onSettings({ effort: e.target.value as Settings["effort"] })}>
                  <option value="low">빠르게 (받아쓰기에 권장)</option>
                  <option value="medium">꼼꼼하게</option>
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
