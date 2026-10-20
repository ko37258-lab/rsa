import { useState } from "react";
import { DEFAULT_DICTIONARY, type Dictionary } from "../lib/dictionary";

interface Props {
  dictionary: Dictionary;
  onChange: (next: Dictionary) => void;
}

/** 개인 사전: 정확히 써야 할 용어와, 음성인식이 자주 틀리는 말의 바꿔쓰기 규칙 */
export function DictionaryView({ dictionary, onChange }: Props) {
  const [term, setTerm] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  function addTerm() {
    const words = term
      .split(/[,\n]/)
      .map((w) => w.trim())
      .filter((w) => w && !dictionary.terms.includes(w));
    if (words.length) onChange({ ...dictionary, terms: [...dictionary.terms, ...words] });
    setTerm("");
  }

  function updateReplacement(index: number, key: "from" | "to", value: string) {
    const replacements = dictionary.replacements.map((r, i) => (i === index ? { ...r, [key]: value } : r));
    onChange({ ...dictionary, replacements });
  }

  return (
    <div className="view dict">
      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">용어</h2>
          <p className="panel__desc">이름, 고유명사, 전문용어를 적어 두면 AI가 이 표기대로 씁니다.</p>
        </header>
        <div className="terms">
          {dictionary.terms.map((t) => (
            <span key={t} className="term">
              {t}
              <button
                type="button"
                className="term__x"
                aria-label={`${t} 삭제`}
                onClick={() => onChange({ ...dictionary, terms: dictionary.terms.filter((x) => x !== t) })}
              >
                ×
              </button>
            </span>
          ))}
          {dictionary.terms.length === 0 && <p className="muted">아직 용어가 없습니다.</p>}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            addTerm();
          }}
        >
          <label htmlFor="term-input" className="sr-only">
            새 용어
          </label>
          <input id="term-input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="예: 개발부담금, 김OO 소장 (쉼표로 여러 개)" />
          <button type="submit" className="btn btn--primary" disabled={!term.trim()}>
            추가
          </button>
        </form>
      </section>

      <section className="panel">
        <header className="panel__head">
          <h2 className="panel__title">바꿔쓰기</h2>
          <p className="panel__desc">음성인식이 자주 틀리는 말을 정리 전에 바로 고칩니다.</p>
        </header>
        <div className="reps">
          <div className="reps__row reps__row--head" aria-hidden="true">
            <span>들린 말</span>
            <span />
            <span>바른 표기</span>
            <span />
          </div>
          {dictionary.replacements.map((r, i) => (
            <div key={i} className="reps__row">
              <input id={`rep-from-${i}`} aria-label="들린 말" value={r.from} onChange={(e) => updateReplacement(i, "from", e.target.value)} />
              <span className="reps__arrow" aria-hidden="true">
                →
              </span>
              <input id={`rep-to-${i}`} aria-label="바른 표기" value={r.to} onChange={(e) => updateReplacement(i, "to", e.target.value)} />
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label={`${r.from || "빈"} 규칙 삭제`}
                onClick={() => onChange({ ...dictionary, replacements: dictionary.replacements.filter((_, j) => j !== i) })}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => onChange({ ...dictionary, replacements: [...dictionary.replacements, { from: "", to: "" }] })}
        >
          규칙 추가
        </button>
      </section>

      <div className="danger-row">
        {confirmReset ? (
          <>
            <span>사전을 처음 상태(부동산공법 기본 용어)로 되돌릴까요?</span>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                onChange(DEFAULT_DICTIONARY);
                setConfirmReset(false);
              }}
            >
              되돌리기
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(false)}>
              취소
            </button>
          </>
        ) : (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmReset(true)}>
            기본 사전으로 되돌리기
          </button>
        )}
      </div>
      <p className="muted small">사전은 이 브라우저에만 저장됩니다.</p>
    </div>
  );
}
