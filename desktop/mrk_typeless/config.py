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
    "claude_api_key": "",
    "model": "claude-opus-5-5",
    "effort": "low",
    "stt_provider": "elevenlabs",
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
}

MODELS = [
    ("claude-opus-5-5", "Claude Opus 5.5 — 가장 정확함"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5 — 정확도와 속도의 균형"),
    ("claude-haiku-5-5", "Claude Haiku 5.5 — 가장 빠르고 저렴함"),
]

STT_PROVIDERS = [
    ("elevenlabs", "ElevenLabs Scribe", "https://elevenlabs.io/app/developers/api-keys"),
    ("openai", "OpenAI (gpt-4o-transcribe)", "https://platform.openai.com/api-keys"),
]

CLAUDE_KEY_URL = "https://platform.claude.com/settings/keys"

SPEECH_LANGS = [("ko", "한국어"), ("en", "영어"), ("ja", "일본어"), ("zh", "중국어")]
TARGET_LANGS = ["영어", "일본어", "중국어(간체)", "베트남어", "한국어"]


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


def load_dictionary() -> dict:
    """사전 파일이 없으면 기본 사전(부동산공법 용어)으로 만들어 둡니다. 메모장으로 고칠 수 있습니다."""
    stored = _read_json(DICTIONARY_PATH)
    if isinstance(stored, dict) and isinstance(stored.get("terms"), list):
        return {"terms": stored.get("terms", []), "replacements": stored.get("replacements", [])}
    _write_json(DICTIONARY_PATH, DEFAULT_DICTIONARY)
    return DEFAULT_DICTIONARY


def append_history(entry: dict) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    entry = {"time": time.strftime("%Y-%m-%d %H:%M:%S"), **entry}
    with HISTORY_PATH.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
