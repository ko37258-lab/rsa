"""Windows를 켤 때 자동 실행 (현재 사용자 레지스트리 Run 키)."""

import sys

RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
VALUE_NAME = "MRK-Typeless"


def available() -> bool:
    """exe로 묶여 실행 중일 때만 등록할 수 있습니다."""
    return sys.platform == "win32" and bool(getattr(sys, "frozen", False))


def is_enabled() -> bool:
    if not available():
        return False
    import winreg

    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            winreg.QueryValueEx(key, VALUE_NAME)
            return True
    except OSError:
        return False


def set_enabled(enabled: bool) -> None:
    if not available():
        return
    import winreg

    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, RUN_KEY, 0, winreg.KEY_SET_VALUE) as key:
        if enabled:
            winreg.SetValueEx(key, VALUE_NAME, 0, winreg.REG_SZ, f'"{sys.executable}"')
        else:
            try:
                winreg.DeleteValue(key, VALUE_NAME)
            except OSError:
                pass
