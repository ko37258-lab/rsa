"""녹음 받아쓰기: 녹음한 WAV를 받아쓰기 API로 보내 글자로 바꿉니다 (웹앱 transcribe.ts와 같은 방식)."""

import requests

from . import gemini

LANG_NAMES = {"ko": "한국어", "en": "영어", "ja": "일본어", "zh": "중국어"}


class SttError(Exception):
    pass


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

    if res.status_code in (401, 403):
        raise SttError("받아쓰기 API 키가 맞지 않습니다. 설정에서 키를 확인해 주세요.")
    if res.status_code in (402, 429):
        raise SttError("받아쓰기 사용량 한도에 닿았습니다. 잠시 뒤 다시 하거나 요금제를 확인해 주세요.")
    if res.status_code == 413:
        raise SttError("녹음이 너무 깁니다. 나눠서 말해 주세요.")
    if not res.ok:
        raise SttError(f"받아쓰기 중 오류가 났습니다 ({res.status_code}). 다시 말해 주세요.")

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
