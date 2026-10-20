import { useCallback, useEffect, useState } from "react";
import { getSample } from "./ai/engine";
import { DictateView, ENGINE_LABEL } from "./components/DictateView";
import { DictionaryView } from "./components/DictionaryView";
import { EditView } from "./components/EditView";
import { HandNote } from "./components/HandNote";
import { HistoryView } from "./components/HistoryView";
import { Segmented } from "./components/Segmented";
import { SettingsView } from "./components/SettingsView";
import { usePersistentState } from "./hooks/usePersistentState";
import { DEFAULT_DICTIONARY, type Dictionary } from "./lib/dictionary";
import { addToHistory, type HistoryItem } from "./lib/history";
import { DEFAULT_SETTINGS, resolveEngine, type Settings } from "./lib/settings";
import { load } from "./lib/storage";

type Tab = "dictate" | "edit" | "dictionary" | "history" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "dictate", label: "받아쓰기" },
  { id: "edit", label: "음성 편집" },
  { id: "dictionary", label: "사전" },
  { id: "history", label: "기록" },
  { id: "settings", label: "설정" },
];

export function App() {
  const [settings, setSettings] = usePersistentState<Settings>("settings", (s) => ({ ...DEFAULT_SETTINGS, ...s }));
  const [dictionary, setDictionary] = usePersistentState<Dictionary>("dictionary", (s) => s ?? DEFAULT_DICTIONARY);
  const [history, setHistory] = usePersistentState<HistoryItem[]>("history", (s) => s ?? []);
  const [tab, setTab] = usePersistentState<Tab>("tab", (s) => (s && TABS.some((t) => t.id === s) ? s : "dictate"));
  const [firstVisit] = useState(() => load("history") === undefined && load("draft") === undefined);
  const [editSource, setEditSource] = useState("");
  const [accountAvailable, setAccountAvailable] = useState(false);
  const [checking, setChecking] = useState(() => typeof window !== "undefined" && !!window.claude);

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
        <button type="button" className={`engine-pill is-${engine}`} onClick={() => setTab("settings")}>
          <span className="engine-pill__dot" aria-hidden="true" />
          {checking ? "연결 확인 중" : ENGINE_LABEL[engine]}
        </button>
      </header>

      <section className="hero">
        <h1 className="hero__title">
          말하면, <span className="hero__accent">정리된 글</span>이 됩니다
        </h1>
        <p className="hero__sub">"음, 어"는 걷어내고, 말을 바꾼 곳은 마지막 뜻만 남겨 바로 붙여넣을 글로 만들어 드립니다.</p>
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

      <footer className="foot">
        <span>Typeless를 분석해 만든 MR.K 전용 받아쓰기</span>
        <span>기록·사전·설정은 이 기기에만 저장됩니다</span>
      </footer>
    </div>
  );
}
