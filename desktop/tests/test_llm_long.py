"""긴 글(녹음 파일) 정리: 출력 한도를 늘리면 Claude는 스트리밍으로, Gemini는 넉넉히 기다립니다."""

import types

import pytest

from mrk_typeless import gemini, llm
from mrk_typeless.config import DEFAULTS


class FakeMessages:
    def __init__(self, log):
        self.log = log

    def _message(self):
        return types.SimpleNamespace(stop_reason="end_turn", content=[types.SimpleNamespace(type="text", text="정리된 글")])

    def create(self, **params):
        self.log.append(("create", params))
        return self._message()

    def stream(self, **params):
        self.log.append(("stream", params))
        outer = self

        class Stream:
            def __iter__(self):
                for i in range(3):
                    outer.log.append(("event", i))
                    yield types.SimpleNamespace(type="content_block_delta")

            def get_final_message(self):
                return outer._message()

        class Ctx:
            def __enter__(self):
                return Stream()

            def __exit__(self, *exc):
                outer.log.append(("closed", None))
                return False

        return Ctx()


@pytest.fixture
def claude(monkeypatch):
    log = []

    def make_client(api_key, max_retries, timeout):
        log.append(("client", {"timeout": timeout}))
        return types.SimpleNamespace(beta=types.SimpleNamespace(messages=FakeMessages(log)))

    monkeypatch.setattr(llm.anthropic, "Anthropic", make_client)
    return log


def test_short_polish_uses_a_normal_request(claude):
    cfg = {**DEFAULTS, "claude_api_key": "sk-ant"}
    assert llm.run_ai("sys", "짧은 글", cfg) == "정리된 글"
    assert [k for k, _ in claude] == ["client", "create"]
    assert claude[1][1]["max_tokens"] == 16000 and claude[0][1]["timeout"] == 90


def test_long_polish_streams_with_a_bigger_budget(claude):
    cfg = {**DEFAULTS, "claude_api_key": "sk-ant"}
    assert llm.run_ai("sys", "가" * 30000, cfg, max_tokens=64000) == "정리된 글"
    kind, params = claude[1]
    assert kind == "stream" and params["max_tokens"] == 64000 and params["fallbacks"] == "default"
    assert claude[0][1]["timeout"] == 900


def test_cancel_stops_a_long_claude_stream(claude):
    """멈추기를 누르면 스트리밍을 끊어 더 쓰지 않게 합니다 (요금이 계속 나오지 않게)."""
    import threading

    cancel = threading.Event()
    cancel.set()
    cfg = {**DEFAULTS, "claude_api_key": "sk-ant"}
    with pytest.raises(llm.LlmError, match="멈췄습니다"):
        llm.run_ai("sys", "가" * 30000, cfg, max_tokens=64000, cancel=cancel)
    assert ("event", 0) in claude and ("event", 1) not in claude and ("closed", None) in claude


def test_long_gemini_polish_waits_longer(monkeypatch):
    seen = {}

    def fake_generate(model, key, body, what, timeout=90):
        seen.update(timeout=timeout, max_tokens=body["generationConfig"]["maxOutputTokens"])
        return {"candidates": [{"content": {"parts": [{"text": "정리"}]}, "finishReason": "STOP"}]}

    monkeypatch.setattr(gemini, "generate", fake_generate)
    llm.run_gemini("sys", "긴 글", {**DEFAULTS, "gemini_api_key": "AIza"}, max_tokens=50000)
    assert seen == {"timeout": 900, "max_tokens": 50000}


def test_truncated_long_polish_is_kept_when_allowed(monkeypatch, claude):
    """녹음 파일 정리는 출력 한도에 걸려도 정리한 데까지 살립니다 (말로 입력할 때는 지금처럼 알림)."""

    def cut(model, key, body, what, timeout=90):
        return {"candidates": [{"content": {"parts": [{"text": "앞부분"}]}, "finishReason": "MAX_TOKENS"}]}

    monkeypatch.setattr(gemini, "generate", cut)
    cfg = {**DEFAULTS, "gemini_api_key": "AIza"}
    with pytest.raises(llm.LlmError):
        llm.run_gemini("sys", "글", cfg)
    assert llm.run_gemini("sys", "글", cfg, allow_partial=True) == "앞부분" + llm.PARTIAL_NOTE


def test_history_with_long_file_transcripts_stays_small(tmp_path, monkeypatch):
    from mrk_typeless import config

    monkeypatch.setattr(config, "APP_DIR", tmp_path)
    monkeypatch.setattr(config, "HISTORY_PATH", tmp_path / "history.jsonl")
    for i in range(12):
        config.append_history({"kind": "file", "raw": "가" * 100_000, "result": str(i)})
    size = (tmp_path / "history.jsonl").stat().st_size
    assert size <= config.HISTORY_MAX_BYTES
    assert '"result": "11"' in (tmp_path / "history.jsonl").read_text(encoding="utf-8")  # 가장 최근 것은 남음
