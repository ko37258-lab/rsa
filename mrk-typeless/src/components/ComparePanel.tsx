import { useCallback, useEffect, useRef, useState } from "react";
import { useAiRun } from "../hooks/useAiRun";
import { copyText } from "../lib/clipboard";
import type { AiRequest } from "../lib/prompts";
import { GEMINI_MODEL_OPTIONS, MODEL_OPTIONS, TIER_OPTIONS, type EngineId, type Settings } from "../lib/settings";
import { countChars } from "../lib/stats";

type SideKey = "claude" | "gemini";

interface Side {
  key: SideKey;
  brand: string;
  /** 비교에 쓸 엔진. 키가 없으면 null */
  engine: EngineId | null;
  model: string;
  missing: string;
}

interface Props {
  req: AiRequest;
  settings: Settings;
  accountAvailable: boolean;
  onAdopt: (text: string, engine: EngineId, brand: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

function sidesFor(settings: Settings, accountAvailable: boolean): Side[] {
  const claude: EngineId | null = accountAvailable
    ? "account"
    : !__ARTIFACT__ && settings.apiKey.trim()
      ? "apikey"
      : null;
  const gemini: EngineId | null = !__ARTIFACT__ && settings.geminiKey.trim() ? "gemini" : null;
  return [
    {
      key: "claude",
      brand: "Claude",
      engine: claude,
      model:
        claude === "account"
          ? `내 Claude 계정 · ${TIER_OPTIONS.find((t) => t.id === settings.accountTier)?.label ?? ""}`
          : (MODEL_OPTIONS.find((m) => m.id === settings.model)?.label ?? settings.model),
      missing: "Claude API 키를 넣으면 같은 원문을 Claude로도 정리해 나란히 보여 드립니다.",
    },
    {
      key: "gemini",
      brand: "Gemini",
      engine: gemini,
      model: GEMINI_MODEL_OPTIONS.find((m) => m.id === settings.geminiModel)?.label ?? settings.geminiModel,
      missing: "Gemini API 키를 넣으면 같은 원문을 Gemini로도 정리해 나란히 보여 드립니다.",
    },
  ];
}

/** 같은 원문·같은 지시를 Claude와 Gemini에 동시에 보내 결과를 나란히 견줘 봅니다. */
export function ComparePanel({ req, settings, accountAvailable, onAdopt, onOpenSettings, onClose }: Props) {
  const sides = sidesFor(settings, accountAvailable);
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState<Partial<Record<SideKey, number>>>({});
  const [adopted, setAdopted] = useState<SideKey | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest" });
  }, []);

  const onDone = useCallback((key: SideKey, ms: number) => setTimes((t) => ({ ...t, [key]: ms })), []);

  const running = sides.filter((s) => s.engine);
  const fastest =
    running.length === 2 && running.every((s) => times[s.key] !== undefined)
      ? running.reduce((a, b) => (times[a.key]! <= times[b.key]! ? a : b)).key
      : null;

  return (
    <section ref={ref} className="compare" aria-label="Claude와 Gemini 비교">
      <header className="compare__head">
        <div>
          <h2 className="compare__title">Claude · Gemini 비교</h2>
          <p className="compare__desc">
            {running.length === 0
              ? "두 AI의 API 키를 넣으면 같은 원문을 동시에 정리해 견줘 볼 수 있습니다."
              : "같은 원문과 같은 지시로 동시에 정리했습니다. 마음에 드는 쪽을 '이 글 쓰기'로 고르세요."}
          </p>
        </div>
        <div className="compare__tools">
          {running.length > 0 && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setTimes({});
                setAdopted(null);
                setRound((r) => r + 1);
              }}
            >
              다시 비교
            </button>
          )}
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            닫기
          </button>
        </div>
      </header>
      <div className="compare__grid">
        {sides.map((side, i) => (
          <CompareColumn
            key={side.key}
            side={side}
            order={i}
            req={req}
            settings={settings}
            round={round}
            fastest={fastest === side.key}
            adopted={adopted === side.key}
            onDone={onDone}
            onAdopt={(text) => {
              setAdopted(side.key);
              onAdopt(text, side.engine!, side.brand);
            }}
            onOpenSettings={onOpenSettings}
          />
        ))}
      </div>
    </section>
  );
}

interface ColumnProps {
  side: Side;
  order: number;
  req: AiRequest;
  settings: Settings;
  round: number;
  fastest: boolean;
  adopted: boolean;
  onDone: (key: SideKey, ms: number) => void;
  onAdopt: (text: string) => void;
  onOpenSettings: () => void;
}

function CompareColumn({ side, order, req, settings, round, fastest, adopted, onDone, onAdopt, onOpenSettings }: ColumnProps) {
  const ai = useAiRun();
  const startedRef = useRef(0);
  const [ms, setMs] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);

  // 처음 열 때와 '다시 비교'를 누를 때마다 새로 정리합니다 (저장된 답은 쓰지 않음).
  useEffect(() => {
    if (!side.engine) return;
    let alive = true;
    startedRef.current = performance.now();
    setMs(null);
    setStopped(false);
    void ai.run(side.engine, req, settings, true).then((result) => {
      if (!alive || !result) return;
      const took = performance.now() - startedRef.current;
      setMs(took);
      onDone(side.key, took);
    });
    return () => {
      alive = false;
      ai.cancel();
    };
    // req·settings는 비교를 연 순간의 것으로 고정합니다.
  }, [round]);

  // 정리하는 동안 걸린 시간이 0.1초씩 올라갑니다.
  useEffect(() => {
    if (!ai.busy) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 100);
    return () => window.clearInterval(timer);
  }, [ai.busy]);

  const seconds = ms ?? (ai.busy ? performance.now() - startedRef.current : null);
  const done = ai.status === "done" && !!ai.text;

  return (
    <article
      className={`cmp cmp--${side.key} is-${side.engine ? ai.status : "missing"}${adopted ? " is-adopted" : ""}`}
      style={{ ["--d" as string]: order }}
      aria-busy={ai.busy}
    >
      <header className="cmp__head">
        <span className="cmp__dot" aria-hidden="true" />
        <span className="cmp__brand">{side.brand}</span>
        {side.engine ? <span className="cmp__model">{side.model}</span> : <span className="cmp__model">키 없음</span>}
        {fastest && <span className="cmp__badge">더 빠름</span>}
        {adopted && <span className="cmp__badge cmp__badge--on">지금 쓰는 글</span>}
      </header>

      {!side.engine ? (
        <div className="cmp__missing">
          <p>{side.missing}</p>
          <button type="button" className="btn btn--ghost" onClick={onOpenSettings}>
            설정에서 키 넣기
          </button>
        </div>
      ) : (
        <>
          {ai.status === "thinking" && (
            <p className="result__thinking cmp__thinking">
              <svg className="pencil" viewBox="0 0 40 12" aria-hidden="true">
                <path d="M2 8 C 8 2, 12 12, 18 6 S 28 2, 38 7" />
              </svg>
              정리하는 중…
            </p>
          )}
          {ai.status === "error" && ai.error && <p className="result__error">{ai.error}</p>}
          {stopped && !ai.busy && !ai.text && <p className="cmp__note">멈췄습니다. '다시 비교'를 누르면 새로 정리합니다.</p>}
          {ai.text && <div className="cmp__text">{ai.text}</div>}

          <footer className="cmp__foot">
            <dl className="cmp__stats">
              <div>
                <dt>걸린 시간</dt>
                <dd>{seconds === null ? "—" : `${(seconds / 1000).toFixed(1)}초`}</dd>
              </div>
              <div>
                <dt>글자 수</dt>
                <dd>{ai.text ? `${countChars(ai.text)}자` : "—"}</dd>
              </div>
            </dl>
            {done && (
              <div className="cmp__actions">
                <button type="button" className="btn btn--primary" onClick={() => onAdopt(ai.text)} disabled={adopted}>
                  {adopted ? "쓰는 중" : "이 글 쓰기"}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={async () => {
                    const ok = await copyText(ai.text);
                    setCopied(ok);
                    window.setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? "복사됨" : "복사"}
                </button>
              </div>
            )}
            {ai.busy && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setStopped(true);
                  ai.cancel();
                }}
              >
                멈추기
              </button>
            )}
          </footer>
        </>
      )}
    </article>
  );
}
