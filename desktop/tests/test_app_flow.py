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
        def method(*a, **k):
            self.calls.append((name, a))

        method.__name__ = name
        return method


class FakeTray:
    def set_state(self, state, title):
        pass


@pytest.fixture
def app(monkeypatch, tmp_path):
    a = object.__new__(app_module.App)
    a.cfg = {**DEFAULTS, "stt_provider": "elevenlabs", "stt_api_key": "sk_stt", "claude_api_key": "sk-ant", "mode": "clean"}
    a.recorder, a.overlay, a.tray = FakeRecorder(), FakeOverlay(), FakeTray()
    a.state, a.status_text, a.purpose = "idle", "대기 중", None
    a._pressed_at, a._keys_down, a._first_setup = 0.0, set(), False
    a._stt_note = ""
    import threading

    a._lock = threading.Lock()
    a.posted = []

    def post(fn, *args):
        name = getattr(fn, "__name__", str(fn))
        a.posted.append(name)
        if name.startswith(("show_", "hide")):  # 화면 표시는 바로 실행해 기록합니다
            fn(*args)

    a.post = post

    pasted = []
    a.stt_calls = []

    def fake_transcribe(wav, provider, key, lang, hints=None):
        a.stt_calls.append({"provider": provider, "key": key, "hints": hints})
        return "음 내일 오후 어 세 시에 현장 답사 가요"

    monkeypatch.setattr(app_module, "transcribe", fake_transcribe)
    monkeypatch.setattr(app_module, "run_ai", lambda system, user, cfg: "내일 오후 3시에 현장 답사를 갑니다.")
    monkeypatch.setattr(app_module, "load_dictionary", lambda: ({"terms": ["지구단위계획"], "replacements": [{"from": "건폐률", "to": "건폐율"}]}, None))
    monkeypatch.setattr(app_module, "append_history", lambda entry: None)
    monkeypatch.setattr(clipboard, "paste_text", lambda text, restore_previous=True, previous=None: pasted.append((text, previous)))
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
    assert app.state == "idle" and app.pasted == []
    end = time.monotonic() + 1.0
    while app.recorder.running and time.monotonic() < end:
        time.sleep(0.01)
    assert not app.recorder.running


def test_hook_callbacks_do_not_touch_the_mic_or_tray_directly(app, monkeypatch):
    """키보드 훅 안에서는 상태만 바꾸고, 마이크 열기·닫기와 트레이 그리기는 다른 스레드/화면 스레드로 넘깁니다."""
    import threading

    hook_thread = threading.current_thread().name
    calls = []

    def start():
        calls.append(("start", threading.current_thread().name))
        app.recorder.running, app.recorder.started_at = True, time.monotonic()

    def stop():
        calls.append(("stop", threading.current_thread().name))
        app.recorder.running = False
        return b"RIFF-fake-wav", 1.5

    monkeypatch.setattr(app.recorder, "start", start)
    monkeypatch.setattr(app.recorder, "stop", stop)
    def set_state(state, title):
        calls.append(("tray", threading.current_thread().name))

    monkeypatch.setattr(app.tray, "set_state", set_state)
    app._on_record_hotkey("dictate")
    assert app.state == "recording"
    app._pressed_at -= 1.0
    app._on_record_key_up("dictate")
    wait_idle(app)
    time.sleep(0.05)
    assert all(thread != hook_thread for kind, thread in calls if kind in ("start", "stop")), calls
    assert "tray" not in [k for k, _ in calls] and "set_state" in app.posted  # 트레이는 post()로만


def test_mic_open_failure_returns_to_idle(app, monkeypatch):
    def fail():
        raise app_module.AudioError("마이크를 열지 못했습니다.")

    monkeypatch.setattr(app.recorder, "start", fail)
    app._on_record_hotkey("dictate")
    wait_idle(app)
    assert app.purpose is None and any(name == "show_error" for name, _ in app.overlay.calls)


def test_too_short_recording_tells_the_user(app, monkeypatch):
    monkeypatch.setattr(app.recorder, "stop", lambda: (b"RIFF", 0.2))
    app._on_record_hotkey("dictate")
    app._pressed_at -= 1.0
    app._on_record_key_up("dictate")
    wait_idle(app)
    assert app.pasted == [] and any(name == "show_info" and "짧아요" in args[0] for name, args in app.overlay.calls)


def test_user_hotkey_equal_to_win_h_is_registered_once(app, monkeypatch):
    kb = FakeKeyboard()
    monkeypatch.setitem(sys.modules, "keyboard", kb)
    app.cfg.update({"win_h": True, "hotkey_dictate": "win+h"})
    app.register_hotkeys()
    assert [str(b.combo) for b in app.hotkeys.bindings].count("windows+h") == 1


def test_missing_stt_key_opens_settings(app):
    app.cfg["stt_api_key"] = ""
    app._on_record_hotkey("dictate")
    assert app.state == "idle"
    assert "open_settings" in app.posted


def test_polish_selection_sanitizes_and_restores_clipboard(app, monkeypatch):
    seen = {}
    monkeypatch.setattr(clipboard, "copy_selection", lambda: ("음 캐슬─ ─앤칸─ ─타─ ─빌 건폐률", "원래 클립보드"))
    monkeypatch.setattr(app_module, "run_ai", lambda system, user, cfg: seen.setdefault("user", user) and "캐슬앤칸타빌 건폐율")
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
    monkeypatch.setattr(app_module, "transcribe", lambda *a, **k: "더 공손하게")
    monkeypatch.setattr(app_module, "run_ai", lambda system, user, cfg: seen.setdefault("user", user) and "고칠 글이옵니다")
    app._on_record_hotkey("edit")
    app._pressed_at -= 1.0
    app._on_record_key_up("edit")
    wait_idle(app)
    assert "<지시>\n더 공손하게" in seen["user"] and "고칠 글입니다" in seen["user"]
    assert app.pasted == [("고칠 글이옵니다", "prev")]


def test_win_h_taps_start_and_finish(app):
    app._on_record_hotkey("dictate", "winh")  # Win+H
    assert app.state == "recording"
    app._on_record_key_up("dictate", "winh")  # H에서 바로 손을 뗌 → 계속 듣기
    assert app.state == "recording"
    app._on_record_hotkey("dictate", "winh")  # Win+H 한 번 더 → 끝
    app._on_record_key_up("dictate", "winh")
    wait_idle(app)
    assert app.pasted == [("내일 오후 3시에 현장 답사를 갑니다.", None)]


def test_other_dictate_key_also_finishes_win_h_recording(app):
    app._on_record_hotkey("dictate", "winh")
    app._on_record_key_up("dictate", "winh")
    app._on_record_hotkey("dictate")  # Ctrl+Shift+Space로 끝내도 됨
    wait_idle(app)
    assert len(app.pasted) == 1


def test_gemini_key_alone_does_dictation_and_polish(app, monkeypatch):
    seen = {}
    app.cfg.update({"stt_provider": "gemini", "stt_api_key": "", "claude_api_key": "", "gemini_api_key": "AIza-test"})
    monkeypatch.setattr(app_module, "run_ai", lambda system, user, cfg: seen.setdefault("engine", app_module.polish_engine(cfg)) and "정리됨")
    app._on_record_hotkey("dictate")
    app._pressed_at -= 1.0
    app._on_record_key_up("dictate")
    wait_idle(app)
    assert app.stt_calls == [{"provider": "gemini", "key": "AIza-test", "hints": ["지구단위계획"]}]
    assert seen["engine"] == "gemini" and app.pasted == [("정리됨", None)]


def test_missing_gemini_key_opens_settings(app):
    app.cfg.update({"stt_provider": "gemini", "gemini_api_key": ""})
    app._on_record_hotkey("dictate")
    assert app.state == "idle" and "open_settings" in app.posted


def test_edit_needs_an_ai_key(app):
    app.cfg["claude_api_key"] = ""
    app._on_record_hotkey("edit")
    assert app.state == "idle" and not app.recorder.running


class FakeKeyboard(types.ModuleType):
    def __init__(self):
        super().__init__("keyboard")
        self.hooks, self.press_keys, self.legacy_hotkeys = [], [], []

    def unhook_all(self):
        self.hooks.clear()

    def hook(self, callback, suppress=False):
        self.hooks.append((callback, suppress))

    def on_press_key(self, key, callback):
        self.press_keys.append(key)

    def key_to_scan_codes(self, key):
        return (sum(map(ord, key)),)

    # 예전 방식(보조키를 삼켰다가 다시 보냄)은 한/영 키를 망가뜨리므로 쓰면 안 됩니다.
    def add_hotkey(self, *a, **k):
        self.legacy_hotkeys.append(a)

    def on_release_key(self, *a, **k):
        self.legacy_hotkeys.append(a)


def registered(app):
    """register_hotkeys가 건 단축키: {'ctrl+shift+space': Binding, ...}"""
    return {str(b.combo): b for b in app.hotkeys.bindings}


@pytest.mark.parametrize("win_h", [True, False])
def test_win_h_hotkey_follows_setting(app, monkeypatch, win_h):
    kb = FakeKeyboard()
    monkeypatch.setitem(sys.modules, "keyboard", kb)
    app.cfg["win_h"] = win_h
    app.register_hotkeys()
    combos = registered(app)
    assert ("windows+h" in combos) is win_h
    assert "ctrl+shift+space" in combos and combos["ctrl+shift+space"].on_release is not None
    # 한 개의 훅이 모든 키를 먼저 보고 막을지 정하며, 보조키를 삼키는 add_hotkey는 쓰지 않습니다
    assert len(kb.hooks) == 1 and kb.hooks[0][1] is True and kb.legacy_hotkeys == []
    assert "esc" in kb.press_keys


def test_polish_failure_keeps_transcript_in_clipboard(app, monkeypatch):
    copied = []
    monkeypatch.setattr(clipboard, "set_text", lambda text: copied.append(text))

    def fail(system, user, cfg):
        raise app_module.LlmError("Gemini 서버가 바쁩니다.")

    monkeypatch.setattr(app_module, "run_ai", fail)
    app._on_record_hotkey("dictate")
    app._pressed_at -= 1.0
    app._on_record_key_up("dictate")
    wait_idle(app)
    assert app.pasted == [] and copied == ["음 내일 오후 어 세 시에 현장 답사 가요"]
    assert any(name == "show_error" and "클립보드" in args[0] for name, args in app.overlay.calls)


def test_mode_hotkeys_registered(app, monkeypatch):
    kb = FakeKeyboard()
    monkeypatch.setitem(sys.modules, "keyboard", kb)
    app.register_hotkeys()
    combos = registered(app)
    assert all(f"ctrl+alt+{i}" in combos for i in range(1, 8))


def _run_dictation(app):
    app._on_record_hotkey("dictate")
    app._pressed_at -= 1.0
    app._on_record_key_up("dictate")
    wait_idle(app)


def test_stt_out_of_credit_switches_to_gemini(app, monkeypatch):
    """ElevenLabs 크레딧이 떨어지면(401 quota_exceeded) 같은 녹음을 Gemini로 받아쓰고, 다음부터 Gemini를 씁니다."""
    from mrk_typeless import stt as stt_module

    app.cfg["gemini_api_key"] = "AIza-test"
    calls = []

    def fake_transcribe(wav, provider, key, lang, hints=None):
        calls.append((provider, key))
        if provider == "elevenlabs":
            raise stt_module.stt_failure("elevenlabs", 401, {"detail": {"status": "quota_exceeded", "message": "0 credits remaining"}})
        return "음 내일 오후 어 세 시에 현장 답사 가요"

    saved = []
    monkeypatch.setattr(app_module, "transcribe", fake_transcribe)
    monkeypatch.setattr(app_module, "save_config", lambda cfg: saved.append(dict(cfg)))
    _run_dictation(app)
    assert calls == [("elevenlabs", "sk_stt"), ("gemini", "AIza-test")]
    assert app.pasted and app.pasted[0][0] == "내일 오후 3시에 현장 답사를 갑니다."
    info = [args for name, args in app.overlay.calls if name == "show_info"]
    assert info and "크레딧" in info[-1][1] and "Gemini" in info[-1][1]
    assert "_switch_stt_to_gemini" in app.posted
    app._switch_stt_to_gemini()
    assert app.cfg["stt_provider"] == "gemini" and saved[-1]["stt_provider"] == "gemini"
    assert app._stt_note == ""


def test_stt_out_of_credit_without_gemini_shows_real_reason(app, monkeypatch):
    from mrk_typeless import stt as stt_module

    app.cfg["gemini_api_key"] = ""

    def fake_transcribe(wav, provider, key, lang, hints=None):
        raise stt_module.stt_failure("elevenlabs", 401, {"detail": {"status": "quota_exceeded"}})

    monkeypatch.setattr(app_module, "transcribe", fake_transcribe)
    _run_dictation(app)
    errors = [args[0] for name, args in app.overlay.calls if name == "show_error"]
    assert errors and "크레딧" in errors[-1] and "키가 맞지 않습니다" not in errors[-1]
    assert app.pasted == []


def test_stt_busy_does_not_switch(app, monkeypatch):
    """잠깐 몰린 것(429)은 Gemini로 넘기지 않고 그대로 알립니다."""
    from mrk_typeless import stt as stt_module

    app.cfg["gemini_api_key"] = "AIza-test"
    calls = []

    def fake_transcribe(wav, provider, key, lang, hints=None):
        calls.append(provider)
        raise stt_module.stt_failure("elevenlabs", 429, {"detail": {"status": "too_many_concurrent_requests"}})

    monkeypatch.setattr(app_module, "transcribe", fake_transcribe)
    _run_dictation(app)
    assert calls == ["elevenlabs"]
    assert "_switch_stt_to_gemini" not in app.posted


def test_hotkeys_drive_recording_without_touching_hangul_key(app, monkeypatch):
    """실제 훅 경로: Ctrl+Shift+Space를 누르고 떼면 녹음이 시작·끝나고, 한/영 키(오른쪽 Alt 스캔 코드)는 그대로 지나갑니다."""
    from mrk_typeless import hotkeys

    kb = FakeKeyboard()
    monkeypatch.setitem(sys.modules, "keyboard", kb)
    held = {"mods": frozenset()}
    masks = []
    monkeypatch.setattr(hotkeys, "held_modifiers", lambda: held["mods"])
    monkeypatch.setattr(hotkeys, "send_mask_key", lambda: masks.append(1))
    app.register_hotkeys()
    handle = kb.hooks[0][0]
    space = kb.key_to_scan_codes("space")[0]

    class Ev:
        def __init__(self, t, code):
            self.event_type, self.scan_code = t, code

    # 한/영 키: 오른쪽 Alt와 같은 스캔 코드 0x38. 누르든 떼든 막지 않습니다
    assert handle(Ev("down", 0x38)) is True and handle(Ev("up", 0x38)) is True
    # 그냥 Space는 글자 입력이므로 그대로
    assert handle(Ev("down", space)) is True and handle(Ev("up", space)) is True
    assert app.state == "idle" and masks == []
    # Ctrl+Shift+Space를 누른 채 말하기
    held["mods"] = frozenset({"ctrl", "shift"})
    assert handle(Ev("down", space)) is False
    assert app.state == "recording" and masks == [1]
    app._pressed_at -= 1.0
    assert handle(Ev("up", space)) is False
    wait_idle(app)
    assert app.pasted


def test_bad_hotkey_falls_back_and_keeps_win_h_and_esc(app, monkeypatch):
    """설정에 잘못된 단축키(오타·예전 버전의 오른쪽 Ctrl 등)가 있어도 나머지 단축키·Win+H·Esc는 살아 있어야 합니다."""
    kb = FakeKeyboard()

    def key_to_scan_codes(key):
        if key == "spcae":
            raise ValueError("not mapped")
        return (sum(map(ord, key)),)

    kb.key_to_scan_codes = key_to_scan_codes
    monkeypatch.setitem(sys.modules, "keyboard", kb)
    app.cfg.update({"win_h": True, "hotkey_dictate": "ctrl+shift+spcae", "hotkey_edit": "right ctrl+e"})
    app.register_hotkeys()
    combos = registered(app)
    assert "ctrl+shift+space" in combos  # 기본값으로 대신 걸림
    assert "ctrl+alt+e" in combos
    assert "windows+h" in combos and "ctrl+alt+space" in combos
    assert len(kb.hooks) == 1 and "esc" in kb.press_keys
    assert any(name == "show_error" and "기본값" in args[0] for name, args in app.overlay.calls)
