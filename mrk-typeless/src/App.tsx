import { useCallback, useEffect, useState } from "react";
import { getSample } from "./ai/engine";
import { DictateView, ENGINE_LABEL } from "./components/DictateView";
import { DictionaryView } from "./components/DictionaryView";
import { EditView } from "./components/EditView";
import { GuideDialog } from "./components/GuideDialog";
import { HandNote } from "./components/HandNote";
import { HistoryView } from "./components/HistoryView";
import { Segmented } from "./components/Segmented";
import { SettingsView } from "./components/SettingsView";
import { usePersistentState } from "./hooks/usePersistentState";
import { DEFAULT_DICTIONARY, type Dictionary } from "./lib/dictionary";
import { addToHistory, type HistoryItem } from "./lib/history";
import { DOWNLOAD_PAGE_URL } from "./lib/desktop";
import { DEFAULT_SETTINGS, resolveEngine, type EngineId, type Settings } from "./lib/settings";
import { load, save } from "./lib/storage";

type Tab = "dictate" | "edit" | "dictionary" | "history" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "dictate", label: "받아쓰기" },
  { id: "edit", label: "음성 편집" },
  { id: "dictionary", label: "사전" },
  { id: "history", label: "기록" },
  { id: "settings", label: "설정" },
];

const ENGINE_SHORT: Record<EngineId, string> = { account: "Claude 계정", apikey: "Claude", gemini: "Gemini", local: "AI 없이" };

export function App() {
  const [settings, setSettings] = usePersistentState<Settings>("settings", (s) => ({ ...DEFAULT_SETTINGS, ...s }));
  const [dictionary, setDictionary] = usePersistentState<Dictionary>("dictionary", (s) => s ?? DEFAULT_DICTIONARY);
  const [history, setHistory] = usePersistentState<HistoryItem[]>("history", (s) => s ?? []);
  const [tab, setTab] = usePersistentState<Tab>("tab", (s) => (s && TABS.some((t) => t.id === s) ? s : "dictate"));
  const [firstVisit] = useState(() => load("history") === undefined && load("draft") === undefined);
  const [editSource, setEditSource] = useState("");
  const [accountAvailable, setAccountAvailable] = useState(false);
  const [checking, setChecking] = useState(() => typeof window !== "undefined" && !!window.claude);
  // 사용법: 주소 끝에 #guide를 붙이면 바로 열립니다 (학생에게 보낼 때).
  const [guideOpen, setGuideOpen] = useState(() => typeof window !== "undefined" && window.location.hash === "#guide");
  const [guideSeen, setGuideSeen] = useState(() => load<boolean>("guideSeen") === true);
  const openGuide = useCallback(() => {
    setGuideOpen(true);
    setGuideSeen(true);
    save("guideSeen", true);
    if (!__ARTIFACT__) window.history.replaceState(null, "", "#guide");
  }, []);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === "#guide") setGuideOpen(true);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  const closeGuide = useCallback(() => {
    setGuideOpen(false);
    if (!__ARTIFACT__ && window.location.hash === "#guide") window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    let alive = true;
    getSample().then((sample) => {
      if (!alive) return;
      setAccountAvailable(!!sample);
      setChecking(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const engine = resolveEngine(settings, accountAvailable, !__ARTIFACT__);
  const patchSettings = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [setSettings]);
  const saveItem = useCallback((item: HistoryItem) => setHistory((h) => addToHistory(h, item)), [setHistory]);
  const sendToEdit = useCallback(
    (text: string) => {
      setEditSource(text);
      setTab("edit");
    },
    [setTab],
  );

  const aiMissing = engine === "local" && settings.engine !== "local" && !checking;

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="9" y="4" width="6" height="11" rx="3" />
              <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v3" />
            </svg>
          </span>
          <span className="brand__name">
            MR.K <b>Typeless</b>
          </span>
        </div>
        <div className="nav__actions">
          <button type="button" className={`guide-btn${guideSeen ? "" : " is-new"}`} onClick={openGuide} aria-haspopup="dialog">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="10" cy="10" r="7.5" />
              <path d="M7.9 7.6a2.2 2.2 0 1 1 3.1 2c-.6.3-1 .8-1 1.4v.4M10 14.2v.1" />
            </svg>
            사용법
          </button>
          <a
            className="pc-link"
            href={DOWNLOAD_PAGE_URL}
            target={__ARTIFACT__ ? "_blank" : undefined}
            rel="noopener noreferrer"
            aria-label="Windows PC 프로그램 내려받기"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
              <path d="M7 16.5h6M10 13.5v3" />
            </svg>
            PC 프로그램
          </a>
          <button type="button" className={`engine-pill is-${engine}`} onClick={() => setTab("settings")}>
            <span className="engine-pill__dot" aria-hidden="true" />
            <span className="engine-pill__full">{checking ? "연결 확인 중" : ENGINE_LABEL[engine]}</span>
            <span className="engine-pill__short" aria-hidden="true">
              {checking ? "확인 중" : ENGINE_SHORT[engine]}
            </span>
          </button>
        </div>
      </header>

      <section className="hero">
        <h1 className="hero__title">
          말하면, <span className="hero__accent">정리된 글</span>이 됩니다
        </h1>
        <p className="hero__sub">"음, 어"는 걷어내고, 말을 바꾼 곳은 마지막 뜻만 남겨 바로 붙여넣을 글로 만들어 드립니다.</p>
        <button type="button" className="hero__guide" onClick={openGuide}>
          무엇을 누르면 녹음되고, AI가 어떻게 정리하는지 보기 →
        </button>
        <HandNote text="부동산공법 용어도 알아들어요" className="hero__note" />
      </section>

      <Segmented
        variant="tabs"
        ariaLabel="메뉴"
        value={tab}
        onChange={setTab}
        panelId={(id) => `panel-${id}`}
        options={TABS.map((t) => ({
          id: t.id,
          label: (
            <>
              {t.label}
              {t.id === "history" && history.length > 0 && <span className="tabs__count">{history.length}</span>}
            </>
          ),
        }))}
      />

      {aiMissing && tab !== "settings" && (
        <p className="banner">
          지금은 AI 없이 기본 정리만 합니다.{" "}
          <button type="button" className="link" onClick={() => setTab("settings")}>
            {__ARTIFACT__ ? "Claude 사용을 허용하면" : "설정에서 Claude나 Gemini API 키를 넣으면"}
          </button>{" "}
          말 바꿈 정리, 목록, 이메일·보고서 형식까지 됩니다.
        </p>
      )}

      <main>
        <div role="tabpanel" id="panel-dictate" aria-labelledby="tab-dictate" hidden={tab !== "dictate"}>
          <DictateView
            active={tab === "dictate"}
            settings={settings}
            onSettings={patchSettings}
            dictionary={dictionary}
            engine={engine}
            accountAvailable={accountAvailable}
            firstVisit={firstVisit}
            onSave={saveItem}
            onSendToEdit={sendToEdit}
            onOpenSettings={() => setTab("settings")}
          />
        </div>
        <div role="tabpanel" id="panel-edit" aria-labelledby="tab-edit" hidden={tab !== "edit"}>
          <EditView settings={settings} dictionary={dictionary} engine={engine} source={editSource} onSource={setEditSource} onSave={saveItem} />
        </div>
        <div role="tabpanel" id="panel-dictionary" aria-labelledby="tab-dictionary" hidden={tab !== "dictionary"}>
          <DictionaryView dictionary={dictionary} onChange={setDictionary} />
        </div>
        <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" hidden={tab !== "history"}>
          <HistoryView history={history} onChange={setHistory} active={tab === "history"} />
        </div>
        <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab !== "settings"}>
          <SettingsView settings={settings} onSettings={patchSettings} engine={engine} accountAvailable={accountAvailable} />
        </div>
      </main>

      <GuideDialog open={guideOpen} onClose={closeGuide} />

      <footer className="foot">
        <span>Typeless를 분석해 만든 MR.K 전용 받아쓰기</span>
        <span>기록·사전·설정은 이 기기에만 저장됩니다</span>
        <a href={DOWNLOAD_PAGE_URL} target={__ARTIFACT__ ? "_blank" : undefined} rel="noopener noreferrer">
          Windows PC 프로그램 내려받기
        </a>
      </footer>
    </div>
  );
}
