"""단축키 → 녹음 → 받아쓰기 → 정리 → 붙여넣기 흐름을 가짜 부품으로 확인합니다 (실제 마이크·화면 없이)."""

import sys
import time
import types

try:
    import tkinter  # noqa: F401
except ModuleNotFoundError:  # 화면 없는 리눅스 테스트 환경
    sys.modules["tkinter"] = types.ModuleType("tkinter")

import pytest

from mrk_typeless import app as app_module
from mrk_typeless import clipboard
from mrk_typeless.config import DEFAULTS


class FakeRecorder:
    def __init__(self):
        self.level, self.started_at, self.running = 0.0, 0.0, False

    def start(self):
        self.running, self.started_at = True, time.monotonic()

    def stop(self):
        self.running = False
        return b"RIFF-fake-wav", 1.5

    def cancel(self):
        self.running = False


class FakeOverlay:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        return lambda *a, **k: self.calls.append((name, a))


class FakeTray:
    def set_state(self, state, title):
        pass


@pytest.fixture
def app(monkeypatch, tmp_path):
    a = object.__new__(app_module.App)
    a.cfg = {**DEFAULTS, "stt_api_key": "sk_stt", "claude_api_key": "sk-ant", "mode": "clean"}
    a.recorder, a.overlay, a.tray = FakeRecorder(), FakeOverlay(), FakeTray()
    a.state, a.status_text, a.purpose = "idle", "대기 중", None
    a._pressed_at, a._keys_down = 0.0, set()
    import threading

    a._lock = threading.Lock()
    a.posted = []
    a.post = lambda fn, *args: (a.posted.append(getattr(fn, "__name__", str(fn))), fn(*args) if getattr(fn, "__self__", None) is a.overlay else None)

    pasted = []
    monkeypatch.setattr(app_module, "transcribe", lambda wav, provider, key, lang: "음 내일 오후 어 세 시에 현장 답사 가요")
    monkeypatch.setattr(app_module, "run_claude", lambda system, user, cfg: "내일 오후 3시에 현장 답사를 갑니다.")
    monkeypatch.setattr(app_module, "load_dictionary", lambda: {"terms": [], "replacements": [{"from": "건폐률", "to": "건폐율"}]})
    monkeypatch.setattr(app_module, "append_history", lambda entry: None)
    monkeypatch.setattr(clipboard, "paste_text", lambda text, restore=True, previous=None: pasted.append((text, previous)))
    monkeypatch.setattr(clipboard, "set_text", lambda text: pasted.append((text, "copied")))
    a.pasted = pasted
    return a


def wait_idle(a, timeout=3.0):
    end = time.monotonic() + timeout
    while a.state != "idle" and time.monotonic() < end:
        time.sleep(0.01)
    assert a.state == "idle"


def test_tap_starts_and_second_tap_finishes(app):
    app._on_record_hotkey("dictate")
    assert app.state == "recording"
    app._on_record_key_up("dictate")  # 짧게 눌렀다 뗌 → 계속 듣기
    assert app.state == "recording"
    app._on_record_hotkey("dictate")  # 다시 누름 → 끝
    app._on_record_key_up("dictate")
    wait_idle(app)
    assert app.pasted == [("내일 오후 3시에 현장 답사를 갑니다.", None)]


def test_hold_and_release_finishes(app):
    app._on_record_hotkey("dictate")
    app._pressed_at -= 1.0  # 1초 동안 누르고 있었던 것처럼
    app._on_record_key_up("dictate")
    wait_idle(app)
    assert len(app.pasted) == 1


def test_key_repeat_while_held_is_ignored(app):
    app._on_record_hotkey("dictate")
    app._on_record_hotkey("dictate")  # 누르고 있는 동안 반복 신호
    assert app.state == "recording"


def test_escape_discards_recording(app):
    app._on_record_hotkey("dictate")
    app._on_escape()
    assert app.state == "idle" and not app.recorder.running and app.pasted == []


def test_missing_stt_key_opens_settings(app):
    app.cfg["stt_api_key"] = ""
    app._on_record_hotkey("dictate")
    assert app.state == "idle"
    assert "open_settings" in app.posted


def test_polish_selection_sanitizes_and_restores_clipboard(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(clipboard, "copy_selection", lambda: ("음 캐슬─ ─앤칸─ ─타─ ─빌 건폐률", "원래 클립보드"))
    monkeypatch.setattr(app_module, "run_claude", lambda system, user, cfg: seen.setdefault("user", user) and "캐슬앤칸타빌 건폐율")
    app._on_polish_hotkey()
    wait_idle(app)
    assert "캐슬앤칸타빌 건폐율" in seen["user"]
    assert app.pasted == [("캐슬앤칸타빌 건폐율", "원래 클립보드")]


def test_without_claude_key_uses_basic_cleanup(app):
    app.cfg["claude_api_key"] = ""
    app._on_record_hotkey("dictate")
    app._pressed_at -= 1.0
    app._on_record_key_up("dictate")
    wait_idle(app)
    assert app.pasted == [("내일 오후 세 시에 현장 답사 가요", None)]


def test_edit_applies_spoken_command_to_selection(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(clipboard, "copy_selection", lambda: ("고칠 글입니다", "prev"))
    monkeypatch.setattr(app_module, "transcribe", lambda *a: "더 공손하게")
    monkeypatch.setattr(app_module, "run_claude", lambda system, user, cfg: seen.setdefault("user", user) and "고칠 글이옵니다")
    app._on_record_hotkey("edit")
    app._pressed_at -= 1.0
    app._on_record_key_up("edit")
    wait_idle(app)
    assert "<지시>\n더 공손하게" in seen["user"] and "고칠 글입니다" in seen["user"]
    assert app.pasted == [("고칠 글이옵니다", "prev")]
