"""단축키가 한/영·한자 키를 건드리지 않는지 (2026-10-23 제보: 설치 뒤 한/영 키가 안 됨)."""

import sys

import pytest

from mrk_typeless.hotkeys import HotkeyError, HotkeyRouter, parse_combo, same_combo

HANGUL = 0x38  # 한/영 키 = 오른쪽 Alt 자리 (스캔 코드가 Alt와 같음)
HANJA = 0x1D  # 한자 키 = 오른쪽 Ctrl 자리
MODIFIER_CODES = (0x1D, 0x2A, 0x36, 0x38, 0x5B, 0x5C)  # Ctrl·Shift·Shift·Alt·Win·Win
CODES = {"space": (57,), "e": (18,), "h": (35,), "1": (2, 79), "f9": (67,)}


class Ev:
    def __init__(self, t, code):
        self.event_type, self.scan_code = t, code


def make_router(clock=None):
    state = {"mods": frozenset(), "masks": 0, "log": []}
    r = HotkeyRouter(
        held=lambda: state["mods"],
        mask=lambda: state.__setitem__("masks", state["masks"] + 1),
        codes_of=lambda k: CODES[k],
        clock=clock or (lambda: 0.0),
    )
    r.add("ctrl+shift+space", lambda: state["log"].append("dictate"), lambda: state["log"].append("dictate-up"))
    r.add("ctrl+alt+space", lambda: state["log"].append("polish"))
    r.add("ctrl+alt+e", lambda: state["log"].append("edit"), lambda: state["log"].append("edit-up"))
    r.add("windows+h", lambda: state["log"].append("winh"), lambda: state["log"].append("winh-up"))
    r.add("ctrl+alt+1", lambda: state["log"].append("mode1"))
    return r, state


@pytest.mark.parametrize("mods", [frozenset(), frozenset({"ctrl"}), frozenset({"ctrl", "alt"}), frozenset({"windows"})])
def test_hangul_hanja_and_modifier_keys_always_pass(mods):
    r, state = make_router()
    state["mods"] = mods
    for code in (HANGUL, HANJA, *MODIFIER_CODES):
        assert r.handle(Ev("down", code)) is True
        assert r.handle(Ev("up", code)) is True
    assert state["log"] == [] and state["masks"] == 0


def test_hold_to_talk_blocks_only_the_last_key():
    r, state = make_router()
    state["mods"] = frozenset({"ctrl", "shift"})
    assert r.handle(Ev("down", 57)) is False
    assert r.handle(Ev("down", 57)) is False  # 누르고 있는 동안의 반복
    assert r.handle(Ev("down", 57)) is False
    state["mods"] = frozenset()  # 보조키를 먼저 떼도
    assert r.handle(Ev("up", 57)) is False
    assert state["log"] == ["dictate", "dictate-up"] and state["masks"] == 1


def test_plain_typing_is_untouched():
    r, state = make_router()
    for code in (57, 18, 35, 2, 79):
        assert r.handle(Ev("down", code)) is True and r.handle(Ev("up", code)) is True
    state["mods"] = frozenset({"shift"})  # Shift+Space (한/영 전환으로 쓰는 분도 있음)
    assert r.handle(Ev("down", 57)) is True and r.handle(Ev("up", 57)) is True
    assert state["log"] == []


def test_same_key_different_modifiers():
    r, state = make_router()
    state["mods"] = frozenset({"ctrl", "alt"})
    assert r.handle(Ev("down", 57)) is False and r.handle(Ev("up", 57)) is False
    state["mods"] = frozenset({"ctrl", "alt", "shift"})  # 정확히 맞지 않으면 아무것도 안 함
    assert r.handle(Ev("down", 57)) is True and r.handle(Ev("up", 57)) is True
    state["mods"] = frozenset({"ctrl", "alt"})
    assert r.handle(Ev("down", 2)) is False and r.handle(Ev("up", 2)) is False
    assert state["log"] == ["polish", "mode1"]


@pytest.mark.parametrize("code", [0x4F, 0x50, 0x51, 0x4B, 0x4D, 0x47])  # End·↓·PgDn·←·→·Home (숫자 패드와 같은 번호)
def test_ctrl_alt_navigation_keys_are_not_mode_hotkeys(code):
    """VS Code의 Ctrl+Alt+↓, 원격 데스크톱의 Ctrl+Alt+End를 막거나 글 형식을 바꾸면 안 됩니다."""
    r, state = make_router()
    state["mods"] = frozenset({"ctrl", "alt"})
    assert r.handle(Ev("down", code)) is True and r.handle(Ev("up", code)) is True
    assert state["log"] == []


def test_key_passed_through_stays_passed_through_until_released():
    """Space를 먼저 누르고 Shift를 늦게 눌러도, 그대로 보낸 Space의 반복·뗌은 막지 않습니다 (Windows가 Space를 눌린 채로 알지 않게)."""
    r, state = make_router()
    state["mods"] = frozenset({"ctrl"})
    assert r.handle(Ev("down", 57)) is True  # Ctrl+Space — 단축키 아님, 그대로 보냄
    state["mods"] = frozenset({"ctrl", "shift"})
    assert r.handle(Ev("down", 57)) is True  # 반복 신호: 단축키로 바꾸지 않음
    assert r.handle(Ev("up", 57)) is True  # 뗌도 그대로
    assert state["log"] == []
    assert r.handle(Ev("down", 57)) is False and state["log"] == ["dictate"]  # 다시 누르면 단축키


def test_win_h_masks_start_menu():
    r, state = make_router()
    state["mods"] = frozenset({"windows"})
    assert r.handle(Ev("down", 35)) is False and r.handle(Ev("up", 35)) is False
    assert state["log"] == ["winh", "winh-up"] and state["masks"] == 1


def test_no_modifier_hotkey_needs_no_mask():
    state = {"masks": 0}
    r = HotkeyRouter(held=lambda: frozenset(), mask=lambda: state.__setitem__("masks", 1), codes_of=lambda k: CODES[k])
    hits = []
    r.add("f9", lambda: hits.append(1))
    assert r.handle(Ev("down", 67)) is False
    assert hits == [1] and state["masks"] == 0


def test_lost_key_up_does_not_eat_typing():
    now = {"t": 0.0}
    r, state = make_router(clock=lambda: now["t"])
    state["mods"] = frozenset({"ctrl", "shift"})
    assert r.handle(Ev("down", 57)) is False  # 뗌 신호를 놓쳤다고 칩니다
    state["mods"] = frozenset()
    now["t"] = 5.0
    assert r.handle(Ev("down", 57)) is True  # 한참 뒤 그냥 Space는 글자로 들어가야 합니다


def test_parse_combo():
    assert parse_combo("Ctrl+Shift+Space") == parse_combo("shift + ctrl + space")
    assert parse_combo("win+h") == parse_combo("windows+h") == parse_combo("h+windows")
    assert str(parse_combo("shift+ctrl+space")) == "ctrl+shift+space"
    assert parse_combo("f9").mods == frozenset()
    assert same_combo("win+h", "windows+h") and not same_combo("ctrl+alt+e", "ctrl+e")
    for bad in ("", "ctrl+shift", "ctrl+a+b", "ctrl+k, ctrl+s", "ctrl+hangul", "right alt+space", "ctrl+한/영", "alt gr+e", "ctrl+ctrl+a", "ctrl++a"):
        with pytest.raises(HotkeyError):
            parse_combo(bad)
    # 한/영·한자 전환에 쓰일 수 있는 조합과, 글자를 못 치게 만드는 단독 키
    for bad in ("space", "shift+space", "ctrl+space", "e", "1", "enter"):
        with pytest.raises(HotkeyError):
            parse_combo(bad)
    assert parse_combo("ctrl+shift+space").key == "space" and parse_combo("alt+space").mods == frozenset({"alt"})


def test_hangul_jamo_typed_in_settings_means_the_same_key():
    """설정 칸이 한글 입력 상태여도 'ctrl+alt+ㄱ'은 Ctrl+Alt+R로 읽습니다."""
    assert parse_combo("ctrl+alt+ㄱ") == parse_combo("ctrl+alt+r")
    assert parse_combo("ctrl+alt+ㄷ") == parse_combo("ctrl+alt+e")
    assert parse_combo("win+ㅗ") == parse_combo("windows+h")
    assert parse_combo("ctrl+shift+스페이스") == parse_combo("ctrl+shift+space")


def test_unknown_key_name_is_a_hotkey_error():
    def codes_of(key):
        if key == "spcae":
            raise ValueError("Key 'spcae' is not mapped to any known key.")
        return CODES[key]

    r = HotkeyRouter(held=frozenset, mask=lambda: None, codes_of=codes_of)
    with pytest.raises(HotkeyError):
        r.add("ctrl+shift+spcae", lambda: None)


@pytest.mark.skipif(sys.platform != "win32", reason="keyboard 라이브러리의 Windows 키 표가 필요합니다 (CI windows-latest에서 돎)")
def test_real_keyboard_library_old_way_breaks_hangul_new_way_does_not(monkeypatch):
    """진짜 keyboard 라이브러리로 원인과 해결을 함께 확인합니다.
    예전 방식(add_hotkey suppress=True)은 한/영 키(스캔 코드 0x38)를 삼켰다가 Alt로 다시 보냅니다."""
    import keyboard
    from keyboard import KeyboardEvent

    sent = []
    monkeypatch.setattr(keyboard._os_keyboard, "press", lambda code: sent.append(("press", code)))
    monkeypatch.setattr(keyboard._os_keyboard, "release", lambda code: sent.append(("release", code)))
    # 진짜 Windows 훅은 걸지 않고, 라이브러리의 판단 부분(direct_callback)만 새 리스너로 돌립니다
    monkeypatch.setattr(keyboard._os_keyboard, "init", lambda: None)
    listener = keyboard._KeyboardListener()
    listener.init()
    listener.listening = True
    monkeypatch.setattr(keyboard, "_listener", listener)

    keyboard.unhook_all()
    keyboard.add_hotkey("ctrl+alt+space", lambda: None, suppress=True)
    assert listener.direct_callback(KeyboardEvent("down", HANGUL, name="right alt")) is False  # 삼킴
    listener.direct_callback(KeyboardEvent("up", HANGUL, name="right alt"))
    assert ("press", HANGUL) in sent  # 손을 떼면 그냥 Alt로 다시 보냄 → 한/영 전환이 안 됨

    keyboard.unhook_all()
    listener.modifier_states.clear()
    sent.clear()
    router = HotkeyRouter(held=lambda: frozenset(), mask=lambda: None)
    router.add("ctrl+alt+space", lambda: None)
    keyboard.hook(router.handle, suppress=True)
    assert listener.direct_callback(KeyboardEvent("down", HANGUL, name="right alt")) is True
    assert listener.direct_callback(KeyboardEvent("up", HANGUL, name="right alt")) is True
    assert sent == []
    keyboard.unhook_all()
