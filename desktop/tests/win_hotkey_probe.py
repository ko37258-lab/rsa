"""Windows 전용 점검 (CI): 실제 키보드 훅에 Win+H와 Ctrl+Shift+Space를 눌러 넣고 MR.K가 받는지 봅니다.

pytest가 아니라 desktop 폴더에서 `python -m tests.win_hotkey_probe`로 실행합니다.
"""

import sys
import time

import keyboard

from mrk_typeless import app as app_module
from mrk_typeless.config import DEFAULTS


def main() -> int:
    a = object.__new__(app_module.App)
    a.cfg = dict(DEFAULTS)
    hits: list = []
    a._on_record_hotkey = lambda purpose, trigger=None: hits.append(("press", purpose, trigger))
    a._on_record_key_up = lambda purpose, trigger=None: hits.append(("release", purpose, trigger))
    a._on_polish_hotkey = lambda: hits.append(("polish",))
    a._on_escape = lambda: None
    a.register_hotkeys()
    time.sleep(0.5)

    keyboard.press("left windows")
    keyboard.send("h")
    keyboard.release("left windows")
    time.sleep(0.8)
    keyboard.send("ctrl+shift+space")
    time.sleep(0.8)
    keyboard.unhook_all()

    print("hits:", hits)
    win_h = ("press", "dictate", "winh") in hits
    ctrl = ("press", "dictate", "dictate") in hits
    print("Win+H →", "MR.K 받아쓰기" if win_h else "잡지 못함")
    print("Ctrl+Shift+Space →", "MR.K 받아쓰기" if ctrl else "잡지 못함")
    return 0 if win_h and ctrl else 1


if __name__ == "__main__":
    sys.exit(main())
