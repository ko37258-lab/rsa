"""Google Gemini API 호출 (SDK 없이 requests만 씀). 정리와 받아쓰기가 함께 씁니다."""

import base64

import requests

BASE = "https://generativelanguage.googleapis.com/v1beta/models"
# 녹음을 글자로 바꿀 때 쓰는 모델 (정리 모델과 따로, 빠르고 정확한 쪽으로 고정)
STT_MODEL = "gemini-3.8-flash"

# 모델마다 고를 수 있는 가장 낮은 생각 단계가 다릅니다 (Flash-Lite만 MINIMAL 가능).
_FASTEST = {"gemini-3.8-flash": "LOW", "gemini-4-argon": "LOW", "gemini-3.5-flash-lite": "MINIMAL"}
_BLOCKED = {"SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"}


class GeminiError(Exception):
    pass


def thinking_level(model: str, effort: str) -> str:
    """설정의 '생각하는 정도'를 Gemini의 thinkingLevel로 바꿉니다."""
    return "MEDIUM" if effort == "medium" else _FASTEST.get(model, "LOW")


def failure_message(status: int, reason: str, message: str, what: str) -> str:
    if reason == "API_KEY_INVALID" or status == 401:
        return "Gemini API 키가 맞지 않습니다. 설정에서 키를 확인해 주세요."
    if reason in ("API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED"):
        return "이 Gemini 키는 다른 웹사이트·주소에서만 쓰도록 제한돼 있습니다. Google AI Studio에서 제한 없는 키를 새로 만들어 넣어 주세요."
    if reason == "FAILED_PRECONDITION" or "location is not supported" in message.lower():
        return "Gemini가 지금 접속한 지역에서는 쓸 수 없다고 합니다. VPN을 쓰고 있다면 꺼 주세요."
    if status == 403:
        return "이 Gemini API 키로는 쓸 수 없습니다. Google AI Studio에서 키를 확인해 주세요."
    if status == 404:
        if what == "받아쓰기":
            return f"받아쓰기용 Gemini 모델({STT_MODEL})을 이 키로 쓸 수 없습니다. 설정에서 다른 받아쓰기 서비스를 골라 주세요."
        return "Gemini 모델을 찾지 못했습니다. 설정에서 다른 Gemini 모델을 골라 주세요."
    if status == 429:
        return "Gemini 사용량 한도에 닿았습니다. 무료 등급은 1분·하루 한도가 있으니 잠시 뒤 다시 하거나, Google AI Studio에서 결제를 켜 한도를 늘려 주세요."
    if status == 413 or "payload size" in message.lower():
        return "녹음이 너무 깁니다. 나눠서 말해 주세요."
    if status >= 500:
        return f"Gemini 서버가 바쁩니다. 잠시 뒤 다시 {what}해 주세요."
    return f"Gemini가 요청을 거절했습니다 ({status}){': ' + message if message else ''}"


def text_of(data: dict) -> str:
    """응답에서 생각(thought)을 뺀 글만 꺼냅니다."""
    parts = ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts") or []
    return "".join(p.get("text", "") for p in parts if not p.get("thought") and isinstance(p.get("text"), str))


def finish_reason(data: dict) -> str:
    return (data.get("candidates") or [{}])[0].get("finishReason") or ""


def is_truncated(data: dict) -> bool:
    """출력 한도에 걸려 끝까지 쓰지 못했는지"""
    return finish_reason(data) == "MAX_TOKENS"


def is_blocked(data: dict) -> bool:
    if (data.get("promptFeedback") or {}).get("blockReason"):
        return True
    return (data.get("candidates") or [{}])[0].get("finishReason") in _BLOCKED


def build_body(parts: list, model: str, effort: str, system: str | None = None, max_tokens: int = 16000) -> dict:
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"maxOutputTokens": max_tokens, "thinkingConfig": {"thinkingLevel": thinking_level(model, effort)}},
    }
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    return body


def audio_part(wav: bytes) -> dict:
    return {"inlineData": {"mimeType": "audio/wav", "data": base64.b64encode(wav).decode("ascii")}}


def generate(model: str, api_key: str, body: dict, what: str, timeout: float = 90) -> dict:
    """generateContent를 부르고 응답 JSON을 돌려줍니다. 실패하면 알아듣기 쉬운 GeminiError."""
    url = f"{BASE}/{model}:generateContent"
    headers = {"content-type": "application/json", "x-goog-api-key": api_key.strip()}
    res = None
    # 서버가 잠깐 바쁠 때(5xx)만 한 번 더 시도합니다.
    for attempt in range(2):
        try:
            res = requests.post(url, headers=headers, json=body, timeout=timeout)
        except requests.RequestException as e:
            raise GeminiError("Gemini 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.") from e
        if res.status_code < 500 or attempt == 1:
            break
    assert res is not None
    if not res.ok:
        reason, message = "", ""
        try:
            err = res.json().get("error") or {}
            message = err.get("message") or ""
            reason = next((d.get("reason") for d in err.get("details") or [] if d.get("reason")), "") or err.get("status") or ""
        except ValueError:
            pass
        raise GeminiError(failure_message(res.status_code, reason, message, what))
    try:
        return res.json()
    except ValueError as e:
        raise GeminiError(f"Gemini 응답을 읽지 못했습니다. 다시 {what}해 주세요.") from e
