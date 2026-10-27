"""녹음 파일 받아쓰기 창의 흐름: 받아쓰기 → 정리 → 결과, 멈추기, 정리 실패, 다른 형식으로 다시 정리.
진짜 창·서버 대신 가짜 창과 가짜 받아쓰기를 씁니다."""

import sys
import threading
import time
import types

try:
    import tkinter  # noqa: F401
except ModuleNotFoundError:  # 화면 없는 리눅스 테스트 환경
    sys.modules["tkinter"] = types.ModuleType("tkinter")

import pytest

from mrk_typeless import filejob, filestt, llm
from mrk_typeless.config import DEFAULTS
from mrk_typeless.filestt import FileTranscript, Progress


class FakeWindow:
    def __init__(self):
        self.calls = []
        self.answer = True

    def __getattr__(self, name):
        def method(*a):
            self.calls.append((name, a))

        return method

    def confirm(self, question):
        self.calls.append(("confirm", (question,)))
        return self.answer

    def last(self, name):
        return next((a for n, a in reversed(self.calls) if n == name), None)

    def names(self):
        return [n for n, _ in self.calls]


class FakeOverlay:
    def __init__(self):
        self.calls = []

    def show_info(self, *a):
        self.calls.append(a)


class FakeApp:
    def __init__(self, **cfg):
        self.cfg = {**DEFAULTS, "gemini_api_key": "AIza", "stt_provider": "gemini", "mode": "lecture", **cfg}
        self.state = "idle"
        self.overlay = FakeOverlay()
        self.file_job = None
        self.switched = False

    def post(self, fn, *args):
        fn(*args)

    def _dictionary(self):
        return {"terms": ["지구단위계획"], "replacements": [{"from": "건폐률", "to": "건폐율"}]}

    def _switch_stt_to_gemini(self):
        self.switched = True


@pytest.fixture
def env(monkeypatch, tmp_path):
    p = tmp_path / "강의.m4a"
    p.write_bytes(b"\0" * 2048)
    history = []
    monkeypatch.setattr(filejob, "append_history", lambda entry, cfg=None: history.append(entry))
    seen = {"stt": [], "ai": []}

    def fake_transcribe(path, provider, key, lang, hints=None, gemini_key="", duration=None, on_progress=None, cancel=None):
        seen["stt"].append({"provider": provider, "key": key, "hints": hints, "gemini_key": gemini_key})
        if on_progress:
            on_progress(Progress("upload", 512, 2048))
            on_progress(Progress("transcribe", 1, 3))
        return seen.get("out") or FileTranscript("음 오늘은 건폐률을 어 설명하겠습니다", duration=2700)

    def fake_ai(system, user, cfg, max_tokens=16000, cancel=None):
        seen["ai"].append({"user": user, "max_tokens": max_tokens, "system": system})
        if seen.get("ai_error"):
            raise llm.LlmError(seen["ai_error"])
        return "정리된 강의 원고"

    monkeypatch.setattr(filestt, "transcribe_file", fake_transcribe)
    monkeypatch.setattr(llm, "run_ai", fake_ai)
    return types.SimpleNamespace(path=str(p), history=history, seen=seen)


def run_job(app, path, window=None):
    window = window or FakeWindow()
    job = filejob.FileJob(app, path, window=window)
    app.file_job = job
    job.start()
    end = time.monotonic() + 3
    while job.running and time.monotonic() < end:
        time.sleep(0.01)
    assert not job.running
    return job, window


def test_transcribes_polishes_and_shows_result(env):
    app = FakeApp()
    _job, win = run_job(app, env.path)
    polished, raw, label, notes = win.last("show_result")
    assert polished == "정리된 강의 원고" and label == "강의 원고" and notes == []
    assert raw == "음 오늘은 건폐률을 어 설명하겠습니다"  # 원문은 그대로, 정리할 때만 사전 바꿔쓰기
    assert "건폐율" in env.seen["ai"][0]["user"]
    assert env.seen["stt"][0]["hints"] == ["지구단위계획"]
    working = [a[0] for n, a in win.calls if n == "set_working"]
    assert any("25%" in w for w in working) and any("2/3 구간" in w for w in working) and any("강의 원고" in w for w in working)
    assert env.history[0]["kind"] == "file" and env.history[0]["file"] == "강의.m4a" and env.history[0]["seconds"] == 2700
    assert app.overlay.calls and "글로 바꿨습니다" in app.overlay.calls[0][0]


def test_long_transcript_gets_a_bigger_output_budget(env):
    env.seen["out"] = FileTranscript("가" * 30000, duration=3600)
    run_job(FakeApp(), env.path)
    assert env.seen["ai"][0]["max_tokens"] == 64000


def test_mode_chosen_while_transcribing_is_used(env, monkeypatch):
    app = FakeApp()
    win = FakeWindow()
    job = filejob.FileJob(app, env.path, window=win)
    real = filestt.transcribe_file

    def slow(*a, **k):
        job.set_mode("consult")  # 받아쓰는 도중에 창에서 '상담 노트'를 고름
        return real(*a, **k)

    monkeypatch.setattr(filestt, "transcribe_file", slow)
    job.start()
    while job.running:
        time.sleep(0.01)
    assert win.last("show_result")[2] == "상담 노트"


def test_cancel_during_transcription_ignores_late_result(env, monkeypatch):
    app = FakeApp()
    win = FakeWindow()
    job = filejob.FileJob(app, env.path, window=win)
    gate = threading.Event()
    real = filestt.transcribe_file

    def slow(*a, **k):
        gate.wait(2)
        return real(*a, **k)

    monkeypatch.setattr(filestt, "transcribe_file", slow)
    job.start()
    job.cancel()
    assert win.last("show_failure")[0] == "받아쓰기를 멈췄습니다."
    gate.set()
    time.sleep(0.2)
    assert "show_result" not in win.names() and env.seen["ai"] == [] and env.history == []


def test_cancel_during_polish_keeps_the_transcript(env, monkeypatch):
    app = FakeApp()
    win = FakeWindow()
    job = filejob.FileJob(app, env.path, window=win)
    gate = threading.Event()

    def slow_ai(system, user, cfg, max_tokens=16000, cancel=None):
        gate.wait(2)
        return "늦게 온 정리"

    monkeypatch.setattr(llm, "run_ai", slow_ai)
    job.start()
    while not job.raw:
        time.sleep(0.01)
    job.cancel()
    polished, raw, _label, notes = win.last("show_result")
    assert polished == "" and "건폐률" in raw and "정리를 멈췄습니다" in notes[-1]
    gate.set()
    time.sleep(0.2)
    assert win.last("show_result")[0] == ""  # 늦게 온 정리는 버립니다
    assert env.history == []


def test_polish_failure_still_shows_the_transcript(env):
    env.seen["ai_error"] = "Gemini 사용량 한도에 닿았습니다."
    _job, win = run_job(FakeApp(), env.path)
    polished, raw, _label, notes = win.last("show_result")
    assert polished == "" and raw and "한도" in notes[-1] and "받아쓴 원문" in notes[-1]


def test_transcription_failure_offers_retry(env, monkeypatch):
    def fail(*a, **k):
        raise filestt.SttError("Gemini API 키가 맞지 않습니다.")

    monkeypatch.setattr(filestt, "transcribe_file", fail)
    _job, win = run_job(FakeApp(), env.path)
    assert win.last("show_failure") == ("Gemini API 키가 맞지 않습니다.", True)


def test_switch_to_gemini_for_good_updates_settings_and_tells(env):
    env.seen["out"] = FileTranscript("받아쓴 글", switched_from="elevenlabs", reason="ElevenLabs 크레딧(잔액)이 다 떨어졌습니다", switch_for_good=True, missed=1)
    app = FakeApp(stt_provider="elevenlabs", stt_api_key="sk_e")
    _job, win = run_job(app, env.path)
    notes = win.last("show_result")[3]
    assert app.switched
    assert "그래서 Gemini로 받아썼습니다. 앞으로도" in notes[0] and "[표시]" in notes[1]


def test_empty_transcript_after_switch_still_explains_the_switch(env):
    env.seen["out"] = FileTranscript("", switched_from="elevenlabs", reason="ElevenLabs 크레딧(잔액)이 다 떨어졌습니다", switch_for_good=True)
    app = FakeApp(stt_provider="elevenlabs", stt_api_key="sk_e")
    _job, win = run_job(app, env.path)
    message = win.last("show_failure")[0]
    assert "말소리를 찾지 못했습니다" in message and "Gemini로 받아썼습니다" in message


def test_repolish_with_another_mode(env):
    app = FakeApp()
    job, win = run_job(app, env.path)
    job.repolish("report")
    while job.running:
        time.sleep(0.01)
    assert win.last("show_result")[2] == "보고서" and len(env.seen["ai"]) == 2
    assert env.history[-1]["mode"] == "report"


def test_repolish_uses_the_edited_transcript(env):
    """원문 탭에서 잘못 들은 말을 고친 뒤 다시 정리하면 고친 글로 정리합니다."""
    app = FakeApp()
    job, _win = run_job(app, env.path)
    job.repolish("lecture", "고친 원문: 오늘은 건폐율을 설명하겠습니다")
    while job.running:
        time.sleep(0.01)
    assert "고친 원문" in env.seen["ai"][-1]["user"] and job.raw.startswith("고친 원문")


def test_cancel_right_after_failure_never_leaves_the_window_working(env, monkeypatch):
    """작업 스레드가 실패를 넘긴 바로 그때 멈추기를 눌러도 창은 멈춘 화면이 됩니다."""
    app = FakeApp()
    win = FakeWindow()
    job = filejob.FileJob(app, env.path, window=win)
    job.running = False  # 작업 스레드가 막 끝낸 순간
    job.cancel()
    assert win.last("show_failure")[0] == "받아쓰기를 멈췄습니다."


def test_failed_repolish_keeps_previous_result_with_its_mode(env):
    app = FakeApp()
    job, win = run_job(app, env.path)
    env.seen["ai_error"] = "Claude 서버에 연결하지 못했습니다."
    job.repolish("report")
    while job.running:
        time.sleep(0.01)
    polished, _raw, label, notes = win.last("show_result")
    assert polished == "정리된 강의 원고" and label == "강의 원고" and "연결하지 못했습니다" in notes[-1]


def test_no_ai_key_uses_basic_cleanup(env):
    app = FakeApp(engine="local")
    _job, win = run_job(app, env.path)
    polished, _raw, _label, notes = win.last("show_result")
    assert "음" not in polished.split() and env.seen["ai"] == [] and "기본 정리" in notes[-1]


def test_no_overlay_while_user_is_dictating(env):
    app = FakeApp()
    app.state = "recording"
    run_job(app, env.path)
    assert app.overlay.calls == []


def test_closing_while_running_asks_and_cancels(env, monkeypatch):
    app = FakeApp()
    win = FakeWindow()
    job = filejob.FileJob(app, env.path, window=win)
    app.file_job = job
    gate = threading.Event()
    monkeypatch.setattr(filestt, "transcribe_file", lambda *a, **k: gate.wait(2) and FileTranscript("x"))
    job.start()
    win.answer = False
    assert job.close() is False and job.running
    win.answer = True
    assert job.close() is True and not job.running and app.file_job is None
    gate.set()


def test_save_writes_utf8_with_bom_for_notepad_and_hwp(env, tmp_path):
    job = filejob.FileJob(FakeApp(), env.path, window=FakeWindow())
    target = tmp_path / "강의 - 강의 원고.txt"
    job.save(str(target), "첫 줄\n둘째 줄")
    data = target.read_bytes()
    assert data.startswith(b"\xef\xbb\xbf") and "첫 줄\r\n둘째 줄".encode() in data
    assert job.window.last("flash")[0].startswith("저장했습니다")


def test_labels():
    assert filejob.size_label(27 * 1024 * 1024 + 300000) == "27.3MB" and filejob.size_label(150 * 1024 * 1024) == "150MB"
    assert filejob.length_label(45) == "45초" and filejob.length_label(2700) == "45분" and filejob.length_label(4530) == "1시간 16분"
    assert llm.output_budget("가" * 100) == 16000 and llm.output_budget("가" * 20000) == 50000 and llm.output_budget("가" * 40000) == 64000
