"""화면: 녹음·정리 상태를 보여 주는 작은 알약 창, 설정 창, 사용법 창."""

import sys
import tkinter as tk
import tkinter.font as tkfont
import webbrowser
from tkinter import messagebox, ttk

from .config import CLAUDE_KEY_URL, MODELS, SPEECH_LANGS, STT_PROVIDERS, TARGET_LANGS
from .modes import MODES

FONT = "Malgun Gothic"
PILL_BG = "#111622"
PILL_FG = "#f2f4f7"
PILL_MUTED = "#98a2b5"
COLORS = {"recording": "#ff5a5f", "working": "#f0b443", "done": "#4cc38a", "error": "#ff6f72", "info": "#8fa3ff"}
TRANSPARENT = "#ff00fe"


def _rounded_rect(canvas: tk.Canvas, x1, y1, x2, y2, r, **kw):
    points = [
        x1 + r, y1, x2 - r, y1, x2, y1, x2, y1 + r, x2, y2 - r, x2, y2,
        x2 - r, y2, x1 + r, y2, x1, y2, x1, y2 - r, x1, y1 + r, x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, **kw)


class Overlay:
    """화면 아래쪽 가운데에 뜨는 작은 상태 표시. 포커스를 빼앗지 않아서 글이 들어갈 창이 바뀌지 않습니다."""

    MIN_W, MAX_W, H, H2 = 260, 620, 48, 70

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.win = tk.Toplevel(root)
        self.win.withdraw()
        self.win.overrideredirect(True)
        self.win.attributes("-topmost", True)
        self.win.configure(bg=TRANSPARENT)
        try:
            self.win.attributes("-transparentcolor", TRANSPARENT)
        except tk.TclError:
            pass
        self.canvas = tk.Canvas(self.win, bg=TRANSPARENT, highlightthickness=0, bd=0)
        self.canvas.pack(fill="both", expand=True)
        self.font = tkfont.Font(family=FONT, size=11, weight="bold")
        self.small = tkfont.Font(family=FONT, size=9)
        self._visible = False
        self._hide_job = None
        self._tick_job = None
        self._make_noactivate()

    def _make_noactivate(self) -> None:
        if sys.platform != "win32":
            return
        import ctypes

        self.win.update_idletasks()
        user32 = ctypes.windll.user32
        hwnd = user32.GetParent(self.win.winfo_id()) or self.win.winfo_id()
        GWL_EXSTYLE = -20
        style = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        # WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TOPMOST: 눌러도 앞으로 나오지 않고 작업 표시줄에도 안 보임
        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, style | 0x08000000 | 0x00000080 | 0x00000008)

    def _show(self, width: int, height: int) -> None:
        sw, sh = self.win.winfo_screenwidth(), self.win.winfo_screenheight()
        x, y = (sw - width) // 2, sh - height - 96
        self.win.geometry(f"{width}x{height}+{x}+{y}")
        self.canvas.configure(width=width, height=height)
        if not self._visible:
            # overrideredirect 창은 보여 줄 때 포커스를 가져가지 않습니다.
            self.win.deiconify()
            self._visible = True

    def _cancel_jobs(self) -> None:
        for job in (self._hide_job, self._tick_job):
            if job:
                self.root.after_cancel(job)
        self._hide_job = self._tick_job = None

    def _draw(self, color: str, title: str, sub: str = "", bars: list[float] | None = None) -> None:
        text_w = max(self.font.measure(title), self.small.measure(sub) if sub else 0)
        extra = 16 * 6 if bars is not None else 0
        width = max(self.MIN_W, min(self.MAX_W, text_w + 64 + extra))
        two_lines = self.font.measure(title) > width - 64 - extra
        height = self.H2 if (sub or two_lines) else self.H
        c = self.canvas
        c.delete("all")
        _rounded_rect(c, 1, 1, width - 1, height - 1, 22, fill=PILL_BG, outline="")
        cy = height // 2
        c.create_oval(18, cy - 6, 30, cy + 6, fill=color, outline="")
        text_x = 42
        if sub:
            c.create_text(text_x, cy - 10, text=title, anchor="w", fill=PILL_FG, font=self.font, width=width - text_x - 18 - extra)
            c.create_text(text_x, cy + 12, text=sub, anchor="w", fill=PILL_MUTED, font=self.small, width=width - text_x - 18 - extra)
        else:
            c.create_text(text_x, cy, text=title, anchor="w", fill=PILL_FG, font=self.font, width=width - text_x - 18 - extra)
        if bars is not None:
            bx = width - 18 - 6 * 12
            for i, level in enumerate(bars):
                h = 4 + level * 22
                c.create_rectangle(bx + i * 12, cy - h / 2, bx + i * 12 + 6, cy + h / 2, fill=color, outline="")
        self._show(width, height)

    # ---- 상태별 표시 ----
    def show_recording(self, title: str, hint: str, probe) -> None:
        """probe() → (소리 크기 0~1, 말한 초)"""
        self._cancel_jobs()
        history = [0.0] * 6

        def tick():
            level, seconds = probe()
            history.pop(0)
            history.append(level)
            m, s = divmod(int(seconds), 60)
            self._draw(COLORS["recording"], f"{title}  {m}:{s:02d}", hint, bars=list(history))
            self._tick_job = self.root.after(120, tick)

        tick()

    def show_working(self, title: str) -> None:
        self._cancel_jobs()
        self._draw(COLORS["working"], title)

    def show_done(self, title: str, sub: str = "") -> None:
        self._cancel_jobs()
        self._draw(COLORS["done"], title, sub)
        self._hide_job = self.root.after(1800, self.hide)

    def show_info(self, title: str, sub: str = "", seconds: float = 4) -> None:
        self._cancel_jobs()
        self._draw(COLORS["info"], title, sub)
        self._hide_job = self.root.after(int(seconds * 1000), self.hide)

    def show_error(self, title: str) -> None:
        self._cancel_jobs()
        self._draw(COLORS["error"], title)
        self._hide_job = self.root.after(5500, self.hide)

    def hide(self) -> None:
        self._cancel_jobs()
        self.win.withdraw()
        self._visible = False


class SettingsWindow:
    """설정 창. 저장하면 on_save(새 설정, 자동 실행 여부)를 부릅니다."""

    _open: "SettingsWindow | None" = None

    @classmethod
    def open(cls, root, cfg, on_save, autostart_state, first_run=False):
        if cls._open and cls._open.win.winfo_exists():
            cls._open.win.deiconify()
            cls._open.win.lift()
            cls._open.win.focus_force()
            return
        cls._open = cls(root, cfg, on_save, autostart_state, first_run)

    def __init__(self, root, cfg, on_save, autostart_state, first_run):
        self.cfg = dict(cfg)
        self.on_save = on_save
        win = self.win = tk.Toplevel(root)
        win.title("MR.K Typeless 설정")
        win.resizable(False, False)
        win.attributes("-topmost", True)
        style = ttk.Style(win)
        style.configure("TLabel", font=(FONT, 10))
        style.configure("Head.TLabel", font=(FONT, 11, "bold"))
        style.configure("Hint.TLabel", font=(FONT, 9), foreground="#576074")
        style.configure("TButton", font=(FONT, 10))
        style.configure("TCheckbutton", font=(FONT, 10))

        frame = ttk.Frame(win, padding=18)
        frame.grid(sticky="nsew")
        frame.columnconfigure(1, weight=1)
        row = 0

        def head(text):
            nonlocal row
            ttk.Label(frame, text=text, style="Head.TLabel").grid(row=row, column=0, columnspan=3, sticky="w", pady=(12, 4))
            row += 1

        def hint(text):
            nonlocal row
            ttk.Label(frame, text=text, style="Hint.TLabel", wraplength=470, justify="left").grid(
                row=row, column=0, columnspan=3, sticky="w", pady=(0, 4)
            )
            row += 1

        def secret(label, key, url):
            nonlocal row
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
            var = tk.StringVar(value=self.cfg.get(key, ""))
            entry = ttk.Entry(frame, textvariable=var, show="•", width=42)
            entry.grid(row=row, column=1, sticky="we", pady=3)
            buttons = ttk.Frame(frame)
            buttons.grid(row=row, column=2, sticky="w", padx=(6, 0))
            ttk.Button(buttons, text="보기", width=5, command=lambda: entry.configure(show="" if entry.cget("show") else "•")).pack(side="left")
            ttk.Button(buttons, text="키 발급 ↗", command=lambda: webbrowser.open(url())).pack(side="left", padx=(4, 0))
            row += 1
            return var

        def choice(label, values, current):
            nonlocal row
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
            var = tk.StringVar(value=current)
            ttk.Combobox(frame, textvariable=var, values=values, state="readonly", width=40).grid(row=row, column=1, columnspan=2, sticky="w", pady=3)
            row += 1
            return var

        def text_entry(label, key, width=42):
            nonlocal row
            ttk.Label(frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
            var = tk.StringVar(value=self.cfg.get(key, ""))
            ttk.Entry(frame, textvariable=var, width=width).grid(row=row, column=1, columnspan=2, sticky="w", pady=3)
            row += 1
            return var

        if first_run:
            ttk.Label(
                frame,
                text="처음 오셨네요! 두 가지 API 키를 넣으면 바로 쓸 수 있습니다.\n'키 발급 ↗' 버튼을 누르면 발급 페이지가 열립니다.",
                font=(FONT, 10, "bold"),
                foreground="#2443d6",
                justify="left",
            ).grid(row=row, column=0, columnspan=3, sticky="w", pady=(0, 6))
            row += 1

        head("1. 받아쓰기 (말 → 글자)")
        provider_labels = [p[1] for p in STT_PROVIDERS]
        current_provider = next((p for p in STT_PROVIDERS if p[0] == self.cfg.get("stt_provider")), STT_PROVIDERS[0])
        self.provider = choice("받아쓰기 서비스", provider_labels, current_provider[1])
        self.stt_key = secret(
            "받아쓰기 API 키",
            "stt_api_key",
            lambda: next(p[2] for p in STT_PROVIDERS if p[1] == self.provider.get()),
        )
        lang_labels = [l[1] for l in SPEECH_LANGS]
        self.lang = choice("말하는 언어", lang_labels, next((l[1] for l in SPEECH_LANGS if l[0] == self.cfg.get("speech_lang")), "한국어"))
        hint("ElevenLabs는 키를 만들 때 권한을 고를 수 있으면 Speech to Text만 켜 두세요. 이용한 시간만큼 요금이 나옵니다.")

        head("2. 정리 (Claude)")
        self.claude_key = secret("Claude API 키", "claude_api_key", lambda: CLAUDE_KEY_URL)
        model_labels = [m[1] for m in MODELS]
        self.model = choice("모델", model_labels, next((m[1] for m in MODELS if m[0] == self.cfg.get("model")), model_labels[0]))
        hint("Claude 키가 없으면 '음, 어'와 반복만 지우는 기본 정리만 합니다.")

        head("3. 글")
        mode_labels = [m["label"] for m in MODES]
        self.mode = choice("기본 글 형식", mode_labels, next((m["label"] for m in MODES if m["id"] == self.cfg.get("mode")), "자동 정리"))
        self.target = choice("번역할 언어", TARGET_LANGS, self.cfg.get("target_language", "영어"))
        self.signature = text_entry("이메일 서명", "signature")
        ttk.Label(frame, text="나만의 문체").grid(row=row, column=0, sticky="nw", padx=(0, 10), pady=3)
        self.style_note = tk.Text(frame, width=48, height=3, font=(FONT, 10), wrap="word")
        self.style_note.insert("1.0", self.cfg.get("style_note", ""))
        self.style_note.grid(row=row, column=1, columnspan=2, sticky="w", pady=3)
        row += 1
        hint("예: '~습니다'체로, 문장은 짧게. 법령 이름은 정식 명칭으로.")

        head("4. 단축키")
        self.hk_dictate = text_entry("말하기", "hotkey_dictate", 24)
        self.hk_polish = text_entry("선택한 글 정리", "hotkey_polish", 24)
        self.hk_edit = text_entry("선택한 글 말로 고치기", "hotkey_edit", 24)
        hint("길게 누르고 말하면 손을 뗄 때 끝나고, 짧게 누르면 다시 누를 때까지 듣습니다. 예: ctrl+shift+space, f9")

        head("5. 기타")
        self.auto_paste = tk.BooleanVar(value=bool(self.cfg.get("auto_paste", True)))
        ttk.Checkbutton(frame, text="정리된 글을 쓰던 곳에 바로 붙여넣기 (끄면 클립보드에만 복사)", variable=self.auto_paste).grid(
            row=row, column=0, columnspan=3, sticky="w"
        )
        row += 1
        self.restore = tk.BooleanVar(value=bool(self.cfg.get("restore_clipboard", True)))
        ttk.Checkbutton(frame, text="붙여넣은 뒤 원래 클립보드 내용 되돌리기", variable=self.restore).grid(
            row=row, column=0, columnspan=3, sticky="w"
        )
        row += 1
        self.autostart_available = autostart_state is not None
        self.autostart = tk.BooleanVar(value=bool(autostart_state))
        cb = ttk.Checkbutton(frame, text="Windows를 켤 때 자동으로 실행", variable=self.autostart)
        cb.grid(row=row, column=0, columnspan=3, sticky="w")
        if not self.autostart_available:
            cb.state(["disabled"])
        row += 1

        buttons = ttk.Frame(frame)
        buttons.grid(row=row, column=0, columnspan=3, sticky="e", pady=(16, 0))
        ttk.Button(buttons, text="취소", command=win.destroy).pack(side="right")
        ttk.Button(buttons, text="저장", command=self._save).pack(side="right", padx=(0, 6))

        win.update_idletasks()
        x = (win.winfo_screenwidth() - win.winfo_reqwidth()) // 2
        y = max(20, (win.winfo_screenheight() - win.winfo_reqheight()) // 3)
        win.geometry(f"+{x}+{y}")
        win.focus_force()

    def _save(self) -> None:
        import keyboard

        hotkeys = {
            "hotkey_dictate": self.hk_dictate.get().strip().lower(),
            "hotkey_polish": self.hk_polish.get().strip().lower(),
            "hotkey_edit": self.hk_edit.get().strip().lower(),
        }
        for combo in hotkeys.values():
            try:
                keyboard.parse_hotkey(combo)
            except ValueError:
                messagebox.showerror("단축키 확인", f"'{combo}'는 쓸 수 없는 단축키입니다. 예: ctrl+shift+space", parent=self.win)
                return
        if len(set(hotkeys.values())) < 3:
            messagebox.showerror("단축키 확인", "세 단축키는 서로 달라야 합니다.", parent=self.win)
            return

        cfg = dict(self.cfg)
        cfg.update(hotkeys)
        cfg["stt_provider"] = next(p[0] for p in STT_PROVIDERS if p[1] == self.provider.get())
        cfg["stt_api_key"] = self.stt_key.get().strip()
        cfg["speech_lang"] = next(l[0] for l in SPEECH_LANGS if l[1] == self.lang.get())
        cfg["claude_api_key"] = self.claude_key.get().strip()
        cfg["model"] = next(m[0] for m in MODELS if m[1] == self.model.get())
        cfg["mode"] = next(m["id"] for m in MODES if m["label"] == self.mode.get())
        cfg["target_language"] = self.target.get()
        cfg["signature"] = self.signature.get().strip()
        cfg["style_note"] = self.style_note.get("1.0", "end").strip()
        cfg["auto_paste"] = bool(self.auto_paste.get())
        cfg["restore_clipboard"] = bool(self.restore.get())
        self.on_save(cfg, bool(self.autostart.get()) if self.autostart_available else None)
        self.win.destroy()


def help_text(cfg: dict) -> str:
    return f"""MR.K Typeless 데스크톱 사용법

■ 말하기  [{cfg['hotkey_dictate']}]
  글을 쓸 곳(메일, 카톡, Claude 입력창 등)을 클릭해 두고
  단축키를 길게 누른 채 말하고 손을 떼세요.
  짧게 한 번 누르면 계속 듣다가, 다시 누르면 끝납니다.
  → 받아쓰고, 정리하고, 그 자리에 바로 붙여넣습니다.

■ 선택한 글 정리  [{cfg['hotkey_polish']}]
  Win+H 등으로 받아쓴 글을 마우스로 선택한 뒤 누르면
  '음, 어'를 지우고 정리된 글로 바꿉니다. (받아쓰기 키 없이도 됩니다)

■ 선택한 글 말로 고치기  [{cfg['hotkey_edit']}]
  고칠 글을 선택하고 단축키를 누른 채
  "더 공손하게", "세 줄로 요약해줘"처럼 말하세요.

■ 글 형식
  작업 표시줄 오른쪽 아래 MR.K 아이콘(^ 안에 있을 수 있음)을 오른쪽 클릭 → 글 형식
  (자동 정리 · 메시지 · 이메일 · 보고서 · 강의 원고 · 상담 노트 · 번역)

■ 멈추기  [Esc] 녹음 중에 누르면 버립니다.

■ 팁
  · 영상이나 음악을 틀어 두면 그 소리도 받아써집니다. 멈추고 말하세요.
  · 관리자 권한으로 연 프로그램 안에서는 단축키가 안 먹을 수 있습니다.
"""


def show_help(root, cfg: dict) -> None:
    win = tk.Toplevel(root)
    win.title("MR.K Typeless 사용법")
    win.attributes("-topmost", True)
    text = tk.Text(win, width=62, height=26, font=(FONT, 10), wrap="word", padx=16, pady=14, relief="flat")
    text.insert("1.0", help_text(cfg))
    text.configure(state="disabled")
    text.pack()
    ttk.Button(win, text="닫기", command=win.destroy).pack(pady=(0, 12))
    win.focus_force()
