"""녹음 받아쓰기: 녹음한 WAV를 받아쓰기 API로 보내 글자로 바꿉니다 (웹앱 transcribe.ts와 같은 방식)."""

import re

import requests

from . import gemini

LANG_NAMES = {"ko": "한국어", "en": "영어", "ja": "일본어", "zh": "중국어"}


class SttError(Exception):
    """받아쓰기 실패. kind가 key·credit·blocked·permission이면 Gemini로 넘겨 다시 받아쓸 수 있습니다."""

    def __init__(self, message: str, kind: str = "other"):
        super().__init__(message)
        self.kind = kind


SWITCHABLE = {"key", "credit", "blocked", "permission"}
SWITCH_TIP = " 설정 → 받아쓰기 서비스를 Gemini로 바꾸면 Gemini 키 하나로 받아씁니다."


def can_switch(e: Exception) -> bool:
    """다른 받아쓰기 서비스(Gemini)로 넘기면 될 실패인지"""
    return isinstance(e, SttError) and e.kind in SWITCHABLE


def stt_failure(provider: str, status: int, body) -> SttError:
    """ElevenLabs·OpenAI가 보낸 오류 본문을 읽어 진짜 이유를 알려 줍니다 (웹앱 transcribe.ts의 sttFailure와 같음).

    ElevenLabs는 키가 틀릴 때뿐 아니라 크레딧이 떨어지거나(quota_exceeded) 무료 계정을 막을 때도
    (detected_unusual_activity) 401을 보냅니다. 예전에는 401이면 무조건 '키가 맞지 않습니다'라고 했습니다.
    """
    name = "ElevenLabs" if provider == "elevenlabs" else "OpenAI"
    body = body if isinstance(body, dict) else {}
    detail = body.get("detail") if isinstance(body.get("detail"), dict) else {}
    error = body.get("error") if isinstance(body.get("error"), dict) else {}
    if provider == "elevenlabs":
        code = str(detail.get("status") or "").lower()
        raw = detail.get("message") or (body.get("detail") if isinstance(body.get("detail"), str) else "")
    else:
        code = str(error.get("code") or error.get("type") or "").lower()
        raw = error.get("message") or ""
    server_said = f" ({name}: {str(raw).strip()[:160]})" if isinstance(raw, str) and raw.strip() else ""
    site = "elevenlabs.io" if provider == "elevenlabs" else "platform.openai.com"

    if re.search(r"quota|insufficient_quota|credit|payment|billing", code) or status == 402:
        return SttError(f"{name} 크레딧(잔액)이 다 떨어졌습니다. {site}에서 충전하거나,{SWITCH_TIP}", "credit")
    if code == "detected_unusual_activity":
        return SttError(f"{name}가 이 무료 계정의 사용을 막았습니다(이상 사용 감지). VPN을 쓰고 있다면 끄거나 유료 요금제가 필요합니다.{SWITCH_TIP}", "blocked")
    if code in ("missing_permissions", "insufficient_permissions"):
        return SttError(f"이 {name} 키에는 받아쓰기(Speech to Text) 권한이 없습니다. {name}의 API 키 설정에서 권한을 켜 주세요.{SWITCH_TIP}", "permission")
    if code == "unsupported_country_region_territory":
        return SttError(f"{name}가 지금 접속한 지역에서는 쓸 수 없다고 합니다. VPN을 쓰고 있다면 꺼 주세요.{SWITCH_TIP}", "blocked")
    if re.search(r"invalid_api_key|needs_authorization|invalid_authorization|unauthorized", code) or status == 401:
        return SttError(f"{name} API 키가 맞지 않습니다. 설정에서 키를 다시 붙여넣어 주세요.{SWITCH_TIP}", "key")
    if status == 403:
        return SttError(f"{name}가 이 키의 받아쓰기 요청을 거절했습니다{server_said}.{SWITCH_TIP}", "permission")
    if status == 429 or re.search(r"rate_limit|too_many|system_busy", code):
        return SttError(f"{name}에 요청이 몰려 잠시 막혔습니다. 조금 뒤 다시 말해 주세요.", "busy")
    if status == 413:
        return SttError("녹음이 너무 깁니다. 나눠서 말해 주세요.")
    if status >= 500:
        return SttError(f"{name} 받아쓰기 서버가 잠시 멈췄습니다. 조금 뒤 다시 말해 주세요.", "busy")
    return SttError(f"받아쓰기 중 오류가 났습니다 ({status}){server_said}. 다시 말해 주세요.")


def transcribe(wav: bytes, provider: str, api_key: str, lang: str = "ko", hints: list[str] | None = None) -> str:
    if not api_key.strip():
        raise SttError("받아쓰기 API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")
    if provider == "gemini":
        return _transcribe_gemini(wav, api_key, lang, hints or [])

    files = {"file": ("speech.wav", wav, "audio/wav")}
    if provider == "openai":
        url = "https://api.openai.com/v1/audio/transcriptions"
        headers = {"Authorization": f"Bearer {api_key.strip()}"}
        data = {"model": "gpt-4o-transcribe", "language": lang, "response_format": "json"}
    else:
        url = "https://api.elevenlabs.io/v1/speech-to-text"
        headers = {"xi-api-key": api_key.strip()}
        data = {"model_id": "scribe_v2", "language_code": lang, "tag_audio_events": "false"}

    try:
        res = requests.post(url, headers=headers, data=data, files=files, timeout=60)
    except requests.RequestException as e:
        raise SttError("받아쓰기 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.") from e

    if not res.ok:
        try:
            body = res.json()
        except ValueError:
            body = None
        raise stt_failure(provider, res.status_code, body)

    try:
        text = res.json().get("text", "")
    except ValueError as e:
        raise SttError("받아쓰기 결과를 읽지 못했습니다. 다시 말해 주세요.") from e
    return text.strip() if isinstance(text, str) else ""


def gemini_prompt(lang: str, hints: list[str]) -> str:
    language = LANG_NAMES.get(lang, lang)
    lines = [
        f"이 녹음을 {language}로 들리는 그대로 받아쓰세요.",
        "말을 고치거나 요약하지 말고, '음', '어' 같은 말과 고쳐 말한 부분도 그대로 적으세요.",
        "받아쓴 글만 출력하세요. 말소리가 없으면 아무것도 출력하지 마세요.",
    ]
    if hints:
        lines.append("이런 용어가 나올 수 있습니다: " + ", ".join(hints[:100]))
    return "\n".join(lines)


def _transcribe_gemini(wav: bytes, api_key: str, lang: str, hints: list[str]) -> str:
    """Gemini는 받아쓰기 전용 주소가 없어, 녹음을 그대로 넣고 들리는 대로 적으라고 부탁합니다."""
    body = gemini.build_body([{"text": gemini_prompt(lang, hints)}, gemini.audio_part(wav)], gemini.STT_MODEL, "low", max_tokens=8192)
    try:
        data = gemini.generate(gemini.STT_MODEL, api_key, body, "받아쓰기", timeout=60)
    except gemini.GeminiError as e:
        raise SttError(str(e)) from e
    if gemini.is_blocked(data):
        raise SttError("Gemini가 이 녹음을 받아쓰지 않았습니다. 다시 말해 주세요.")
    if gemini.is_truncated(data):
        raise SttError("녹음이 너무 길어 끝까지 받아쓰지 못했습니다. 나눠서 말해 주세요.")
    return gemini.text_of(data).strip()
