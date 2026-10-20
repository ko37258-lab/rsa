import { useState, type ReactNode } from "react";
import type { RunStatus } from "../hooks/useAiRun";
import { copyText } from "../lib/clipboard";

interface Props {
  title: string;
  status: RunStatus;
  text: string;
  error: string | null;
  badge?: ReactNode;
  meta?: ReactNode;
  original?: string;
  onCancel: () => void;
  actions?: ReactNode;
  copyNote?: string | null;
}

export function ResultPanel({ title, status, text, error, badge, meta, original, onCancel, actions, copyNote }: Props) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const busy = status === "thinking" || status === "streaming";

  async function copy() {
    const ok = await copyText(text);
    setCopied(ok ? "ok" : "fail");
    window.setTimeout(() => setCopied(null), 2200);
  }

  return (
    <section className={`result is-${status}`} aria-live="polite">
      <header className="result__head">
        <h2 className="result__title">
          {title}
          {badge}
        </h2>
        <div className="result__tools">
          {busy ? (
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              멈추기
            </button>
          ) : (
            text && (
              <button type="button" className="btn btn--accent" onClick={copy}>
                {copied === "ok" ? "복사됨" : "복사"}
              </button>
            )
          )}
        </div>
      </header>

      {status === "thinking" && <p className="result__thinking">정리하는 중…</p>}
      {status === "error" && error && <p className="result__error">{error}</p>}
      {text && <div className="result__text">{text}</div>}
      {!text && status === "idle" && <p className="result__empty">말을 마치면 정리된 글이 여기에 나타납니다.</p>}

      {copied === "fail" && <p className="result__note">이 화면에서는 자동 복사가 막혀 있어요. 글을 길게 눌러 직접 복사해 주세요.</p>}
      {copyNote && !copied && <p className="result__note">{copyNote}</p>}

      {(meta || original || actions) && !busy && text && (
        <footer className="result__foot">
          {meta && <div className="result__meta">{meta}</div>}
          <div className="result__actions">
            {original && (
              <button type="button" className="btn btn--ghost" onClick={() => setShowOriginal((v) => !v)} aria-expanded={showOriginal}>
                {showOriginal ? "원문 숨기기" : "원문과 비교"}
              </button>
            )}
            {actions}
          </div>
          {showOriginal && original && (
            <div className="result__original">
              <span className="label">받아쓴 원문</span>
              <p>{original}</p>
            </div>
          )}
        </footer>
      )}
    </section>
  );
}
