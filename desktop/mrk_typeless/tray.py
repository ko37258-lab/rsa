"""작업 표시줄 알림 영역(트레이) 아이콘과 메뉴."""

import pystray
from PIL import Image, ImageDraw

from .modes import MODES

STATE_COLORS = {"idle": (36, 67, 214), "recording": (211, 58, 64), "working": (190, 130, 0)}


def make_icon(state: str = "idle", size: int = 64) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 64
    d.rounded_rectangle((2 * s, 2 * s, 62 * s, 62 * s), radius=16 * s, fill=STATE_COLORS.get(state, STATE_COLORS["idle"]))
    white = (255, 255, 255, 255)
    d.rounded_rectangle((25 * s, 12 * s, 39 * s, 38 * s), radius=7 * s, fill=white)  # 마이크 몸통
    d.arc((17 * s, 20 * s, 47 * s, 46 * s), start=20, end=160, fill=white, width=max(2, int(3 * s)))
    d.line((32 * s, 46 * s, 32 * s, 52 * s), fill=white, width=max(2, int(3 * s)))
    d.line((24 * s, 53 * s, 40 * s, 53 * s), fill=white, width=max(2, int(3 * s)))
    return img


class Tray:
    def __init__(self, app) -> None:
        self.app = app
        self.icon = pystray.Icon("mrk-typeless", make_icon("idle"), "MR.K Typeless", menu=self._menu())

    def _mode_item(self, mode: dict) -> pystray.MenuItem:
        def choose(_icon, _item):
            self.app.post(self.app.set_mode, mode["id"])

        def is_current(_item):
            return self.app.cfg.get("mode") == mode["id"]

        return pystray.MenuItem(mode["label"], choose, checked=is_current, radio=True)

    def _action(self, fn):
        def run(_icon, _item):
            self.app.post(fn)

        return run

    def _menu(self) -> pystray.Menu:
        app = self.app
        return pystray.Menu(
            pystray.MenuItem(lambda _item: f"MR.K Typeless · {app.status_text}", None, enabled=False),
            pystray.Menu.SEPARATOR,
            # 아이콘을 왼쪽 클릭하면 사용 방법이 열립니다.
            pystray.MenuItem("사용 방법", self._action(app.open_help), default=True),
            pystray.MenuItem("설정…", self._action(app.open_settings)),
            pystray.MenuItem("글 형식", pystray.Menu(*(self._mode_item(m) for m in MODES))),
            pystray.MenuItem("사전 고치기 (메모장)", self._action(app.open_dictionary)),
            pystray.MenuItem("기록 폴더 열기", self._action(app.open_folder)),
            pystray.MenuItem("기록 지우기…", self._action(app.clear_history)),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(
                lambda _item: f"새 버전 {app.newer_version} 받기…",
                self._action(app.open_download),
                visible=lambda _item: bool(app.newer_version),
            ),
            pystray.MenuItem("종료", self._action(app.quit)),
        )

    def set_state(self, state: str, title: str) -> None:
        self.icon.icon = make_icon(state)
        self.icon.title = f"MR.K Typeless · {title}"
        try:
            self.icon.update_menu()
        except Exception:
            pass

    def start(self) -> None:
        self.icon.run_detached()

    def stop(self) -> None:
        try:
            self.icon.stop()
        except Exception:
            pass
