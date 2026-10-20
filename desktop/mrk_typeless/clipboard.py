"""클립보드와 붙여넣기: 정리된 글을 지금 쓰던 창에 넣고, 원래 클립보드는 되돌립니다."""

import time

import keyboard
import pyperclip

_MODIFIERS = ("ctrl", "shift", "alt", "windows")


def wait_modifiers_released(timeout: float = 2.0) -> None:
    """단축키를 아직 누르고 있으면 Ctrl+C/V가 다른 조합이 되므로 손을 뗄 때까지 기다립니다."""
    end = time.monotonic() + timeout
    while time.monotonic() < end and any(keyboard.is_pressed(k) for k in _MODIFIERS):
        time.sleep(0.03)
    time.sleep(0.05)


def get_text() -> str:
    try:
        return pyperclip.paste() or ""
    except pyperclip.PyperclipException:
        return ""


def set_text(text: str) -> None:
    pyperclip.copy(text)


def copy_selection() -> tuple[str, str]:
    """지금 창에서 선택한 글과, 그 전의 클립보드 내용을 돌려줍니다. 선택한 글이 없으면 빈 문자열."""
    wait_modifiers_released()
    previous = get_text()
    set_text("")
    keyboard.send("ctrl+c")
    end = time.monotonic() + 0.8
    text = ""
    while time.monotonic() < end:
        time.sleep(0.05)
        text = get_text()
        if text:
            break
    if not text:
        set_text(previous)
    return text, previous


def paste_text(text: str, restore: bool = True, previous: str | None = None) -> None:
    """글을 클립보드에 넣고 Ctrl+V로 붙여넣습니다. restore면 잠시 뒤 원래 클립보드로 되돌립니다."""
    wait_modifiers_released()
    if restore and previous is None:
        previous = get_text()
    set_text(text)
    time.sleep(0.05)
    keyboard.send("ctrl+v")
    if restore and previous is not None:
        time.sleep(0.6)
        set_text(previous)
