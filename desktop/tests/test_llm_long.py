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

        class Ctx:
            def __enter__(self):
                return types.SimpleNamespace(get_final_message=outer._message)

            def __exit__(self, *exc):
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


def test_long_gemini_polish_waits_longer(monkeypatch):
    seen = {}

    def fake_generate(model, key, body, what, timeout=90):
        seen.update(timeout=timeout, max_tokens=body["generationConfig"]["maxOutputTokens"])
        return {"candidates": [{"content": {"parts": [{"text": "정리"}]}, "finishReason": "STOP"}]}

    monkeypatch.setattr(gemini, "generate", fake_generate)
    llm.run_gemini("sys", "긴 글", {**DEFAULTS, "gemini_api_key": "AIza"}, max_tokens=50000)
    assert seen == {"timeout": 900, "max_tokens": 50000}
