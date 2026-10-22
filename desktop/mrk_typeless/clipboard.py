"""클립보드와 붙여넣기: 정리된 글을 지금 쓰던 창에 넣고, 원래 클립보드는 되돌립니다.

원래 내용이 글이 아니라 스크린샷·파일·표였어도 잃지 않도록, Windows에서는 모든 형식을 통째로 떠 두었다가 되돌립니다.
"""

import logging
import sys
import time

import keyboard
import pyperclip

log = logging.getLogger("mrk_typeless")

_MODIFIERS = ("ctrl", "shift", "alt", "windows")
# 붙여넣기를 보낸 뒤 상대 프로그램이 클립보드를 읽을 시간. 원격 데스크톱·무거운 프로그램은 느립니다.
RESTORE_DELAY = 1.2


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


# ---------- 클립보드 통째로 떠 두기 (Windows) ----------
# GDI 핸들을 쓰는 형식(비트맵·팔레트·메타파일)과 프로그램이 나중에 채우는 형식은 복사할 수 없어 건너뜁니다.
_SKIP_FORMATS = {2, 3, 9, 14, 0x80, 0x81, 0x82, 0x83, 0x8E}


class Snapshot:
    """클립보드의 모든 형식과 내용. text는 글 형식이 있을 때만 채워집니다."""

    def __init__(self, items: list, text: str) -> None:
        self.items = items  # [(format_id, bytes)]
        self.text = text

    @property
    def empty(self) -> bool:
        return not self.items and not self.text


def _snapshot_windows() -> Snapshot | None:
    import ctypes
    from ctypes import wintypes

    u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32
    u32.GetClipboardData.restype = wintypes.HANDLE
    k32.GlobalLock.restype = ctypes.c_void_p
    k32.GlobalSize.restype = ctypes.c_size_t
    for _ in range(5):
        if u32.OpenClipboard(None):
            break
        time.sleep(0.02)
    else:
        return None
    items = []
    try:
        fmt = 0
        while True:
            fmt = u32.EnumClipboardFormats(fmt)
            if not fmt:
                break
            if fmt in _SKIP_FORMATS:
                continue
            handle = u32.GetClipboardData(fmt)
            if not handle:
                continue
            ptr = k32.GlobalLock(handle)
            if not ptr:
                continue
            try:
                size = k32.GlobalSize(handle)
                items.append((fmt, ctypes.string_at(ptr, size)))
            finally:
                k32.GlobalUnlock(handle)
    finally:
        u32.CloseClipboard()
    text = next((data.decode("utf-16-le", "ignore").split("\0", 1)[0] for f, data in items if f == 13), "")
    return Snapshot(items, text)


def _restore_windows(snap: Snapshot) -> bool:
    import ctypes

    u32, k32 = ctypes.windll.user32, ctypes.windll.kernel32
    k32.GlobalAlloc.restype = ctypes.c_void_p
    k32.GlobalLock.restype = ctypes.c_void_p
    GMEM_MOVEABLE = 0x0002
    for _ in range(5):
        if u32.OpenClipboard(None):
            break
        time.sleep(0.02)
    else:
        return False
    try:
        u32.EmptyClipboard()
        for fmt, data in snap.items:
            handle = k32.GlobalAlloc(GMEM_MOVEABLE, len(data) or 1)
            if not handle:
                continue
            ptr = k32.GlobalLock(handle)
            ctypes.memmove(ptr, data, len(data))
            k32.GlobalUnlock(handle)
            if not u32.SetClipboardData(fmt, ctypes.c_void_p(handle)):
                k32.GlobalFree(ctypes.c_void_p(handle))
    finally:
        u32.CloseClipboard()
    return True


def snapshot() -> Snapshot:
    """지금 클립보드 내용. Windows가 아니거나 실패하면 글만 떠 둡니다."""
    if sys.platform == "win32":
        try:
            snap = _snapshot_windows()
            if snap is not None:
                return snap
        except Exception:  # noqa: BLE001 - 떠 두기에 실패해도 받아쓰기는 계속되어야 합니다
            log.exception("클립보드 떠 두기 실패")
    return Snapshot([], get_text())


def restore(snap: Snapshot) -> None:
    """떠 둔 내용을 되돌립니다. 통째로 되돌리지 못하면 글만이라도 되돌립니다."""
    if snap.items and sys.platform == "win32":
        try:
            if _restore_windows(snap):
                return
        except Exception:  # noqa: BLE001
            log.exception("클립보드 되돌리기 실패")
    if snap.text:
        set_text(snap.text)


def copy_selection() -> tuple[str, Snapshot]:
    """지금 창에서 선택한 글과, 그 전의 클립보드 내용을 돌려줍니다. 선택한 글이 없으면 빈 문자열."""
    wait_modifiers_released()
    previous = snapshot()
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
        restore(previous)
    return text, previous


def paste_text(text: str, restore_previous: bool = True, previous: Snapshot | None = None) -> None:
    """글을 클립보드에 넣고 Ctrl+V로 붙여넣습니다. restore_previous면 잠시 뒤 원래 클립보드로 되돌립니다."""
    wait_modifiers_released()
    if restore_previous and previous is None:
        previous = snapshot()
    set_text(text)
    time.sleep(0.05)
    keyboard.send("ctrl+v")
    if restore_previous and previous is not None and not previous.empty:
        time.sleep(RESTORE_DELAY)
        restore(previous)
