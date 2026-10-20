"""녹음 받아쓰기: 녹음한 WAV를 받아쓰기 API로 보내 글자로 바꿉니다 (웹앱 transcribe.ts와 같은 방식)."""

import requests


class SttError(Exception):
    pass


def transcribe(wav: bytes, provider: str, api_key: str, lang: str = "ko") -> str:
    if not api_key.strip():
        raise SttError("받아쓰기 API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")

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
