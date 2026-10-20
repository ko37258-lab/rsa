import { useCallback, useEffect, useState } from "react";
import { getSample } from "./ai/engine";
import { DictateView, ENGINE_LABEL } from "./components/DictateView";
import { DictionaryView } from "./components/DictionaryView";
import { EditView } from "./components/EditView";
import { HistoryView } from "./components/HistoryView";
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
      <header className="top">
        <div className="brand">
          <span className="brand__mark">MR.K</span>
          <span className="brand__name">Typeless</span>
        </div>
        <p className="brand__tag">말하면, 정리된 글이 됩니다</p>
        <button type="button" className={`engine-pill is-${engine}`} onClick={() => setTab("settings")}>
          <span className="engine-pill__dot" aria-hidden="true" />
          {checking ? "연결 확인 중" : ENGINE_LABEL[engine]}
        </button>
      </header>

      <nav className="tabs" role="tablist" aria-label="메뉴">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className={`tabs__item${tab === t.id ? " is-on" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "history" && history.length > 0 && <span className="tabs__count">{history.length}</span>}
          </button>
        ))}
      </nav>

      {aiMissing && tab !== "settings" && (
        <p className="banner">
          지금은 AI 없이 기본 정리만 합니다.{" "}
          <button type="button" className="link" onClick={() => setTab("settings")}>
            {__ARTIFACT__ ? "Claude 사용을 허용하면" : "설정에서 Claude API 키를 넣으면"}
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
          <HistoryView history={history} onChange={setHistory} />
        </div>
        <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab !== "settings"}>
          <SettingsView settings={settings} onSettings={patchSettings} engine={engine} accountAvailable={accountAvailable} />
        </div>
      </main>

      <footer className="foot">
        Typeless를 분석해 만든 MR.K 전용 받아쓰기 · 기록·사전·설정은 이 기기에만 저장됩니다
      </footer>
    </div>
  );
}
