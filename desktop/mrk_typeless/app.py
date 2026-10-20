"""MR.K Typeless 데스크톱 본체: 단축키 → 녹음 → 받아쓰기 → Claude 정리 → 쓰던 창에 붙여넣기."""

import logging
import os
import queue
import subprocess
import sys
import threading
import time
import tkinter as tk

from . import __version__, autostart
from .audio import AudioError, Recorder
from .cleanup import local_cleanup, sanitize_dictation
from .config import APP_DIR, DICTIONARY_PATH, LOG_PATH, append_history, load_config, load_dictionary, save_config
from .dictionary import apply_replacements
from .llm import LlmError, run_claude
from .modes import get_mode
from .prompts import build_edit_prompt, build_polish_prompt
from .stt import SttError, transcribe

# 이보다 오래 누르고 있다가 떼면 '누르는 동안만 듣기', 짧게 누르면 '다시 누를 때까지 듣기'
HOLD_SECONDS = 0.4
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
        self.tray.set_state(state, text)

    # ---------- 단축키 ----------
    def register_hotkeys(self) -> None:
        import keyboard

        keyboard.unhook_all()
        for purpose, setting in (("dictate", "hotkey_dictate"), ("edit", "hotkey_edit")):
            combo = self.cfg[setting]
            keyboard.add_hotkey(combo, self._on_record_hotkey, args=(purpose,), suppress=True)
            last_key = combo.split("+")[-1].strip()
            keyboard.on_release_key(last_key, lambda _e, p=purpose: self._on_record_key_up(p))
        keyboard.add_hotkey(self.cfg["hotkey_polish"], self._on_polish_hotkey, suppress=True)
        keyboard.on_press_key("esc", lambda _e: self._on_escape())
        log.info("단축키 등록: %s / %s / %s", self.cfg["hotkey_dictate"], self.cfg["hotkey_polish"], self.cfg["hotkey_edit"])

    def _on_record_hotkey(self, purpose: str) -> None:
        # 키를 누르고 있으면 같은 신호가 반복해서 들어오므로 첫 번째만 받습니다.
        if purpose in self._keys_down:
            return
        self._keys_down.add(purpose)
        with self._lock:
            if self.state == "recording":
                if self.purpose == purpose:
                    self._finish_recording()
                return
            if self.state == "working":
                self.post(self.overlay.show_error, "아직 앞의 글을 정리하고 있습니다. 잠시만 기다려 주세요.")
                return
            self._start_recording(purpose)

    def _on_record_key_up(self, purpose: str) -> None:
        if purpose not in self._keys_down:
            return
        self._keys_down.discard(purpose)
        with self._lock:
            held = time.monotonic() - self._pressed_at >= HOLD_SECONDS
            if self.state == "recording" and self.purpose == purpose and held:
                self._finish_recording()

    def _on_escape(self) -> None:
        with self._lock:
            if self.state != "recording":
                return
            self.recorder.cancel()
            self.purpose = None
            self._set_state("idle", "대기 중")
        self.post(self.overlay.show_info, "녹음을 버렸습니다.", "", 1.5)

    def _on_polish_hotkey(self) -> None:
        with self._lock:
            if self.state != "idle":
                self.post(self.overlay.show_error, "지금은 다른 작업 중입니다. 잠시 뒤 다시 눌러 주세요.")
                return
            self._set_state("working", "정리하는 중")
        threading.Thread(target=self._polish_selection, daemon=True).start()

    # ---------- 녹음 ----------
    def _start_recording(self, purpose: str) -> None:
        if not self.cfg.get("stt_api_key", "").strip():
            self.post(self.overlay.show_error, "받아쓰기 API 키가 없습니다. 설정 창에서 넣어 주세요.")
            self.post(self.open_settings)
            return
        try:
            self.recorder.start()
        except AudioError as e:
            self.post(self.overlay.show_error, str(e))
            return
        self.purpose = purpose
        self._pressed_at = time.monotonic()
        self._set_state("recording", "듣는 중")
        title = f"듣는 중 · {get_mode(self.cfg['mode'])['label']}" if purpose == "dictate" else "고칠 내용을 말하세요"
        hint = "손을 떼거나 단축키를 한 번 더 누르면 끝 · Esc 취소"
        recorder = self.recorder
        self.post(self.overlay.show_recording, title, hint, lambda: (recorder.level, time.monotonic() - recorder.started_at))

    def _finish_recording(self) -> None:
        purpose = self.purpose
        self.purpose = None
        wav, seconds = self.recorder.stop()
        if not wav or seconds < MIN_SPEECH_SECONDS:
            self._set_state("idle", "대기 중")
            self.post(self.overlay.hide)
            return
        self._set_state("working", "받아쓰는 중")
        threading.Thread(target=self._process_recording, args=(purpose, wav, seconds), daemon=True).start()

    # ---------- 처리 (작업 스레드) ----------
    def _process_recording(self, purpose: str, wav: bytes, seconds: float) -> None:
        cfg = self.cfg
        try:
            self.post(self.overlay.show_working, "받아쓰는 중…")
            spoken = sanitize_dictation(transcribe(wav, cfg["stt_provider"], cfg["stt_api_key"], cfg["speech_lang"])).strip()
            if not spoken:
                raise UserFacingError("말소리를 알아듣지 못했습니다. 마이크에 조금 더 가까이 대고 말해 주세요.")
            dictionary = load_dictionary()
            if purpose == "edit":
                selection, previous = self._selection()
                self.post(self.overlay.show_working, f"고치는 중… ({spoken[:24]})")
                system, user = build_edit_prompt(selection, spoken, cfg, dictionary)
                result = run_claude(system, user, cfg)
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

    def _polish_selection(self) -> None:
        try:
            selection, previous = self._selection()
            result = self._polish(selection, load_dictionary())
            self._deliver(result, raw=selection, kind="polish", previous=previous)
        except (LlmError, UserFacingError) as e:
            self.post(self.overlay.show_error, str(e))
        except Exception:
            log.exception("선택한 글 정리 실패")
            self.post(self.overlay.show_error, "문제가 생겼습니다. 트레이 메뉴 → 기록 폴더 열기 → log.txt를 확인해 주세요.")
        finally:
            self._set_state("idle", "대기 중")

    def _selection(self) -> tuple[str, str]:
        from .clipboard import copy_selection

        text, previous = copy_selection()
        text = sanitize_dictation(text).strip()
        if not text:
            raise UserFacingError("먼저 글을 마우스로 선택(드래그)한 뒤 단축키를 눌러 주세요.")
        return text, previous

    def _polish(self, text: str, dictionary: dict) -> str:
        text, _ = apply_replacements(sanitize_dictation(text), dictionary.get("replacements", []))
        if not self.cfg.get("claude_api_key", "").strip():
            cleaned, _ = local_cleanup(text)
            return cleaned
        self.post(self.overlay.show_working, f"정리하는 중… ({get_mode(self.cfg['mode'])['label']})")
        system, user = build_polish_prompt(text, self.cfg["mode"], self.cfg, dictionary)
        return run_claude(system, user, self.cfg)

    def _deliver(self, result: str, raw: str, kind: str, previous: str | None = None, command: str = "", seconds: float = 0) -> None:
        from .clipboard import paste_text, set_text

        if self.cfg.get("auto_paste", True):
            paste_text(result, restore=bool(self.cfg.get("restore_clipboard", True)), previous=previous)
            done, sub = "붙여넣었습니다", ""
        else:
            set_text(result)
            done, sub = "복사했습니다", "쓰던 곳에서 Ctrl+V로 붙여넣으세요"
        if not self.cfg.get("claude_api_key", "").strip() and kind != "edit":
            sub = "Claude 키가 없어 기본 정리만 했습니다 (설정에서 넣어 주세요)"
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
        SettingsWindow.open(self.root, self.cfg, self._apply_settings, state, first_run)

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
        self.overlay.show_done("설정을 저장했습니다", f"말하기: {cfg['hotkey_dictate']}")

    def open_help(self) -> None:
        from .ui import show_help

        show_help(self.root, self.cfg)

    def open_dictionary(self) -> None:
        load_dictionary()  # 파일이 없으면 기본 사전으로 만들어 둡니다.
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
        first_run = not (self.cfg.get("stt_api_key") and self.cfg.get("claude_api_key"))
        if first_run:
            self.root.after(300, lambda: self.open_settings(first_run=True))
        else:
            self.root.after(
                300,
                lambda: self.overlay.show_info("MR.K Typeless가 켜졌습니다", f"{self.cfg['hotkey_dictate']}를 누른 채 말하세요"),
            )
        self.root.mainloop()


# ---------- 프로그램 시작점 ----------
def _single_instance() -> bool:
    """이미 실행 중이면 False (Windows 이름 있는 뮤텍스)."""
    if sys.platform != "win32":
        return True
    import ctypes

    ctypes.windll.kernel32.CreateMutexW(None, False, "Local\\MRK-Typeless-SingleInstance")
    return ctypes.windll.kernel32.GetLastError() != 183  # ERROR_ALREADY_EXISTS


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
