import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RunStatus } from "../hooks/useAiRun";
import { copyText } from "../lib/clipboard";
import { Scribble } from "./HandNote";

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
  /** 정리하는 동안 보여 줄 것 (원문에 줄 긋기 등) */
  preview?: ReactNode;
  /** 바뀔 때마다 글이 새로 나타나는 움직임을 다시 보여 줍니다 (비교에서 다른 글을 골랐을 때) */
  swapKey?: number;
}

export function ResultPanel({ title, status, text, error, badge, meta, original, onCancel, actions, copyNote, preview, swapKey = 0 }: Props) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const busy = status === "thinking" || status === "streaming";

  const [burst, setBurst] = useState(0);
  // '정리하는 중'에서 바로 완성된 글로 바뀔 때만 글이 써지듯 나타나게 합니다 (스트리밍 중에는 그대로).
  const prevStatus = useRef(status);
  const [revealKey, setRevealKey] = useState(0);
  useEffect(() => {
    if (status === "done" && prevStatus.current === "thinking") setRevealKey((k) => k + 1);
    prevStatus.current = status;
  }, [status]);
  useEffect(() => {
    if (swapKey > 0) setRevealKey((k) => k + 1);
  }, [swapKey]);

  async function copy() {
    const ok = await copyText(text);
    setCopied(ok ? "ok" : "fail");
    if (ok) setBurst((b) => b + 1);
    window.setTimeout(() => setCopied(null), 2200);
  }

  const statusText =
    status === "thinking"
      ? "정리하는 중"
      : status === "streaming"
        ? "글을 쓰는 중"
        : status === "done" && text
          ? `정리 완료, ${text.replace(/\s/g, "").length}자`
          : status === "error" && error
            ? `오류: ${error}`
            : "";

  return (
    <section className={`result is-${status}`} aria-busy={busy}>
      <p className="sr-only" role="status">
        {statusText}
      </p>
      <header className="result__head">
        <h2 className="result__title">
          <span className="result__title-text">
            {title}
            {revealKey > 0 && <Scribble key={revealKey} className="result__scribble" />}
          </span>
          {badge}
        </h2>
        <div className="result__tools">
          {busy ? (
            <button type="button" className="btn btn--ghost" onClick={onCancel}>
              멈추기
            </button>
          ) : (
            text && (
              <button type="button" className={`btn btn--primary copy-btn${copied === "ok" ? " is-done" : ""}`} onClick={copy}>
                <svg className="copy-btn__check" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 8.5l3 3 7-7" />
                </svg>
                {copied === "ok" ? "복사됨" : "복사"}
                {burst > 0 && (
                  <span key={burst} className="burst" aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => (
                      <i key={i} style={{ ["--a" as string]: `${i * 45}deg` }} />
                    ))}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      </header>

      {status === "thinking" && (
        <div className="result__working">
          <p className="result__thinking">
            <svg className="pencil" viewBox="0 0 40 12" aria-hidden="true">
              <path d="M2 8 C 8 2, 12 12, 18 6 S 28 2, 38 7" />
            </svg>
            군더더기를 걷어내는 중…
          </p>
          {preview}
        </div>
      )}
      {status === "error" && error && <p className="result__error">{error}</p>}
      {text && (
        <div key={revealKey} className={`result__text${revealKey ? " is-reveal" : ""}`}>
          {text}
        </div>
      )}
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
