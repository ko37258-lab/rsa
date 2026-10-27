"""AI로 정리하기: Claude(공식 Anthropic Python SDK) 또는 Gemini(REST)."""

import math
import re

import anthropic

from . import gemini
from .config import polish_engine


class LlmError(Exception):
    pass


TRUNCATED_MESSAGE = "글이 너무 길어 끝까지 정리하지 못했습니다. 나눠서 말해 주세요."
# 보통 정리의 출력 한도. 이보다 크게 잡는 긴 글(녹음 파일)은 Claude를 스트리밍으로 부릅니다.
DEFAULT_MAX_TOKENS = 16000


def output_budget(text: str) -> int:
    """정리 결과의 출력 한도 (웹앱 engine.ts의 outputBudget과 같음). 짧은 글은 16,000토큰, 1시간 강의 녹음처럼
    긴 원문은 길이에 맞춰 64,000까지 늘립니다 (Claude 5.5는 스트리밍으로 128K까지, Gemini는 65,536까지 받습니다)."""
    return min(64000, max(DEFAULT_MAX_TOKENS, math.ceil(len(text) * 2.5)))


def run_ai(system: str, user: str, cfg: dict, max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    """설정에서 고른 AI로 정리합니다. 키가 없으면 LlmError."""
    engine = polish_engine(cfg)
    if engine == "gemini":
        return run_gemini(system, user, cfg, max_tokens)
    if engine == "claude":
        return run_claude(system, user, cfg, max_tokens)
    raise LlmError("AI 키가 없습니다. 트레이 아이콘 → 설정에서 Gemini나 Claude 키를 넣어 주세요.")


def run_gemini(system: str, user: str, cfg: dict, max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    api_key = (cfg.get("gemini_api_key") or "").strip()
    if not api_key:
        raise LlmError("Gemini API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")
    model = cfg.get("gemini_model") or "gemini-3.8-flash"
    body = gemini.build_body([{"text": user}], model, cfg.get("effort") or "low", system=system, max_tokens=max_tokens)
    try:
        # 긴 글은 정리하는 데 몇 분 걸리므로 기다리는 시간을 늘립니다.
        data = gemini.generate(model, api_key, body, "정리", timeout=90 if max_tokens <= DEFAULT_MAX_TOKENS else 900)
    except gemini.GeminiError as e:
        raise LlmError(str(e)) from e
    text = gemini.text_of(data).strip()
    if gemini.is_blocked(data):
        raise LlmError("Gemini가 이 내용을 정리하지 않았습니다. 내용을 바꿔 다시 해 주세요.")
    if not text:
        raise LlmError("정리된 글이 비어 있습니다. 조금 더 길게 말해 주세요.")
    if gemini.is_truncated(data):
        raise LlmError(TRUNCATED_MESSAGE)
    return text


def run_claude(system: str, user: str, cfg: dict, max_tokens: int = DEFAULT_MAX_TOKENS) -> str:
    api_key = (cfg.get("claude_api_key") or "").strip()
    if not api_key:
        raise LlmError("Claude API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")

    model = cfg.get("model") or "claude-opus-5-5"
    long = max_tokens > DEFAULT_MAX_TOKENS
    client = anthropic.Anthropic(api_key=api_key, max_retries=1, timeout=900 if long else 90)
    # 안전 분류기가 거절하면 서버가 알맞은 모델로 다시 실행합니다 (Haiku 5.5는 지원하지 않음).
    fallback = {} if model == "claude-haiku-5-5" else {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    params = {
        "model": model,
        "max_tokens": max_tokens,
        "system": system,
        "messages": [{"role": "user", "content": user}],
        "output_config": {"effort": cfg.get("effort") or "low"},
        **fallback,
    }

    try:
        if long:
            # 출력 한도가 큰 요청은 SDK가 스트리밍을 요구합니다 (오래 걸리는 요청이 중간에 끊기지 않게).
            with client.beta.messages.stream(**params) as stream:
                message = stream.get_final_message()
        else:
            message = client.beta.messages.create(**params)
    except anthropic.AuthenticationError as e:
        raise LlmError("Claude API 키가 맞지 않습니다. 설정에서 키를 확인해 주세요.") from e
    except anthropic.PermissionDeniedError as e:
        raise LlmError("이 API 키로는 고른 모델을 쓸 수 없습니다. 설정에서 다른 모델을 골라 주세요.") from e
    except anthropic.NotFoundError as e:
        raise LlmError("모델을 찾지 못했습니다. 설정에서 다른 모델을 골라 주세요.") from e
    except anthropic.RateLimitError as e:
        raise LlmError("요청이 많아 잠시 막혔습니다. 조금 뒤 다시 해 주세요.") from e
    except anthropic.BadRequestError as e:
        # 크레딧이 떨어지면 Claude는 400으로 "credit balance is too low"를 보냅니다.
        if re.search(r"credit balance|billing", str(e.message), re.IGNORECASE):
            raise LlmError(
                "Claude 크레딧(잔액)이 다 떨어졌습니다. console.anthropic.com → Plans & Billing에서 충전하거나, 설정에서 정리 AI를 Gemini로 바꿔 주세요."
            ) from e
        raise LlmError(f"요청이 거절되었습니다: {e.message}") from e
    except anthropic.APIStatusError as e:
        raise LlmError(f"Claude 오류 ({e.status_code}). 조금 뒤 다시 해 주세요.") from e
    except anthropic.APIConnectionError as e:
        raise LlmError("Claude 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.") from e

    if message.stop_reason == "refusal":
        raise LlmError("Claude가 이 내용을 정리하지 않았습니다. 내용을 바꿔 다시 해 주세요.")
    text = "".join(block.text for block in message.content if block.type == "text").strip()
    if not text:
        raise LlmError("정리된 글이 비어 있습니다. 조금 더 길게 말해 주세요.")
    # 출력 한도에 걸려 중간에 끊긴 글은 붙여넣지 않고 알립니다.
    if message.stop_reason == "max_tokens":
        raise LlmError(TRUNCATED_MESSAGE)
    return text
