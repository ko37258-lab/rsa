"""녹음 파일 받아쓰기 작업: 파일 하나를 받아쓰고 정리해 창에 보여 줍니다.

말하기 단축키(Win+H 등)와 따로 돌아가므로, 긴 녹음을 받아쓰는 몇 분 동안에도 평소처럼 말로 입력할 수 있습니다.
화면(tk)은 ui.FileJobWindow가 맡고, 여기서는 작업 스레드에서 할 일과 그 결과를 창에 넘기는 일만 합니다.
창의 메서드는 언제나 app.post로 화면 스레드에서 부릅니다.
"""

import logging
import os
import threading

from . import filestt, llm, mediainfo
from .cleanup import local_cleanup, sanitize_dictation
from .config import append_history, polish_engine, stt_key
from .dictionary import apply_replacements
from .modes import MODES, get_mode
from .prompts import build_polish_prompt
from .stt import SttError

log = logging.getLogger("mrk_typeless")

PROVIDER_NAMES = {"gemini": "Gemini", "elevenlabs": "ElevenLabs", "openai": "OpenAI"}


def size_label(size: int) -> str:
    mb = size / (1024 * 1024)
    return f"{mb:.0f}MB" if mb >= 100 else f"{mb:.1f}MB"


def length_label(seconds: float | None) -> str:
    if not seconds:
        return ""
    if seconds < 60:
        return f"{round(seconds)}초"
    minutes = round(seconds / 60)
    return f"{minutes // 60}시간 {minutes % 60}분" if minutes >= 60 else f"{minutes}분"


def polish_text(raw: str, mode: str, cfg: dict, dictionary: dict) -> str:
    """받아쓴 원문을 고른 형식으로 정리합니다. 긴 녹음은 출력 한도를 길이에 맞춰 늘립니다."""
    text, _ = apply_replacements(raw, dictionary.get("replacements", []))
    if polish_engine(cfg) == "local":
        cleaned, _ = local_cleanup(text)
        return cleaned
    system, user = build_polish_prompt(text, mode, cfg, dictionary)
    return llm.run_ai(system, user, cfg, max_tokens=llm.output_budget(user))


class FileJob:
    def __init__(self, app, path: str, window=None) -> None:
        self.app = app
        self.path = path
        self.name = os.path.basename(path)
        self.size = os.path.getsize(path)
        self.duration = mediainfo.duration_seconds(path)
        self.mode = app.cfg.get("mode") or "clean"
        self.window = window
        self.running = False
        self.raw = ""  # 받아쓴 원문
        self.result = ""  # 정리된 글
        self.result_mode = self.mode  # 정리된 글의 형식
        # 지금 돌고 있는 일(받아쓰기 또는 다시 정리)의 멈춤 신호. 멈춘 일의 결과는 늦게 와도 버립니다.
        self._cancel = threading.Event()
        self._notes: list[str] = []

    # ---------- 화면 스레드 ----------
    def start(self) -> None:
        if self.window is None:
            from .ui import FileJobWindow

            self.window = FileJobWindow(
                self.app.root,
                title=self.name,
                meta=self.meta(),
                modes=[(m["id"], m["label"]) for m in MODES],
                mode=self.mode,
                on_cancel=self.cancel,
                on_close=self.close,
                on_mode=self.set_mode,
                on_repolish=self.repolish,
                on_retry=self.retry,
                on_copy=self.copy,
                on_save=self.save,
            )
        self._begin()

    def _begin(self) -> None:
        self._cancel = threading.Event()
        self.running = True
        self.raw = self.result = ""
        self._notes = []
        segmented = len(filestt.plan_segments(self.duration)) > 1
        hint = "긴 녹음은 몇 분 걸립니다. 그동안 다른 일을 하거나 Win+H로 말해도 됩니다." + (" 20분씩 나눠 받아씁니다." if segmented else "")
        self.window.set_working("받아쓸 준비를 하는 중…", None, hint)
        threading.Thread(target=self._run, args=(self._cancel,), daemon=True).start()

    def meta(self) -> str:
        return " · ".join(x for x in (size_label(self.size), length_label(self.duration)) if x)

    def set_mode(self, mode: str) -> None:
        """창에서 형식을 고르면 받아쓴 뒤 그 형식으로 정리합니다 (받아쓰는 도중에 바꿔도 됩니다)."""
        self.mode = mode

    def cancel(self) -> None:
        """멈추기: 이미 보낸 요청은 끝까지 기다리되 결과는 버립니다. 받아쓴 원문이 있으면 남겨 둡니다."""
        self._cancel.set()
        was_running, self.running = self.running, False
        if self.raw:
            notes = [*self._notes, "정리를 멈췄습니다. 받아쓴 원문은 남겨 두었습니다."] if not self.result else self._notes
            self.window.show_result(self.result, self.raw, get_mode(self.result_mode if self.result else self.mode)["label"], notes)
        elif was_running:
            self.window.show_failure("받아쓰기를 멈췄습니다.", True)

    def close(self) -> bool:
        """창을 닫아도 되면 True. 받아쓰는 중이면 물어본 뒤 멈춥니다."""
        if self.running and not self.window.confirm("받아쓰기를 멈추고 창을 닫을까요?"):
            return False
        if self.running:
            self.cancel()
        if self.app.file_job is self:
            self.app.file_job = None
        return True

    def retry(self) -> None:
        if not self.running:
            self._begin()

    def repolish(self, mode: str) -> None:
        """결과 창에서 다른 형식을 골라 다시 정리합니다."""
        if self.running or not self.raw:
            return
        self.mode = mode
        self.running = True
        self._cancel = threading.Event()
        threading.Thread(target=self._polish, args=(self._cancel,), daemon=True).start()

    def copy(self, text: str) -> None:
        from .clipboard import set_text

        set_text(text)
        self.window.flash("복사했습니다. 붙여넣을 곳에서 Ctrl+V를 누르세요.")

    def save(self, target: str, text: str) -> None:
        try:
            # 메모장·한글(HWP)이 한글을 바로 알아보게 UTF-8 BOM을 붙입니다.
            with open(target, "w", encoding="utf-8-sig", newline="\r\n") as f:
                f.write(text)
        except OSError as e:
            self.window.flash(f"저장하지 못했습니다: {e}", error=True)
            return
        self.window.flash(f"저장했습니다: {target}")

    # ---------- 작업 스레드 ----------
    def _ui(self, cancel: threading.Event, method: str, *args) -> None:
        """창에 넘깁니다. 화면 스레드에서 실행할 때 다시 확인해, 그사이 멈췄으면 보여 주지 않습니다."""
        fn = getattr(self.window, method)

        def run() -> None:
            if not cancel.is_set():
                fn(*args)

        run.__name__ = method
        self.app.post(run)

    def _progress(self, p: filestt.Progress, cancel: threading.Event) -> None:
        if cancel.is_set():
            return
        if p.stage == "upload":
            ratio = p.done / p.total if p.total else 0.0
            label = f"Gemini에 올리는 중 · {round(ratio * 100)}% ({size_label(p.done)} / {size_label(p.total)})"
        elif p.stage == "prepare":
            ratio, label = None, "Gemini가 파일을 준비하는 중…"
        elif p.total > 1:
            ratio, label = p.done / p.total, f"글로 바꾸는 중 · {min(p.done + 1, p.total)}/{p.total} 구간"
        else:
            ratio, label = None, "글로 바꾸는 중…"
        self._ui(cancel, "set_working", label, ratio, None)

    def _run(self, cancel: threading.Event) -> None:
        cfg = dict(self.app.cfg)
        try:
            dictionary = self.app._dictionary()
            provider = cfg.get("stt_provider") or "gemini"
            out = filestt.transcribe_file(
                self.path,
                provider,
                stt_key(cfg),
                cfg.get("speech_lang") or "ko",
                hints=dictionary.get("terms", []),
                gemini_key=cfg.get("gemini_api_key") or "",
                duration=self.duration,
                on_progress=lambda p: self._progress(p, cancel),
                cancel=cancel,
            )
            if cancel.is_set():
                return
            raw = sanitize_dictation(out.text).strip()
            notes = []
            if out.switched_from:
                if out.switch_for_good:
                    self.app.post(self.app._switch_stt_to_gemini)
                notes.append(
                    f"{out.reason}. 그래서 Gemini로 받아썼습니다." + (" 앞으로도 Gemini로 받아씁니다." if out.switch_for_good else "")
                )
            if out.missed:
                notes.append(f"{out.missed}곳은 받아쓰지 못해 원문에 [표시]를 남겼습니다. 그 부분만 다시 받아쓰거나 직접 채워 주세요.")
            if out.stopped:
                notes.append(f"뒷부분은 받아쓰지 못했습니다: {out.stopped}")
            if not raw:
                # Gemini로 넘긴 일(설정이 바뀜)은 실패해도 알려 둡니다.
                raise SttError(" ".join(["이 녹음에서 말소리를 찾지 못했습니다. 다른 파일을 골라 주세요.", *notes]))
            if out.duration and not self.duration:
                self.duration = out.duration
                self._ui(cancel, "set_meta", self.meta())
            if cancel.is_set():
                return
            self.raw, self._notes = raw, notes
            self._polish(cancel)
        except filestt.Cancelled:
            return
        except SttError as e:
            if not cancel.is_set():
                self.running = False
                self._ui(cancel, "show_failure", str(e), True)
        except Exception:
            log.exception("녹음 파일 받아쓰기 실패: %s", self.name)
            if not cancel.is_set():
                self.running = False
                self._ui(cancel, "show_failure", "문제가 생겼습니다. 트레이 메뉴 → 기록 폴더 열기 → log.txt를 확인해 주세요.", True)

    def _polish(self, cancel: threading.Event) -> None:
        """받아쓴 원문을 지금 고른 형식으로 정리해 창에 보여 줍니다. 정리에 실패해도 원문은 보여 줍니다."""
        cfg = dict(self.app.cfg)  # 받아쓰는 사이 넣은 키·바꾼 정리 AI도 씁니다
        mode = self.mode
        label = get_mode(mode)["label"]
        engine = polish_engine(cfg)
        notes = list(self._notes)
        if engine == "local":
            notes.append("AI 키가 없어 기본 정리만 했습니다 (설정에서 Gemini 키를 넣어 주세요).")
        else:
            who = "Gemini" if engine == "gemini" else "Claude"
            self._ui(cancel, "set_working", f"{who}가 '{label}' 형식으로 정리하는 중…", None, "글이 길면 정리에도 몇 분 걸립니다.")
        try:
            result = polish_text(self.raw, mode, cfg, self.app._dictionary())
        except Exception as e:
            if not isinstance(e, llm.LlmError):
                log.exception("녹음 파일 정리 실패: %s", self.name)
            if cancel.is_set():
                return
            why = f"{e} " if isinstance(e, llm.LlmError) else ""
            self.running = False
            # 정리에 실패하면 전에 정리해 둔 글(다른 형식)도 지우지 않고 원문과 함께 보여 줍니다.
            shown = get_mode(self.result_mode)["label"] if self.result else label
            self._ui(cancel, "show_result", self.result, self.raw, shown, [*notes, f"정리하지 못했습니다. {why}받아쓴 원문은 '받아쓴 원문' 탭에 있습니다."])
            return
        if cancel.is_set():
            return  # 멈췄습니다 (멈춘 화면은 cancel()이 이미 보여 줬습니다)
        self.result, self.result_mode, self.running = result, mode, False
        self._ui(cancel, "show_result", result, self.raw, label, notes)
        if self.app.state == "idle":
            # 말로 입력하는 중이면 그 표시를 가리지 않습니다.
            self.app.post(self.app.overlay.show_info, "녹음 파일을 글로 바꿨습니다", "창에서 복사하거나 파일로 저장하세요", 5)
        try:
            append_history(
                {"kind": "file", "mode": mode, "file": self.name, "raw": self.raw, "result": result, "seconds": round(self.duration or 0, 1)},
                cfg,
            )
        except OSError:
            log.exception("기록 저장 실패")
