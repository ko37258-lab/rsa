"""MR.K Typeless 데스크톱 본체: 단축키(또는 Win+H) → 녹음 → 받아쓰기 → AI 정리 → 쓰던 창에 붙여넣기."""

import logging
import os
import queue
import subprocess
import sys
import threading
import time
import tkinter as tk

from . import __version__, autostart, update
from .audio import AudioError, Recorder
from .cleanup import local_cleanup, sanitize_dictation
from .config import (
    APP_DIR,
    DICTIONARY_PATH,
    LOG_PATH,
    append_history,
    load_config,
    load_dictionary,
    polish_engine,
    same_hotkey,
    save_config,
    stt_key,
)
from .dictionary import apply_replacements
from .llm import LlmError, run_ai
from .modes import get_mode
from .prompts import build_edit_prompt, build_polish_prompt
from .stt import SttError, transcribe

# 이보다 오래 누르고 있다가 떼면 '누르는 동안만 듣기', 짧게 누르면 '다시 누를 때까지 듣기'.
# Win+H를 또박또박 누르면 0.5초쯤 걸리므로 그보다 넉넉하게 둡니다.
HOLD_SECONDS = 0.8
# 이보다 짧은 녹음은 실수로 누른 것으로 보고 버립니다.
MIN_SPEECH_SECONDS = 0.5

log = logging.getLogger("mrk_typeless")


class UserFacingError(Exception):
    """화면에 그대로 보여 줄 안내."""


class App:
    def __init__(self) -> None:
        from .tray import Tray
        from .ui import Overlay

        self.cfg = load_config()
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("MR.K Typeless")
        self.root.report_callback_exception = self._report_tk_error
        self.overlay = Overlay(self.root)
        self.recorder = Recorder()
        self.tasks: queue.Queue = queue.Queue()
        self.state = "idle"  # idle | recording | working
        self.status_text = "대기 중"
        self.purpose: str | None = None  # 녹음 목적: dictate(말하기) | edit(말로 고치기)
        self._pressed_at = 0.0
        self._keys_down: set[str] = set()
        self._lock = threading.Lock()
        self._first_setup = False
        self.newer_version: str | None = None  # 켤 때 확인한 새 버전 (없으면 None)
        self.tray = Tray(self)

    # ---------- 화면(tk) 스레드로 일 넘기기 ----------
    def post(self, fn, *args) -> None:
        self.tasks.put((fn, args))

    def _pump(self) -> None:
        while True:
            try:
                fn, args = self.tasks.get_nowait()
            except queue.Empty:
                break
            try:
                fn(*args)
            except Exception:
                log.exception("화면 작업 실패")
        self.root.after(40, self._pump)

    def _report_tk_error(self, *args) -> None:
        log.error("tk 오류", exc_info=args)

    def _set_state(self, state: str, text: str) -> None:
        self.state = state
        self.status_text = text
        # 트레이 아이콘 그리기는 화면 스레드에서 (키보드 훅 안에서 하면 Windows가 훅을 끊을 수 있음)
        self.post(self.tray.set_state, state, text)

    def _spawn(self, fn, *args) -> None:
        """무거운 일(마이크 열기·닫기, WAV 만들기)은 키보드 훅 밖의 스레드에서 합니다."""
        threading.Thread(target=fn, args=args, daemon=True).start()

    # ---------- 단축키 ----------
    def register_hotkeys(self) -> None:
        import keyboard

        keyboard.unhook_all()
        triggers = [("dictate", "dictate", self.cfg["hotkey_dictate"]), ("edit", "edit", self.cfg["hotkey_edit"])]
        # Win+H: Windows 음성 입력 대신 MR.K 받아쓰기를 엽니다. Win 키를 혼자 누르거나 다른 키와 누르면
        # keyboard가 Win 누름을 그대로 다시 보내므로 시작 메뉴·Win+E 같은 단축키는 그대로 됩니다.
        # 사용자가 단축키를 Win+H로 직접 정했으면 같은 키를 두 번 걸지 않습니다.
        if self.cfg.get("win_h", True) and not any(same_hotkey(c, "windows+h") for _, _, c in triggers):
            triggers.append(("dictate", "winh", "windows+h"))
        for purpose, trigger, combo in triggers:
            keyboard.add_hotkey(combo, self._on_record_hotkey, args=(purpose, trigger), suppress=True)
            last_key = combo.split("+")[-1].strip()
            keyboard.on_release_key(last_key, lambda _e, p=purpose, t=trigger: self._on_record_key_up(p, t))
        keyboard.add_hotkey(self.cfg["hotkey_polish"], self._on_polish_hotkey, suppress=True)
        keyboard.on_press_key("esc", lambda _e: self._on_escape())
        log.info(
            "단축키 등록: %s / %s / %s / Win+H %s",
            self.cfg["hotkey_dictate"],
            self.cfg["hotkey_polish"],
            self.cfg["hotkey_edit"],
            "켬" if self.cfg.get("win_h", True) else "끔",
        )

    def _on_record_hotkey(self, purpose: str, trigger: str | None = None) -> None:
        # 키를 누르고 있으면 같은 신호가 반복해서 들어오므로 첫 번째만 받습니다.
        trigger = trigger or purpose
        if trigger in self._keys_down:
            return
        self._keys_down.add(trigger)
        with self._lock:
            if self.state == "recording":
                if self.purpose == purpose:
                    self._finish_recording()
                return
            if self.state == "working":
                self.post(self.overlay.show_error, "아직 앞의 글을 정리하고 있습니다. 잠시만 기다려 주세요.")
                return
            self._begin_recording(purpose)

    def _on_record_key_up(self, purpose: str, trigger: str | None = None) -> None:
        trigger = trigger or purpose
        if trigger not in self._keys_down:
            return
        self._keys_down.discard(trigger)
        with self._lock:
            held = time.monotonic() - self._pressed_at >= HOLD_SECONDS
            if self.state == "recording" and self.purpose == purpose and held:
                self._finish_recording()

    def _on_escape(self) -> None:
        with self._lock:
            if self.state != "recording":
                return
            self.purpose = None
            self._set_state("idle", "대기 중")
        self._spawn(self.recorder.cancel)
        self.post(self.overlay.show_info, "녹음을 버렸습니다.", "", 1.5)

    def _on_polish_hotkey(self) -> None:
        with self._lock:
            if self.state != "idle":
                self.post(self.overlay.show_error, "지금은 다른 작업 중입니다. 잠시 뒤 다시 눌러 주세요.")
                return
            self._set_state("working", "정리하는 중")
        threading.Thread(target=self._polish_selection, daemon=True).start()

    # ---------- 녹음 ----------
    def _begin_recording(self, purpose: str) -> None:
        """(락 안에서) 녹음 가능 여부만 보고 상태를 바꾼 뒤, 마이크 열기는 작업 스레드로 넘깁니다."""
        if not stt_key(self.cfg):
            self.post(self.overlay.show_error, "받아쓰기 키가 없습니다. 설정 창에서 Gemini 키를 넣어 주세요.")
            self.post(self.open_settings)
            return
        if purpose == "edit" and polish_engine(self.cfg) == "local":
            self.post(self.overlay.show_error, "말로 고치기는 AI 키(Gemini나 Claude)가 있어야 합니다. 설정에서 넣어 주세요.")
            return
        self.purpose = purpose
        self._pressed_at = time.monotonic()
        self._set_state("recording", "듣는 중")
        self._spawn(self._start_recording, purpose)

    def _start_recording(self, purpose: str) -> None:
        try:
            self.recorder.start()
        except AudioError as e:
            with self._lock:
                if self.state == "recording" and self.purpose == purpose:
                    self.purpose = None
                    self._set_state("idle", "대기 중")
            self.post(self.overlay.show_error, str(e))
            return
        title = f"듣는 중 · {get_mode(self.cfg['mode'])['label']}" if purpose == "dictate" else "고칠 내용을 말하세요"
        hint = "손을 떼거나 같은 키를 한 번 더 누르면 끝 · Esc 취소"
        recorder = self.recorder
        self.post(self.overlay.show_recording, title, hint, lambda: (recorder.level, time.monotonic() - recorder.started_at))

    def _finish_recording(self) -> None:
        """(락 안에서) 상태만 바꾸고, 녹음 멈추기·WAV 만들기는 작업 스레드에서 합니다."""
        purpose = self.purpose
        self.purpose = None
        self._set_state("working", "받아쓰는 중")
        self._spawn(self._stop_recording, purpose)

    def _stop_recording(self, purpose: str) -> None:
        wav, seconds = self.recorder.stop()
        if not wav or seconds < MIN_SPEECH_SECONDS:
            self._set_state("idle", "대기 중")
            self.post(self.overlay.show_info, "너무 짧아요", "누른 채 말하거나, 짧게 눌렀다가 다 말한 뒤 한 번 더 누르세요", 2.5)
            return
        self._process_recording(purpose, wav, seconds)

    # ---------- 처리 (작업 스레드) ----------
    def _process_recording(self, purpose: str, wav: bytes, seconds: float) -> None:
        cfg = self.cfg
        try:
            self.post(self.overlay.show_working, "받아쓰는 중…")
            dictionary = self._dictionary()
            spoken = transcribe(wav, cfg["stt_provider"], stt_key(cfg), cfg["speech_lang"], hints=dictionary.get("terms", []))
            spoken = sanitize_dictation(spoken).strip()
            if not spoken:
                raise UserFacingError("말소리를 알아듣지 못했습니다. 마이크에 조금 더 가까이 대고 말해 주세요.")
            if purpose == "edit":
                selection, previous = self._selection()
                self.post(self.overlay.show_working, f"고치는 중… ({spoken[:24]})")
                system, user = build_edit_prompt(selection, spoken, cfg, dictionary)
                result = run_ai(system, user, cfg)
                self._deliver(result, raw=selection, kind="edit", previous=previous, command=spoken, seconds=seconds)
            else:
                result = self._polish(spoken, dictionary)
                self._deliver(result, raw=spoken, kind="dictation", seconds=seconds)
        except (SttError, LlmError, UserFacingError) as e:
            self.post(self.overlay.show_error, str(e))
        except Exception:
            log.exception("받아쓰기 처리 실패")
            self.post(self.overlay.show_error, "문제가 생겼습니다. 트레이 메뉴 → 기록 폴더 열기 → log.txt를 확인해 주세요.")
        finally:
            self._set_state("idle", "대기 중")

    def _dictionary(self) -> dict:
        dictionary, problem = load_dictionary()
        if problem:
            log.warning("사전 파일 오류: %s", problem)
        return dictionary

    def _polish_selection(self) -> None:
        try:
            selection, previous = self._selection()
            result = self._polish(selection, self._dictionary())
            self._deliver(result, raw=selection, kind="polish", previous=previous)
        except (LlmError, UserFacingError) as e:
            self.post(self.overlay.show_error, str(e))
        except Exception:
            log.exception("선택한 글 정리 실패")
            self.post(self.overlay.show_error, "문제가 생겼습니다. 트레이 메뉴 → 기록 폴더 열기 → log.txt를 확인해 주세요.")
        finally:
            self._set_state("idle", "대기 중")

    def _selection(self):
        from .clipboard import copy_selection

        text, previous = copy_selection()
        text = sanitize_dictation(text).strip()
        if not text:
            raise UserFacingError("먼저 글을 마우스로 선택(드래그)한 뒤 단축키를 눌러 주세요.")
        return text, previous

    def _polish(self, text: str, dictionary: dict) -> str:
        text, _ = apply_replacements(sanitize_dictation(text), dictionary.get("replacements", []))
        engine = polish_engine(self.cfg)
        if engine == "local":
            cleaned, _ = local_cleanup(text)
            return cleaned
        who = "Gemini" if engine == "gemini" else "Claude"
        self.post(self.overlay.show_working, f"{who}가 정리하는 중… ({get_mode(self.cfg['mode'])['label']})")
        system, user = build_polish_prompt(text, self.cfg["mode"], self.cfg, dictionary)
        return run_ai(system, user, self.cfg)

    def _deliver(self, result: str, raw: str, kind: str, previous=None, command: str = "", seconds: float = 0) -> None:
        from .clipboard import paste_text, set_text

        if self.cfg.get("auto_paste", True):
            paste_text(result, restore_previous=bool(self.cfg.get("restore_clipboard", True)), previous=previous)
            done, sub = "붙여넣었습니다", ""
        else:
            set_text(result)
            done, sub = "복사했습니다", "쓰던 곳에서 Ctrl+V로 붙여넣으세요"
        if polish_engine(self.cfg) == "local" and kind != "edit":
            sub = "AI 키가 없어 기본 정리만 했습니다 (설정에서 Gemini 키를 넣어 주세요)"
        self.post(self.overlay.show_done, done, sub)
        try:
            append_history({"kind": kind, "mode": self.cfg["mode"], "command": command, "raw": raw, "result": result, "seconds": round(seconds, 1)})
        except OSError:
            log.exception("기록 저장 실패")

    # ---------- 메뉴 동작 (tk 스레드) ----------
    def set_mode(self, mode_id: str) -> None:
        self.cfg["mode"] = mode_id
        save_config(self.cfg)
        self.overlay.show_info(f"글 형식: {get_mode(mode_id)['label']}", seconds=1.5)

    def open_settings(self, first_run: bool = False) -> None:
        from .ui import SettingsWindow

        state = autostart.is_enabled() if autostart.available() else None
        SettingsWindow.open(self.root, self.cfg, self._apply_settings, state, first_run, on_help=self.open_help)

    def _apply_settings(self, cfg: dict, autostart_on: bool | None) -> None:
        self.cfg = cfg
        save_config(cfg)
        if autostart_on is not None:
            try:
                autostart.set_enabled(autostart_on)
            except OSError:
                log.exception("자동 실행 설정 실패")
        try:
            self.register_hotkeys()
        except Exception:
            log.exception("단축키 등록 실패")
            self.overlay.show_error("단축키를 등록하지 못했습니다. 설정에서 다른 단축키로 바꿔 주세요.")
            return
        self.overlay.show_done("설정을 저장했습니다", f"말하기: {self.speak_hint()}")
        # 처음 설정을 마치면 바로 쓰는 법을 보여 줍니다.
        if self._first_setup and stt_key(cfg):
            self._first_setup = False
            self.root.after(600, self.open_help)

    def speak_hint(self) -> str:
        keys = ["Win+H"] if self.cfg.get("win_h", True) else []
        return " 또는 ".join(keys + [self.cfg["hotkey_dictate"]])

    def open_help(self) -> None:
        from .ui import HelpWindow

        HelpWindow.open(self.root, self.cfg, open_settings=self.open_settings, newer_version=self.newer_version)

    def open_download(self) -> None:
        import webbrowser

        webbrowser.open(update.DOWNLOAD_URL)

    # ---------- 새 버전 확인 (작업 스레드) ----------
    def check_update(self) -> None:
        newer = update.check()
        if not newer:
            return
        self.newer_version = newer
        log.info("새 버전 있음: %s (지금 %s)", newer, __version__)
        self.post(self._announce_update, newer)

    def _announce_update(self, newer: str) -> None:
        try:
            self.tray.icon.update_menu()
        except Exception:
            pass
        if self.state == "idle":
            self.overlay.show_info(f"새 버전 {newer}이 나왔습니다", "트레이 아이콘 → '새 버전 받기'에서 내려받으세요", 6)

    def open_dictionary(self) -> None:
        _, problem = load_dictionary()  # 파일이 없으면 기본 사전으로 만들어 둡니다.
        if problem:
            from tkinter import messagebox

            messagebox.showwarning(
                "사전 파일 확인",
                f"사전 파일에 오류가 있어 지금은 기본 사전을 씁니다. 메모장에서 고쳐 저장하면 다시 읽습니다.\n\n{problem}",
            )
        subprocess.Popen(["notepad.exe", str(DICTIONARY_PATH)])

    def open_folder(self) -> None:
        APP_DIR.mkdir(parents=True, exist_ok=True)
        os.startfile(str(APP_DIR))  # type: ignore[attr-defined]

    def quit(self) -> None:
        try:
            import keyboard

            keyboard.unhook_all()
        except Exception:
            pass
        self.recorder.cancel()
        self.tray.stop()
        self.root.quit()

    # ---------- 시작 ----------
    def run(self) -> None:
        self.tray.start()
        try:
            self.register_hotkeys()
        except Exception:
            log.exception("단축키 등록 실패")
        self.root.after(40, self._pump)
        # 새 버전 확인은 켜고 잠시 뒤 다른 스레드에서, 실패해도 조용히
        self.root.after(8000, lambda: threading.Thread(target=self.check_update, daemon=True).start())
        first_run = not stt_key(self.cfg)
        if first_run:
            self._first_setup = True
            self.root.after(300, lambda: self.open_settings(first_run=True))
        else:
            self.root.after(
                300,
                lambda: self.overlay.show_info("MR.K Typeless가 켜졌습니다", f"{self.speak_hint()}를 누르고 말하세요"),
            )
        self.root.mainloop()


# ---------- 프로그램 시작점 ----------
_mutex_handle = None  # 프로그램이 끝날 때까지 쥐고 있어야 합니다


def _single_instance() -> bool:
    """이미 실행 중이면 False (Windows 이름 있는 뮤텍스)."""
    global _mutex_handle
    if sys.platform != "win32":
        return True
    import ctypes

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)
    k32.CreateMutexW.restype = ctypes.c_void_p
    _mutex_handle = k32.CreateMutexW(None, False, "Local\\MRK-Typeless-SingleInstance")
    return ctypes.get_last_error() != 183  # ERROR_ALREADY_EXISTS


def _check_ca_bundle() -> str:
    path = __import__("requests").certs.where()
    if not os.path.exists(path):
        raise FileNotFoundError(path)
    return "ok"


def _self_test(out_path: str) -> int:
    """빌드 확인용: 필요한 부품이 모두 들어 있는지 검사하고 결과를 파일로 남깁니다."""
    lines, ok = [f"MR.K Typeless {__version__}"], True
    checks = [
        ("anthropic", lambda: __import__("anthropic").__version__),
        ("anthropic client", lambda: __import__("anthropic").Anthropic(api_key="sk-test").beta.messages and "ok"),
        ("gemini", lambda: __import__("mrk_typeless.gemini", fromlist=["build_body"]).build_body([{"text": "t"}], "gemini-3.8-flash", "low") and "ok"),
        ("requests", lambda: __import__("requests").__version__),
        ("CA 인증서", _check_ca_bundle),
        ("keyboard", lambda: __import__("keyboard") and "ok"),
        ("pyperclip", lambda: __import__("pyperclip") and "ok"),
        ("PIL", lambda: __import__("PIL").__version__),
        ("pystray", lambda: __import__("pystray") and "ok"),
        ("sounddevice", lambda: __import__("sounddevice").get_portaudio_version()[1]),
        ("tkinter", lambda: tk.Tk().destroy() or "ok"),
        ("tray icon", lambda: __import__("mrk_typeless.tray", fromlist=["make_icon"]).make_icon("recording").size),
    ]
    for name, check in checks:
        try:
            lines.append(f"OK   {name}: {check()}")
        except Exception as e:  # noqa: BLE001 - 무엇이 빠졌는지 그대로 남깁니다
            ok = False
            lines.append(f"FAIL {name}: {e!r}")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    return 0 if ok else 1


def main() -> None:
    if "--self-test" in sys.argv:
        idx = sys.argv.index("--self-test")
        out = sys.argv[idx + 1] if len(sys.argv) > idx + 1 else "selftest.txt"
        sys.exit(_self_test(out))

    APP_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        filename=str(LOG_PATH),
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        encoding="utf-8",
    )
    if not _single_instance():
        from tkinter import messagebox

        root = tk.Tk()
        root.withdraw()
        messagebox.showinfo("MR.K Typeless", "이미 실행 중입니다. 작업 표시줄 오른쪽 아래 MR.K 아이콘을 확인하세요.")
        return
    if sys.platform == "win32":
        import ctypes

        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(1)
        except Exception:
            pass
    log.info("시작 %s", __version__)
    App().run()
    log.info("종료")
    logging.shutdown()
    os._exit(0)  # 트레이·키보드 감시 스레드까지 확실히 끝냅니다.
