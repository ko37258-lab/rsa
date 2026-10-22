"""화면: 녹음·정리 상태를 보여 주는 작은 알약 창, 설정 창, 사용 방법 창."""

import sys
import tkinter as tk
import tkinter.font as tkfont
import webbrowser
from tkinter import messagebox, ttk

from .config import (
    CLAUDE_KEY_URL,
    ENGINES,
    GEMINI_KEY_URL,
    GEMINI_MODELS,
    GUIDE_URL,
    MODELS,
    SPEECH_LANGS,
    STT_PROVIDERS,
    TARGET_LANGS,
    same_hotkey,
    stt_key,
)
from .guide import help_items, readiness
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



def _label_of(options, value, fallback_index=0):
    return next((label for key, label, *_ in options if key == value), options[fallback_index][1])


def _key_of(options, label):
    return next(key for key, lab, *_ in options if lab == label)


class _Form:
    """설정 창 한 칸(탭)의 줄 맞춤 도우미."""

    def __init__(self, parent) -> None:
        self.frame = ttk.Frame(parent, padding=(18, 14))
        self.frame.columnconfigure(1, weight=1)
        self.row = 0

    def _next(self) -> int:
        self.row += 1
        return self.row - 1

    def banner(self, text: str) -> None:
        ttk.Label(self.frame, text=text, style="Banner.TLabel", justify="left", wraplength=500).grid(
            row=self._next(), column=0, columnspan=3, sticky="w", pady=(0, 8)
        )

    def head(self, text: str) -> None:
        ttk.Label(self.frame, text=text, style="Head.TLabel").grid(row=self._next(), column=0, columnspan=3, sticky="w", pady=(10, 4))

    def hint(self, text: str) -> None:
        ttk.Label(self.frame, text=text, style="Hint.TLabel", wraplength=500, justify="left").grid(
            row=self._next(), column=0, columnspan=3, sticky="w", pady=(0, 4)
        )

    def secret(self, label: str, value: str, url) -> tk.StringVar:
        row = self._next()
        ttk.Label(self.frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
        var = tk.StringVar(value=value)
        entry = ttk.Entry(self.frame, textvariable=var, show="•", width=38)
        entry.grid(row=row, column=1, sticky="we", pady=3)
        buttons = ttk.Frame(self.frame)
        buttons.grid(row=row, column=2, sticky="w", padx=(6, 0))
        ttk.Button(buttons, text="보기", width=5, command=lambda: entry.configure(show="" if entry.cget("show") else "•")).pack(side="left")
        ttk.Button(buttons, text="키 발급 ↗", command=lambda: webbrowser.open(url())).pack(side="left", padx=(4, 0))
        return var

    def choice(self, label: str, values: list[str], current: str) -> tk.StringVar:
        row = self._next()
        ttk.Label(self.frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
        var = tk.StringVar(value=current)
        ttk.Combobox(self.frame, textvariable=var, values=values, state="readonly", width=44).grid(
            row=row, column=1, columnspan=2, sticky="w", pady=3
        )
        return var

    def entry(self, label: str, value: str, width: int = 44) -> tk.StringVar:
        row = self._next()
        ttk.Label(self.frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 10), pady=3)
        var = tk.StringVar(value=value)
        ttk.Entry(self.frame, textvariable=var, width=width).grid(row=row, column=1, columnspan=2, sticky="w", pady=3)
        return var

    def check(self, text: str, value: bool) -> tuple[tk.BooleanVar, ttk.Checkbutton]:
        var = tk.BooleanVar(value=value)
        cb = ttk.Checkbutton(self.frame, text=text, variable=var)
        cb.grid(row=self._next(), column=0, columnspan=3, sticky="w", pady=2)
        return var, cb

    def text(self, label: str, value: str) -> tk.Text:
        row = self._next()
        ttk.Label(self.frame, text=label).grid(row=row, column=0, sticky="nw", padx=(0, 10), pady=3)
        box = tk.Text(self.frame, width=50, height=3, font=(FONT, 10), wrap="word")
        box.insert("1.0", value)
        box.grid(row=row, column=1, columnspan=2, sticky="w", pady=3)
        return box


class SettingsWindow:
    """설정 창. 저장하면 on_save(새 설정, 자동 실행 여부)를 부릅니다."""

    _open: "SettingsWindow | None" = None

    @classmethod
    def open(cls, root, cfg, on_save, autostart_state, first_run=False, on_help=None):
        if cls._open and cls._open.win.winfo_exists():
            cls._open.win.deiconify()
            cls._open.win.lift()
            cls._open.win.focus_force()
            return
        cls._open = cls(root, cfg, on_save, autostart_state, first_run, on_help)

    def __init__(self, root, cfg, on_save, autostart_state, first_run, on_help):
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
        style.configure("Banner.TLabel", font=(FONT, 10, "bold"), foreground="#4c40d9")
        style.configure("TButton", font=(FONT, 10))
        style.configure("TCheckbutton", font=(FONT, 10))
        style.configure("TNotebook.Tab", font=(FONT, 10), padding=(12, 5))

        outer = ttk.Frame(win, padding=(12, 12, 12, 14))
        outer.grid(sticky="nsew")
        tabs = ttk.Notebook(outer)
        tabs.grid(row=0, column=0, sticky="nsew")
        c = self.cfg

        # ---- 1. 시작하기: 키와 Win+H ----
        f = _Form(tabs)
        tabs.add(f.frame, text="시작하기")
        if first_run:
            f.banner("처음 오셨네요! Gemini API 키 하나만 넣고 저장하면 바로 쓸 수 있습니다.\n'키 발급 ↗'을 누르면 Google AI Studio가 열립니다 (Google 계정으로 로그인).")
        f.head("AI 키")
        self.gemini_key = f.secret("Gemini API 키", c.get("gemini_api_key", ""), lambda: GEMINI_KEY_URL)
        f.hint("이 키 하나로 받아쓰기(말 → 글자)와 정리를 모두 합니다. Google AI Studio에서 무료로 만들 수 있고, 무료 사용량 안에서는 요금이 나오지 않습니다. 무료 등급에서는 보낸 내용이 Google 서비스 개선에 쓰일 수 있습니다.")
        self.claude_key = f.secret("Claude API 키 (선택)", c.get("claude_api_key", ""), lambda: CLAUDE_KEY_URL)
        f.hint("넣으면 정리는 Claude가 합니다 (유료). 비워 두면 Gemini가 정리합니다.")
        f.head("Win+H")
        self.win_h, _ = f.check("Win+H를 누르면 MR.K로 받아쓰기 (Windows 기본 음성 입력 대신)", bool(c.get("win_h", True)))
        f.hint("Win+H → 말하기 → Win+H 한 번 더 누르면, 받아쓰고 정리해서 그 자리에 붙여넣습니다. 끄면 Win+H는 원래대로 Windows 음성 입력이 열립니다.")
        f.head("실행")
        self.autostart_available = autostart_state is not None
        self.autostart, cb = f.check("Windows를 켤 때 자동으로 실행", bool(autostart_state))
        if not self.autostart_available:
            cb.state(["disabled"])

        # ---- 2. 받아쓰기·정리 ----
        f = _Form(tabs)
        tabs.add(f.frame, text="받아쓰기 · 정리")
        f.head("받아쓰기 (말 → 글자)")
        self.provider = f.choice("받아쓰기 서비스", [p[1] for p in STT_PROVIDERS], _label_of(STT_PROVIDERS, c.get("stt_provider")))
        self.stt_key = f.secret(
            "받아쓰기 API 키",
            c.get("stt_api_key", ""),
            lambda: next(p[2] for p in STT_PROVIDERS if p[1] == self.provider.get()),
        )
        f.hint("ElevenLabs·OpenAI를 고를 때만 넣습니다. Gemini를 고르면 '시작하기'의 Gemini 키를 씁니다.")
        self.lang = f.choice("말하는 언어", [l[1] for l in SPEECH_LANGS], _label_of(SPEECH_LANGS, c.get("speech_lang")))
        f.head("정리 (글자 → 정리된 글)")
        self.engine = f.choice("정리할 AI", [e[1] for e in ENGINES], _label_of(ENGINES, c.get("engine")))
        self.gemini_model = f.choice("Gemini 모델", [m[1] for m in GEMINI_MODELS], _label_of(GEMINI_MODELS, c.get("gemini_model")))
        self.model = f.choice("Claude 모델", [m[1] for m in MODELS], _label_of(MODELS, c.get("model")))
        f.hint("AI 키가 하나도 없으면 '음, 어'와 반복만 지우는 기본 정리만 합니다.")

        # ---- 3. 글 ----
        f = _Form(tabs)
        tabs.add(f.frame, text="글")
        mode_options = [(m["id"], m["label"]) for m in MODES]
        self.mode = f.choice("기본 글 형식", [m[1] for m in mode_options], _label_of(mode_options, c.get("mode")))
        self.target = f.choice("번역할 언어", TARGET_LANGS, c.get("target_language", "영어"))
        self.signature = f.entry("이메일 서명", c.get("signature", ""))
        self.style_note = f.text("나만의 문체", c.get("style_note", ""))
        f.hint("예: '~습니다'체로, 문장은 짧게. 법령 이름은 정식 명칭으로.")

        # ---- 4. 단축키·기타 ----
        f = _Form(tabs)
        tabs.add(f.frame, text="단축키 · 기타")
        self.hk_dictate = f.entry("말하기", c.get("hotkey_dictate", ""), 24)
        self.hk_polish = f.entry("선택한 글 정리", c.get("hotkey_polish", ""), 24)
        self.hk_edit = f.entry("선택한 글 말로 고치기", c.get("hotkey_edit", ""), 24)
        f.hint("길게 누르고 말하면 손을 뗄 때 끝나고, 짧게 누르면 다시 누를 때까지 듣습니다. 예: ctrl+shift+space, f9")
        f.head("붙여넣기")
        self.auto_paste, _ = f.check("정리된 글을 쓰던 곳에 바로 붙여넣기 (끄면 클립보드에만 복사)", bool(c.get("auto_paste", True)))
        self.restore, _ = f.check("붙여넣은 뒤 원래 클립보드 내용 되돌리기", bool(c.get("restore_clipboard", True)))

        buttons = ttk.Frame(outer)
        buttons.grid(row=1, column=0, sticky="we", pady=(12, 0))
        if on_help:
            ttk.Button(buttons, text="사용 방법 보기", command=on_help).pack(side="left")
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
        if bool(self.win_h.get()) and any(same_hotkey(c, "windows+h") for c in hotkeys.values()):
            messagebox.showerror("단축키 확인", "Win+H는 이미 '말해서 입력'에 쓰이고 있습니다. 다른 단축키를 적거나 Win+H 옵션을 꺼 주세요.", parent=self.win)
            return

        cfg = dict(self.cfg)
        cfg.update(hotkeys)
        cfg["gemini_api_key"] = self.gemini_key.get().strip()
        cfg["claude_api_key"] = self.claude_key.get().strip()
        cfg["win_h"] = bool(self.win_h.get())
        cfg["stt_provider"] = _key_of(STT_PROVIDERS, self.provider.get())
        cfg["stt_api_key"] = self.stt_key.get().strip()
        cfg["speech_lang"] = _key_of(SPEECH_LANGS, self.lang.get())
        cfg["engine"] = _key_of(ENGINES, self.engine.get())
        cfg["gemini_model"] = _key_of(GEMINI_MODELS, self.gemini_model.get())
        cfg["model"] = _key_of(MODELS, self.model.get())
        cfg["mode"] = next(m["id"] for m in MODES if m["label"] == self.mode.get())
        cfg["target_language"] = self.target.get()
        cfg["signature"] = self.signature.get().strip()
        cfg["style_note"] = self.style_note.get("1.0", "end").strip()
        cfg["auto_paste"] = bool(self.auto_paste.get())
        cfg["restore_clipboard"] = bool(self.restore.get())
        if not stt_key(cfg):
            need = "Gemini API 키" if cfg["stt_provider"] == "gemini" else "받아쓰기 API 키"
            if not messagebox.askyesno(
                "키 확인",
                f"{need}가 비어 있어 아직 말로 입력할 수 없습니다.\n그래도 저장할까요?",
                parent=self.win,
            ):
                return
        self.on_save(cfg, bool(self.autostart.get()) if self.autostart_available else None)
        self.win.destroy()


# ---------- 사용 방법 ----------

class HelpWindow:
    """사용 방법 창: 트레이 아이콘을 누르거나, 처음 설정을 마치면 열립니다."""

    _open: "HelpWindow | None" = None
    BG = "#ffffff"
    INK = "#0d131b"
    TEXT = "#495057"
    PRIMARY = "#4c40d9"

    @classmethod
    def open(cls, root, cfg, open_settings=None, newer_version=None):
        if cls._open and cls._open.win.winfo_exists():
            cls._open.win.destroy()
        cls._open = cls(root, cfg, open_settings, newer_version)

    def __init__(self, root, cfg, open_settings, newer_version=None):
        win = self.win = tk.Toplevel(root)
        win.title("MR.K Typeless 사용 방법")
        win.resizable(False, False)
        win.attributes("-topmost", True)
        win.configure(bg=self.BG)
        body = tk.Frame(win, bg=self.BG, padx=26, pady=22)
        body.pack(fill="both", expand=True)

        tk.Label(body, text="MR.K Typeless 사용 방법", font=(FONT, 16, "bold"), fg=self.INK, bg=self.BG).pack(anchor="w")
        tk.Label(
            body,
            text="어느 창에서든 말하면, 정리된 글이 그 자리에 들어갑니다.",
            font=(FONT, 10),
            fg=self.TEXT,
            bg=self.BG,
        ).pack(anchor="w", pady=(2, 12))

        ready, status = readiness(cfg)
        state = tk.Frame(body, bg="#ebfbee" if ready else "#fff5f5", padx=12, pady=8)
        state.pack(fill="x", pady=(0, 14))
        tk.Label(state, text="●", fg="#2b8a3e" if ready else "#e03131", bg=state["bg"], font=(FONT, 10)).pack(side="left")
        tk.Label(state, text=status, fg=self.INK, bg=state["bg"], font=(FONT, 10, "bold"), wraplength=470, justify="left").pack(
            side="left", padx=(6, 0)
        )

        for keys, title, desc in help_items(cfg):
            row = tk.Frame(body, bg=self.BG)
            row.pack(fill="x", pady=5)
            badge = tk.Label(row, text=keys, font=(FONT, 10, "bold"), fg="#ffffff", bg="#151531", padx=10, pady=5, width=18)
            badge.pack(side="left", anchor="n")
            text = tk.Frame(row, bg=self.BG)
            text.pack(side="left", fill="x", padx=(12, 0))
            tk.Label(text, text=title, font=(FONT, 10, "bold"), fg=self.INK, bg=self.BG).pack(anchor="w")
            tk.Label(text, text=desc, font=(FONT, 9), fg=self.TEXT, bg=self.BG, justify="left", wraplength=360).pack(anchor="w")

        tips = (
            "· 글 형식(메시지·이메일·보고서·강의 원고·번역 등)은 작업 표시줄 오른쪽 아래\n"
            "  MR.K 아이콘(^ 안에 있을 수 있음)을 오른쪽 클릭 → 글 형식에서 바꿉니다.\n"
            "· 영상·음악을 틀어 두면 그 소리도 받아써집니다. 멈추고 말하세요.\n"
            "· 관리자 권한으로 연 프로그램 안에서는 단축키가 듣지 않을 수 있습니다."
        )
        tk.Label(body, text=tips, font=(FONT, 9), fg=self.TEXT, bg=self.BG, justify="left").pack(anchor="w", pady=(14, 0))

        if newer_version:
            upd = tk.Frame(body, bg="#fff4e6", padx=12, pady=8)
            upd.pack(fill="x", pady=(14, 0))
            tk.Label(upd, text=f"새 버전 {newer_version}이 나왔습니다.", font=(FONT, 10, "bold"), fg=self.INK, bg=upd["bg"]).pack(side="left")
            ttk.Button(upd, text="내려받기 ↗", command=lambda: webbrowser.open(GUIDE_URL)).pack(side="right")

        buttons = tk.Frame(body, bg=self.BG)
        buttons.pack(fill="x", pady=(18, 0))
        ttk.Button(buttons, text="닫기", command=win.destroy).pack(side="right")
        ttk.Button(buttons, text="웹에서 자세히 보기 ↗", command=lambda: webbrowser.open(GUIDE_URL)).pack(side="right", padx=(0, 6))
        if open_settings:
            ttk.Button(buttons, text="설정 열기", command=lambda: (win.destroy(), open_settings())).pack(side="left")

        win.update_idletasks()
        x = (win.winfo_screenwidth() - win.winfo_reqwidth()) // 2
        y = max(20, (win.winfo_screenheight() - win.winfo_reqheight()) // 3)
        win.geometry(f"+{x}+{y}")
        win.focus_force()
