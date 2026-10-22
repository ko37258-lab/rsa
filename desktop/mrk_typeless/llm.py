"""AI로 정리하기: Claude(공식 Anthropic Python SDK) 또는 Gemini(REST)."""

import anthropic

from . import gemini
from .config import polish_engine


class LlmError(Exception):
    pass


TRUNCATED_MESSAGE = "글이 너무 길어 끝까지 정리하지 못했습니다. 나눠서 말해 주세요."


def run_ai(system: str, user: str, cfg: dict) -> str:
    """설정에서 고른 AI로 정리합니다. 키가 없으면 LlmError."""
    engine = polish_engine(cfg)
    if engine == "gemini":
        return run_gemini(system, user, cfg)
    if engine == "claude":
        return run_claude(system, user, cfg)
    raise LlmError("AI 키가 없습니다. 트레이 아이콘 → 설정에서 Gemini나 Claude 키를 넣어 주세요.")


def run_gemini(system: str, user: str, cfg: dict) -> str:
    api_key = (cfg.get("gemini_api_key") or "").strip()
    if not api_key:
        raise LlmError("Gemini API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")
    model = cfg.get("gemini_model") or "gemini-3.8-flash"
    body = gemini.build_body([{"text": user}], model, cfg.get("effort") or "low", system=system)
    try:
        data = gemini.generate(model, api_key, body, "정리")
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


def run_claude(system: str, user: str, cfg: dict) -> str:
    api_key = (cfg.get("claude_api_key") or "").strip()
    if not api_key:
        raise LlmError("Claude API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")

    model = cfg.get("model") or "claude-opus-5-5"
    client = anthropic.Anthropic(api_key=api_key, max_retries=1, timeout=90)
    # 안전 분류기가 거절하면 서버가 알맞은 모델로 다시 실행합니다 (Haiku 5.5는 지원하지 않음).
    fallback = {} if model == "claude-haiku-5-5" else {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}

    try:
        message = client.beta.messages.create(
            model=model,
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": user}],
            output_config={"effort": cfg.get("effort") or "low"},
            **fallback,
        )
    except anthropic.AuthenticationError as e:
        raise LlmError("Claude API 키가 맞지 않습니다. 설정에서 키를 확인해 주세요.") from e
    except anthropic.PermissionDeniedError as e:
        raise LlmError("이 API 키로는 고른 모델을 쓸 수 없습니다. 설정에서 다른 모델을 골라 주세요.") from e
    except anthropic.NotFoundError as e:
        raise LlmError("모델을 찾지 못했습니다. 설정에서 다른 모델을 골라 주세요.") from e
    except anthropic.RateLimitError as e:
        raise LlmError("요청이 많아 잠시 막혔습니다. 조금 뒤 다시 해 주세요.") from e
    except anthropic.BadRequestError as e:
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
