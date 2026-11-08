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

/** 지금 화면에 보이는 정리 글과, 그 글을 만든 엔진·지시·설정·걸린 시간 */
export interface ShownResult {
  engine: EngineId;
  req: AiRequest;
  text: string;
  ms: number;
  /** 결과를 바꾸는 엔진 설정(모델·생각 깊이) — engineSetup()으로 만듭니다 */
  setup: string;
}

/** 같은 엔진이라도 모델·생각 깊이가 다르면 다른 글이 나오므로, 그 둘을 묶어 비교에 씁니다. */
export function engineSetup(engine: EngineId, settings: Settings): string {
  const model = engine === "gemini" ? settings.geminiModel : engine === "account" ? settings.accountTier : settings.model;
  return `${engine}|${model}|${settings.effort}`;
}

/**
 * 화면에 있는 글을 이 엔진의 비교 결과로 그대로 써도 되는지. 같은 엔진·같은 설정·같은 지시로
 * 끝까지 만든 글이면 같은 요청을 또 보내지 않습니다 (긴 강의 녹음이면 출력이 수만 토큰입니다).
 */
export function reusableFor(
  shown: ShownResult | null | undefined,
  engine: EngineId | null,
  req: AiRequest,
  settings: Settings,
): ShownResult | null {
  if (!shown || !engine || shown.engine !== engine) return null;
  if (shown.req.system !== req.system || shown.req.user !== req.user) return null;
  return shown.setup === engineSetup(engine, settings) ? shown : null;
}

interface Props {
  req: AiRequest;
  settings: Settings;
  accountAvailable: boolean;
  /** 지금 화면의 정리 글. 같은 엔진 쪽은 처음 열 때 이 글을 보여 주고 다시 보내지 않습니다 */
  shown?: ShownResult | null;
  /** 고른 쪽의 글과 그 글을 만든 엔진·지시·설정 */
  onAdopt: (picked: ShownResult, brand: string) => void;
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
export function ComparePanel({ req, settings, accountAvailable, shown, onAdopt, onOpenSettings, onClose }: Props) {
  const [round, setRound] = useState(0);
  // 비교를 연(또는 '다시 비교'를 누른) 순간의 설정으로 고정합니다. 그 사이 설정을 바꿔도 머리말과 결과가 어긋나지 않습니다.
  const [snap, setSnap] = useState(() => ({ sides: sidesFor(settings, accountAvailable), settings }));
  const sides = snap.sides;
  // 처음 열 때 화면의 글을 그대로 쓰는 쪽. 그 글은 이미 '지금 쓰는 글'입니다.
  const [reused] = useState(() => {
    const side = snap.sides.find((s) => reusableFor(shown, s.engine, req, snap.settings));
    return side ? { key: side.key, result: shown! } : null;
  });
  const [times, setTimes] = useState<Partial<Record<SideKey, number>>>({});
  const [adopted, setAdopted] = useState<SideKey | null>(reused?.key ?? null);
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
              : "같은 원문과 같은 지시를 Anthropic과 Google 두 곳에 함께 보내 정리했습니다. 마음에 드는 쪽을 '이 글 쓰기'로 고르세요."}
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
                setSnap({ sides: sidesFor(settings, accountAvailable), settings });
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
            settings={snap.settings}
            round={round}
            reuse={round === 0 && reused?.key === side.key ? reused.result : null}
            fastest={fastest === side.key}
            adopted={adopted === side.key}
            onDone={onDone}
            onAdopt={(text, ms) => {
              setAdopted(side.key);
              onAdopt({ engine: side.engine!, req, text, ms, setup: engineSetup(side.engine!, snap.settings) }, side.brand);
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
  /** 화면의 글을 그대로 쓸 때 (같은 요청을 다시 보내지 않음) */
  reuse: ShownResult | null;
  fastest: boolean;
  adopted: boolean;
  onDone: (key: SideKey, ms: number) => void;
  onAdopt: (text: string, ms: number) => void;
  onOpenSettings: () => void;
}

function CompareColumn({ side, order, req, settings, round, reuse, fastest, adopted, onDone, onAdopt, onOpenSettings }: ColumnProps) {
  const ai = useAiRun();
  const startedRef = useRef(0);
  const [ms, setMs] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [copied, setCopied] = useState(false);
  const [stopped, setStopped] = useState(false);

  // 처음 열 때와 '다시 비교'를 누를 때마다 새로 정리합니다 (저장된 답은 쓰지 않음).
  // 단, 처음 열 때 화면의 글과 같은 엔진·같은 지시인 쪽은 그 글과 걸린 시간을 그대로 보여 줍니다.
  useEffect(() => {
    if (!side.engine) return;
    if (reuse) {
      ai.show(reuse.text);
      setMs(reuse.ms);
      onDone(side.key, reuse.ms);
      return;
    }
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
          {reuse && ai.text && <p className="cmp__note">위에 정리된 글을 그대로 가져왔습니다 (다시 보내지 않음).</p>}
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
                <button type="button" className="btn btn--primary" onClick={() => onAdopt(ai.text, ms ?? 0)} disabled={adopted}>
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
