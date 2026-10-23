"""전역 단축키 — 한/영·한자 키를 절대 건드리지 않는 방식.

예전에는 keyboard.add_hotkey(..., suppress=True)를 썼습니다. 이 방식은 단축키에 든 보조키
(Ctrl·Alt·Shift·Win)를 혼자 누르면 일단 삼켰다가, 손을 뗄 때 가짜 신호로 다시 보냅니다.
그런데 keyboard 라이브러리는 키를 스캔 코드 하나로만 구분합니다. 노트북의 한/영 키는 오른쪽 Alt와 같은
스캔 코드(0x38)를, 한자 키는 오른쪽 Ctrl과 같은 0x1D를 씁니다. 그래서 Ctrl+Alt+Space를 걸어 두면
한/영 키가 '왼쪽 Alt'로 바뀌어 다시 보내졌고, 한글 입력기는 한/영 신호를 끝내 받지 못했습니다
(2026-10-23 사용자 제보: 설치 뒤 한/영 키가 안 됨).

여기서는 이렇게 합니다.
- 보조키는 막지도, 다시 보내지도 않습니다. 눌려 있는지는 Windows에 직접 묻습니다(GetAsyncKeyState).
- 보조키가 정확히 맞을 때만 단축키의 마지막 키(Space·E·H·숫자)를 막고 동작을 실행합니다.
- 마지막 키를 막으면 Windows가 'Win(또는 Alt·Ctrl+Shift)만 눌렀다 뗐다'고 보고 시작 메뉴·메뉴 막대·
  입력 언어 바꾸기를 할 수 있으므로, 아무 일도 하지 않는 키(vk 0xE8) 신호를 하나 끼워 넣습니다
  (AutoHotkey의 MenuMaskKey와 같은 방법).
- 한/영·한자 키와 오른쪽 Alt·Ctrl은 단축키로 쓸 수 없게 막습니다.
"""

from __future__ import annotations

import sys
import time
from collections.abc import Callable
from dataclasses import dataclass, field

MODIFIERS = ("ctrl", "shift", "alt", "windows")

_ALIASES = {
    "control": "ctrl",
    "ctl": "ctrl",
    "left ctrl": "ctrl",
    "left control": "ctrl",
    "win": "windows",
    "left windows": "windows",
    "right windows": "windows",
    "left win": "windows",
    "cmd": "windows",
    "command": "windows",
    "super": "windows",
    "meta": "windows",
    "left alt": "alt",
    "option": "alt",
    "left shift": "shift",
    "right shift": "shift",
    "spacebar": "space",
    "escape": "esc",
    "return": "enter",
}

# 한글 입력기가 쓰는 키 — 단축키로 쓰면 한/영 전환이 망가집니다.
_IME_WORDS = ("hangul", "hanguel", "hanja", "kana", "kanji", "ime", "한/영", "한영", "한자", "right alt", "alt gr", "altgr", "right ctrl", "right control")

# 한 번 누른 단축키 키가 이 시간 넘게 아무 신호 없이 있다가 다시 눌리면, 놓친 '뗌' 신호가 있었던 것으로 보고 새로 셉니다.
# (누르고 있으면 키 반복 신호가 1초 안에 계속 들어옵니다.)
STALE_SECONDS = 1.5


class HotkeyError(ValueError):
    """쓸 수 없는 단축키"""


@dataclass(frozen=True)
class Combo:
    mods: frozenset[str]
    key: str

    def __str__(self) -> str:
        return "+".join([m for m in MODIFIERS if m in self.mods] + [self.key])


def parse_combo(text: str) -> Combo:
    """'ctrl+shift+space' 같은 글을 보조키 묶음과 마지막 키 하나로 나눕니다."""
    raw = (text or "").strip().lower()
    if not raw:
        raise HotkeyError("단축키가 비어 있습니다.")
    if "," in raw:
        raise HotkeyError("여러 단계로 누르는 단축키는 쓸 수 없습니다. 예: ctrl+shift+space")
    parts = [p.strip() for p in raw.split("+")]
    if any(not p for p in parts):
        raise HotkeyError(f"'{text}'를 읽지 못했습니다. 예: ctrl+shift+space")
    names = [_ALIASES.get(p, p) for p in parts]
    for n in names:
        if any(w in n for w in _IME_WORDS):
            raise HotkeyError("한/영·한자 키와 오른쪽 Alt·Ctrl은 한글 입력에 쓰이므로 단축키로 쓸 수 없습니다.")
    mods = [n for n in names if n in MODIFIERS]
    keys = [n for n in names if n not in MODIFIERS]
    if len(keys) != 1:
        raise HotkeyError(f"'{text}'에는 보조키(Ctrl·Shift·Alt·Win) 말고 키가 하나 있어야 합니다. 예: ctrl+shift+space")
    if len(set(mods)) != len(mods):
        raise HotkeyError(f"'{text}'에 같은 보조키가 두 번 들어 있습니다.")
    return Combo(frozenset(mods), keys[0])


def same_combo(a: str, b: str) -> bool:
    try:
        return parse_combo(a) == parse_combo(b)
    except HotkeyError:
        return a.strip().lower() == b.strip().lower()


# ---------- Windows에 묻고 보내기 (테스트에서는 바꿔 끼웁니다) ----------
_VK = {"ctrl": (0x11,), "shift": (0x10,), "alt": (0x12,), "windows": (0x5B, 0x5C)}
_MASK_VK = 0xE8  # 아무 일도 하지 않는 키 (Windows에 배정되지 않음)


def _user32():
    import ctypes

    return ctypes.windll.user32


def held_modifiers() -> frozenset[str]:
    """지금 실제로 눌려 있는 보조키. 한/영(VK_HANGUL)·한자(VK_HANJA)는 보조키로 치지 않습니다."""
    if sys.platform != "win32":
        return frozenset()
    user32 = _user32()
    return frozenset(name for name, vks in _VK.items() if any(user32.GetAsyncKeyState(vk) & 0x8000 for vk in vks))


def send_mask_key() -> None:
    """아무 일도 하지 않는 키를 한 번 눌렀다 뗍니다. 시작 메뉴·메뉴 막대·입력 언어 바꾸기가 끼어들지 않게 합니다."""
    if sys.platform != "win32":
        return
    user32 = _user32()
    user32.keybd_event(_MASK_VK, 0, 0, 0)
    user32.keybd_event(_MASK_VK, 0, 2, 0)  # KEYEVENTF_KEYUP


def scan_codes_of(key: str) -> tuple[int, ...]:
    import keyboard

    return tuple(keyboard.key_to_scan_codes(key))


# 떼야 하는데 Windows가 아직 눌린 것으로 아는 보조키를 풉니다. (vk, 스캔 코드, 확장 키)
_STUCK_CHECK = (
    (0xA4, 0x38, False),  # 왼쪽 Alt
    (0xA5, 0x38, True),  # 오른쪽 Alt
    (0xA2, 0x1D, False),  # 왼쪽 Ctrl
    (0xA3, 0x1D, True),  # 오른쪽 Ctrl
    (0xA0, 0x2A, False),  # 왼쪽 Shift
    (0xA1, 0x36, False),  # 오른쪽 Shift
    (0x5B, 0x5B, True),  # 왼쪽 Win
    (0x5C, 0x5C, True),  # 오른쪽 Win
)


def release_stuck_modifiers() -> list[int]:
    """Windows가 눌린 채로 알고 있는 보조키에 '뗌' 신호를 보냅니다. 예전 버전이 남긴 Alt 눌림 같은 것을 풉니다.
    실제로 눌려 있지 않은 키에는 아무것도 보내지 않습니다. 푼 키의 vk 목록을 돌려줍니다."""
    if sys.platform != "win32":
        return []
    user32 = _user32()
    released = []
    for vk, scan, extended in _STUCK_CHECK:
        if user32.GetAsyncKeyState(vk) & 0x8000:
            user32.keybd_event(vk, scan, 2 | (1 if extended else 0), 0)  # KEYUP | EXTENDEDKEY
            released.append(vk)
    return released


# ---------- 단축키 묶음 ----------
@dataclass
class Binding:
    combo: Combo
    on_press: Callable[[], None]
    on_release: Callable[[], None] | None
    scan_codes: tuple[int, ...]
    active: bool = False
    last_seen: float = 0.0


@dataclass
class HotkeyRouter:
    """keyboard.hook(router.handle, suppress=True)로 겁니다. 모든 키마다 불리므로 가볍게 끝나야 합니다."""

    bindings: list[Binding] = field(default_factory=list)
    held: Callable[[], frozenset[str]] | None = None
    mask: Callable[[], None] | None = None
    codes_of: Callable[[str], tuple[int, ...]] | None = None
    clock: Callable[[], float] = time.monotonic

    def add(self, combo_text: str, on_press: Callable[[], None], on_release: Callable[[], None] | None = None) -> Combo:
        combo = parse_combo(combo_text)
        codes = tuple((self.codes_of or scan_codes_of)(combo.key))
        if not codes:
            raise HotkeyError(f"'{combo.key}' 키를 찾지 못했습니다.")
        self.bindings.append(Binding(combo, on_press, on_release, codes))
        return combo

    def handle(self, event) -> bool:
        """True면 키를 그대로 보내고, False면 막습니다. 보조키·한/영·한자 키는 언제나 True입니다."""
        code = event.scan_code
        down = event.event_type == "down"
        now = self.clock()
        for b in self.bindings:
            if code not in b.scan_codes:
                continue
            if b.active:
                if down and now - b.last_seen > STALE_SECONDS:
                    b.active = False  # 놓친 '뗌'이 있었음 — 새로 누른 것으로 봅니다
                else:
                    b.last_seen = now
                    if not down:
                        b.active = False
                        if b.on_release:
                            b.on_release()
                    return False  # 누르고 있는 동안의 반복 신호와 뗌도 막습니다
            if down and (self.held or held_modifiers)() == b.combo.mods:
                b.active, b.last_seen = True, now
                if b.combo.mods:
                    (self.mask or send_mask_key)()
                b.on_press()
                return False
        return True
