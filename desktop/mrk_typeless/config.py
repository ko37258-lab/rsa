"""설정·사전·기록 파일 위치와 읽기/쓰기. 모든 파일은 이 컴퓨터의 %APPDATA%\\MRK-Typeless에만 저장됩니다."""

import json
import os
import time
from pathlib import Path

from .dictionary import DEFAULT_DICTIONARY

APP_NAME = "MR.K Typeless"
APP_DIR = Path(os.environ.get("APPDATA") or (Path.home() / ".config")) / "MRK-Typeless"
CONFIG_PATH = APP_DIR / "config.json"
DICTIONARY_PATH = APP_DIR / "dictionary.json"
HISTORY_PATH = APP_DIR / "history.jsonl"
LOG_PATH = APP_DIR / "log.txt"

DEFAULTS = {
    # 정리할 AI: auto(Claude 키가 있으면 Claude, 없으면 Gemini) | claude | gemini | local(AI 없이)
    "engine": "auto",
    "claude_api_key": "",
    "model": "claude-opus-5-5",
    "gemini_api_key": "",
    "gemini_model": "gemini-3.8-flash",
    "effort": "low",
    # 처음 설치하면 Gemini 키 하나로 받아쓰기·정리를 모두 합니다.
    "stt_provider": "gemini",
    "stt_api_key": "",
    "speech_lang": "ko",
    "mode": "clean",
    "target_language": "영어",
    "signature": "",
    "style_note": "",
    "auto_paste": True,
    "restore_clipboard": True,
    "hotkey_dictate": "ctrl+shift+space",
    "hotkey_polish": "ctrl+alt+space",
    "hotkey_edit": "ctrl+alt+e",
    # Win+H(Windows 음성 입력) 대신 MR.K 받아쓰기를 엽니다.
    "win_h": True,
    # 받아쓴 글과 정리한 글을 history.jsonl에 남길지
    "save_history": True,
}

# 기록 파일이 이보다 커지면 오래된 줄부터 지웁니다.
HISTORY_MAX_BYTES = 2 * 1024 * 1024
HISTORY_KEEP_LINES = 300
# 다른 프로그램에서 선택해 가져온 글은 이만큼만 남깁니다.
HISTORY_RAW_LIMIT = 2000

MODELS = [
    ("claude-opus-5-5", "Claude Opus 5.5 — 가장 정확함"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5 — 정확도와 속도의 균형"),
    ("claude-haiku-5-5", "Claude Haiku 5.5 — 가장 빠르고 저렴함"),
]

GEMINI_MODELS = [
    ("gemini-3.8-flash", "Gemini 3.8 Flash — 빠르고 정확함 (권장)"),
    ("gemini-4-argon", "Gemini 4 Argon — 가장 정확함, 느림"),
    ("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite — 가장 빠르고 저렴함"),
]

ENGINES = [
    ("auto", "자동 (Claude 키가 있으면 Claude, 없으면 Gemini)"),
    ("gemini", "Gemini"),
    ("claude", "Claude"),
    ("local", "AI 없이 ('음, 어'와 반복만 지우기)"),
]

CLAUDE_KEY_URL = "https://platform.claude.com/settings/keys"
GEMINI_KEY_URL = "https://aistudio.google.com/apikey"
GUIDE_URL = "https://mrk-typeless.vercel.app/download"

STT_PROVIDERS = [
    ("gemini", "Gemini (위 Gemini 키를 같이 씀)", GEMINI_KEY_URL),
    ("elevenlabs", "ElevenLabs Scribe", "https://elevenlabs.io/app/developers/api-keys"),
    ("openai", "OpenAI (gpt-4o-transcribe)", "https://platform.openai.com/api-keys"),
]

SPEECH_LANGS = [("ko", "한국어"), ("en", "영어"), ("ja", "일본어"), ("zh", "중국어")]
TARGET_LANGS = ["영어", "일본어", "중국어(간체)", "베트남어", "한국어"]


def stt_key(cfg: dict) -> str:
    """받아쓰기에 쓸 키: Gemini를 고르면 정리용 Gemini 키를 같이 씁니다."""
    key = cfg.get("gemini_api_key") if cfg.get("stt_provider") == "gemini" else cfg.get("stt_api_key")
    return (key or "").strip()


def polish_engine(cfg: dict) -> str:
    """이번에 정리할 AI: claude | gemini | local. 고른 AI의 키가 없으면 local."""
    claude = bool((cfg.get("claude_api_key") or "").strip())
    gemini = bool((cfg.get("gemini_api_key") or "").strip())
    choice = cfg.get("engine") or "auto"
    if choice == "claude":
        return "claude" if claude else "local"
    if choice == "gemini":
        return "gemini" if gemini else "local"
    if choice == "local":
        return "local"
    return "claude" if claude else "gemini" if gemini else "local"


def _read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _write_json(path: Path, data) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def load_config() -> dict:
    stored = _read_json(CONFIG_PATH)
    return {**DEFAULTS, **(stored if isinstance(stored, dict) else {})}


def save_config(cfg: dict) -> None:
    _write_json(CONFIG_PATH, cfg)


def load_dictionary() -> tuple[dict, str | None]:
    """(사전, 문제). 파일이 없으면 기본 사전(부동산공법 용어)으로 만들어 둡니다. 메모장으로 고칠 수 있습니다.
    파일이 있는데 읽을 수 없으면(메모장에서 쉼표를 빠뜨리는 등) 덮어쓰지 않고 기본 사전을 쓰며 그 이유를 돌려줍니다."""
    if not DICTIONARY_PATH.exists():
        _write_json(DICTIONARY_PATH, DEFAULT_DICTIONARY)
        return DEFAULT_DICTIONARY, None
    try:
        stored = json.loads(DICTIONARY_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        return DEFAULT_DICTIONARY, f"{DICTIONARY_PATH.name}: {e}"
    if isinstance(stored, dict) and isinstance(stored.get("terms"), list):
        terms = [t for t in stored["terms"] if isinstance(t, str)]
        rules = stored.get("replacements") or []
        if isinstance(rules, list):
            good = [r for r in rules if isinstance(r, dict) and isinstance(r.get("from"), str) and isinstance(r.get("to"), str)]
            bad = len(rules) - len(good)
        else:
            good, bad = [], 1
        problem = None
        if bad:
            problem = f'{DICTIONARY_PATH.name}: 바꿔쓰기 규칙 {bad}개의 형식이 잘못되어 건너뜁니다 ({{"from": "들린 말", "to": "바른 표기"}} 꼴이어야 함)'
        return {"terms": terms, "replacements": good}, problem
    return DEFAULT_DICTIONARY, f"{DICTIONARY_PATH.name}: 'terms' 목록이 없습니다"


def same_hotkey(a: str, b: str) -> bool:
    """'win+h'와 'windows+h', 'h+windows'처럼 적는 법만 다른 단축키를 같은 것으로 봅니다."""
    from .hotkeys import same_combo

    return same_combo(a, b)


def append_history(entry: dict, cfg: dict | None = None) -> None:
    """기록 한 줄을 붙입니다. 설정에서 껐으면 남기지 않고, 파일이 커지면 오래된 줄부터 지웁니다."""
    if cfg is not None and not cfg.get("save_history", True):
        return
    APP_DIR.mkdir(parents=True, exist_ok=True)
    entry = {"time": time.strftime("%Y-%m-%d %H:%M:%S"), **entry}
    if entry.get("kind") in ("polish", "edit") and isinstance(entry.get("raw"), str) and len(entry["raw"]) > HISTORY_RAW_LIMIT:
        entry["raw"] = entry["raw"][:HISTORY_RAW_LIMIT] + "…"
    with HISTORY_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    _trim_history()


def _trim_history() -> None:
    try:
        if HISTORY_PATH.stat().st_size <= HISTORY_MAX_BYTES:
            return
        lines = HISTORY_PATH.read_text(encoding="utf-8").splitlines(keepends=True)
        tmp = HISTORY_PATH.with_suffix(".tmp")
        tmp.write_text("".join(lines[-HISTORY_KEEP_LINES:]), encoding="utf-8")
        tmp.replace(HISTORY_PATH)
    except OSError:
        pass


def clear_history() -> None:
    try:
        HISTORY_PATH.unlink()
    except FileNotFoundError:
        pass
