import { useMemo, useState } from "react";
import { useCountUp } from "../hooks/useCountUp";
import { copyText } from "../lib/clipboard";
import { formatWhen, type HistoryItem } from "../lib/history";
import { getMode } from "../lib/modes";
import { countChars, formatDuration } from "../lib/stats";
import { Sparkline } from "./Sparkline";

interface Props {
  history: HistoryItem[];
  onChange: (next: HistoryItem[]) => void;
  /** 기록 탭이 보일 때 숫자가 차오릅니다 */
  active: boolean;
}

/** 최근 7일, 날마다 정리한 글자 수 */
function lastSevenDays(history: HistoryItem[]): { labels: string[]; values: number[] } {
  const labels: string[] = [];
  const values: number[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const next = d.getTime() + 86_400_000;
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    values.push(
      history
        .filter((h) => h.kind === "dictation" && h.createdAt >= d.getTime() && h.createdAt < next)
        .reduce((sum, h) => sum + countChars(h.result), 0),
    );
  }
  return { labels, values };
}

export function HistoryView({ history, onChange, active }: Props) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const totals = useMemo(() => {
    const dictations = history.filter((h) => h.kind === "dictation");
    return {
      count: dictations.length,
      chars: dictations.reduce((sum, h) => sum + countChars(h.result), 0),
      saved: dictations.reduce((sum, h) => sum + h.savedMs, 0),
    };
  }, [history]);

  const week = useMemo(() => lastSevenDays(history), [history]);
  const count = useCountUp(totals.count, active);
  const chars = useCountUp(totals.chars, active);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => `${h.result}\n${h.raw}\n${h.command ?? ""}`.toLowerCase().includes(q));
  }, [history, query]);

  return (
    <div className="view history">
      <div className="stats-card">
        <dl className="stats">
          <div className="stat">
            <dt>받아쓰기</dt>
            <dd>
              {count.toLocaleString("ko-KR")}
              <small>회</small>
            </dd>
          </div>
          <div className="stat">
            <dt>정리한 글</dt>
            <dd>
              {chars.toLocaleString("ko-KR")}
              <small>자</small>
            </dd>
          </div>
          <div className="stat">
            <dt>아낀 시간 (추정)</dt>
            <dd>{totals.saved > 0 ? formatDuration(totals.saved) : "0초"}</dd>
          </div>
        </dl>
        <div className="week">
          <p className="week__title">최근 7일 정리한 글자 수</p>
          <Sparkline values={week.values} labels={week.labels} />
          <div className="week__labels" aria-hidden="true">
            {week.labels.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="history__bar">
        <label htmlFor="history-search" className="sr-only">
          기록 검색
        </label>
        <input id="history-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="기록 검색" />
      </div>

      {history.length === 0 ? (
        <div className="empty">
          <p className="empty__title">아직 기록이 없습니다.</p>
          <p className="muted">받아쓰기에서 정리한 글이 여기에 차곡차곡 쌓입니다. 기록은 이 브라우저에만 저장됩니다.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="muted">"{query}"가 들어간 기록이 없습니다.</p>
      ) : (
        <ol className="entries">
          {visible.map((h) => (
            <li key={h.id} className="entry">
              <div className="entry__meta">
                <span className="tag">{h.kind === "edit" ? "음성 편집" : getMode(h.mode ?? "clean").label}</span>
                <time dateTime={new Date(h.createdAt).toISOString()}>{formatWhen(h.createdAt)}</time>
                {h.savedMs > 0 && <span>{formatDuration(h.savedMs)} 절약</span>}
              </div>
              {h.command && <p className="entry__command">지시: {h.command}</p>}
              <p className={`entry__text${openId === h.id ? " is-open" : ""}`}>{h.result}</p>
              {openId === h.id && (
                <div className="result__original">
                  <span className="label">{h.kind === "edit" ? "고치기 전 글" : "받아쓴 원문"}</span>
                  <p>{h.raw}</p>
                </div>
              )}
              <div className="entry__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={async () => {
                    const ok = await copyText(h.result);
                    setCopiedId(ok ? h.id : null);
                    window.setTimeout(() => setCopiedId(null), 2000);
                  }}
                >
                  {copiedId === h.id ? "복사됨" : "복사"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setOpenId(openId === h.id ? null : h.id)} aria-expanded={openId === h.id}>
                  {openId === h.id ? "접기" : "원문 보기"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => onChange(history.filter((x) => x.id !== h.id))}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {history.length > 0 && (
        <div className="danger-row">
          {confirmClear ? (
            <>
              <span>기록 {history.length}개를 모두 지울까요? 되돌릴 수 없습니다.</span>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => {
                  onChange([]);
                  setConfirmClear(false);
                }}
              >
                모두 지우기
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmClear(false)}>
                취소
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmClear(true)}>
              기록 모두 지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
