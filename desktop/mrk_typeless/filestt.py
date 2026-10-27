"""녹음 파일 받아쓰기: 휴대폰 녹음(m4a)·강의 녹음(mp3)·영상(mp4)을 글로 바꿉니다 (웹앱 transcribeFile.ts와 같은 방식).

- Gemini: 14MB 이하이고 길이를 아는 짧은 녹음은 요청에 바로 담고, 아니면 Files API로 올립니다.
  Files API는 구글 공식 SDK와 같은 방식입니다: resumable 시작 → x-goog-upload-url로 8MB씩 →
  'upload, finalize' → ACTIVE가 될 때까지 기다림. 다 쓰면(실패·멈춤 포함) 바로 지웁니다.
- 20분이 넘는 녹음은 같은 파일을 20분씩 나눠 받아쓰고 이어 붙입니다. 한 번에 시키면 출력 한도에 걸려 잘립니다.
  서버가 바쁘면(429·5xx) 잠시 뒤 다시 하고, 그래도 안 되는 중간 구간은 [표시]만 남기고 나머지를 이어 받아씁니다.
- ElevenLabs·OpenAI는 파일을 그대로 보냅니다. 크레딧·키 문제나 크기·길이 한도에 걸리면 Gemini 키로 넘깁니다.
- 멈추기(cancel)는 단계 사이마다 확인합니다. 이미 보낸 요청 하나는 끝날 때까지 기다리되 결과는 버립니다.
"""

import base64
import contextlib
import math
import os
import re
import threading
from collections.abc import Callable
from dataclasses import dataclass

import requests

from . import gemini, mediainfo, stt
from .stt import LANG_NAMES, SttError, can_switch

API_ROOT = "https://generativelanguage.googleapis.com"
# 요청에 바로 담을 수 있는 크기: 한 요청 20MB 한도에서 base64(×4/3)와 프롬프트 몫을 뺐습니다.
INLINE_MAX_BYTES = 14 * 1024 * 1024
# Files API로 한 번에 보내는 조각 (공식 SDK와 같음)
CHUNK_BYTES = 8 * 1024 * 1024
# 한 번에 받아쓰는 길이. 20분 말은 대개 6~8천 자라 출력 한도에 넉넉합니다.
SEGMENT_SECONDS = 20 * 60
# Gemini Files API 한 파일 한도
MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024
# OpenAI 받아쓰기 한도: 파일 25MB. gpt-4o-transcribe는 한 번에 2,000토큰까지만 돌려주므로
# 10분이 넘는 녹음은 뒷부분이 잘립니다 (길이 한도 1,500초보다 먼저 걸림).
OPENAI_MAX_BYTES = 25 * 1024 * 1024
OPENAI_MAX_SECONDS = 600
# ElevenLabs로 바로 보낼 때 파일을 통째로 메모리에 올리므로, 이보다 크면 Gemini로 올립니다 (ElevenLabs 한도는 3GB·10시간).
ELEVEN_MAX_BYTES = 1024 * 1024 * 1024
ELEVEN_MAX_SECONDS = 10 * 3600
# 서버가 바쁠 때 다시 해 보는 횟수, 이보다 오래 기다리라고 하면 기다리지 않는 한도
MAX_TRIES = 3
MAX_RETRY_WAIT = 60.0
RETRY_STATUS = {408, 429, 500, 502, 503, 504}
# 길이를 모르는 녹음은 올린 뒤 토큰 수로 길이를 셉니다. Gemini 3 모델은 오디오 1초를 25토큰으로 셉니다
# (예전 모델 문서는 32토큰). 조금 틀려도 마지막 구간을 '녹음이 끝날 때까지'로 받아쓰므로 빠뜨리지 않습니다.
AUDIO_TOKENS_PER_SECOND = 25

EXT_MIME = {
    ".m4a": "audio/m4a",
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".opus": "audio/ogg",
    ".flac": "audio/flac",
    ".aiff": "audio/aiff",
    ".aif": "audio/aiff",
    ".webm": "audio/webm",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mov": "video/mov",
}
FILE_TYPES = " ".join(f"*{ext}" for ext in EXT_MIME)


class Cancelled(Exception):
    """멈추기를 눌렀습니다."""


@dataclass
class Progress:
    stage: str  # upload | prepare | transcribe
    done: int = 0  # upload: 보낸 바이트, transcribe: 끝낸 구간 수
    total: int = 0


@dataclass
class FileTranscript:
    text: str
    # 다른 서비스로 넘겼으면 원래 서비스와 그 이유
    switched_from: str | None = None
    reason: str = ""
    # 크레딧·키·차단 문제라 앞으로도 Gemini를 쓰는 게 좋은지 (크기·길이 한도 때문이면 False)
    switch_for_good: bool = False
    # 받아쓰지 못하고 [표시]만 남긴 구간 수
    missed: int = 0
    # 녹음 길이(초). 모르면 None
    duration: float | None = None
    # 키·하루 한도 문제로 중간에서 멈췄으면 그 이유
    stopped: str = ""


ProgressFn = Callable[[Progress], None]


def file_mime(path: str) -> str | None:
    """확장자로 Gemini가 받는 형식을 정합니다. 녹음·영상이 아니면 None."""
    return EXT_MIME.get(os.path.splitext(path)[1].lower())


def clock(sec: float) -> str:
    """'mm:ss' (한 시간이 넘으면 분이 60을 넘습니다. Gemini 문서의 타임스탬프 형식)"""
    s = max(0, round(sec))
    return f"{s // 60:02d}:{s % 60:02d}"


def plan_segments(duration: float | None) -> list[tuple[float, float]]:
    """녹음을 20분씩 나눕니다. 25분까지는 한 번에(빈 목록), 마지막 조각이 2분보다 짧으면 앞 조각에 붙입니다."""
    if not duration or not math.isfinite(duration) or duration <= SEGMENT_SECONDS * 1.25:
        return []
    out = []
    start = 0.0
    while start < duration:
        out.append((start, min(duration, start + SEGMENT_SECONDS)))
        start += SEGMENT_SECONDS
    if len(out) > 1 and out[-1][1] - out[-1][0] < 120:
        out.pop()
        out[-1] = (out[-1][0], duration)
    return out


def file_prompt(lang: str, hints: list[str] | None = None, rng: tuple[float, float | None] | None = None) -> str:
    """받아쓰기 지시. rng의 끝이 None이면 '그 시각부터 녹음이 끝날 때까지'(마지막 구간: 길이를 조금 잘못 읽어도 끝을 놓치지 않게)."""
    language = LANG_NAMES.get(lang, lang)
    if rng is None:
        first = f"이 녹음을 처음부터 끝까지 {language}로 들리는 그대로 받아쓰세요."
    elif rng[1] is None:
        first = f"이 녹음의 {clock(rng[0])}부터 녹음이 끝날 때까지 {language}로 들리는 그대로 받아쓰세요. 그 앞부분은 적지 마세요."
    else:
        first = f"이 녹음의 {clock(rng[0])}부터 {clock(rng[1])}까지만 {language}로 들리는 그대로 받아쓰세요. 그 앞뒤 부분은 적지 마세요."
    lines = [
        first,
        "말을 고치거나 요약하지 마세요. 빠뜨리는 부분 없이 모두 적으세요.",
        "말하는 사람이 바뀌면 새 줄에서 시작하세요. 시간 표시나 설명은 붙이지 마세요.",
        "받아쓴 글만 출력하세요. 말소리가 없으면 아무것도 출력하지 마세요.",
    ]
    terms = (hints or [])[:100]
    if terms:
        lines.append("이런 용어가 나올 수 있습니다: " + ", ".join(terms))
    return "\n".join(lines)


# ---------- 공통 ----------

def _check(cancel: threading.Event | None) -> None:
    if cancel is not None and cancel.is_set():
        raise Cancelled()


def _sleep(seconds: float, cancel: threading.Event | None) -> None:
    """기다리는 중에도 멈추기를 누르면 바로 그만둡니다."""
    if cancel is None:
        threading.Event().wait(seconds)
    elif cancel.wait(seconds):
        raise Cancelled()


def _connection_error(e: Exception) -> SttError:
    return SttError("Gemini 서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.")


def _error_body(res: requests.Response) -> dict:
    try:
        err = res.json().get("error")
    except (ValueError, AttributeError):
        return {}
    return err if isinstance(err, dict) else {}


def _is_daily_quota(res: requests.Response) -> bool:
    """하루 한도(무료 등급의 …PerDay…)인지. 30초쯤 기다리라고 하지만 기다려도 오늘은 풀리지 않습니다."""
    err = _error_body(res)
    return res.status_code == 429 and bool(re.search(r"per ?day|daily", f"{err.get('message', '')} {err.get('details', '')}", re.IGNORECASE))


def _failure(res: requests.Response) -> SttError:
    err = _error_body(res)
    message = str(err.get("message") or "")
    reason = next((d.get("reason") for d in err.get("details") or [] if isinstance(d, dict) and d.get("reason")), "") or err.get("status") or ""
    if res.status_code == 400 and re.search(r"mime|unsupported|invalid argument.*(audio|file)", message, re.IGNORECASE):
        return SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 골라 주세요.")
    # 키·권한·하루 한도 문제는 다음 구간에서도 똑같이 막히므로 표시해 둡니다 (구간 받아쓰기를 거기서 멈춤).
    if res.status_code in (401, 403, 404) or "API_KEY" in str(reason):
        kind = "key"
    elif _is_daily_quota(res):
        kind = "quota"
    elif res.status_code == 429 or res.status_code >= 500:
        kind = "busy"
    else:
        kind = "other"
    return SttError(gemini.failure_message(res.status_code, str(reason), message, "받아쓰기"), kind)


def _stops_everything(e: Exception) -> bool:
    """이 이유로 실패한 구간 뒤로는 받아써 봐야 똑같이 막힙니다."""
    return isinstance(e, SttError) and e.kind in ("key", "quota")


def _retry_delay(res: requests.Response) -> float | None:
    """바쁘다는 응답이 알려 준 기다릴 시간(Retry-After나 RetryInfo의 "30s"). 없으면 None."""
    try:
        header = float(res.headers.get("retry-after") or 0)
    except ValueError:
        header = 0
    if header > 0:
        return header
    details = _error_body(res).get("details") or []
    text = next((d.get("retryDelay") for d in details if isinstance(d, dict) and d.get("retryDelay")), "")
    try:
        sec = float(str(text).rstrip("s"))
    except ValueError:
        return None
    return sec if sec > 0 else None


# ---------- Gemini Files API ----------

def upload(path: str, mime: str, api_key: str, on_progress: ProgressFn | None = None, cancel: threading.Event | None = None) -> dict:
    """Files API에 올리고 ACTIVE가 될 때까지 기다립니다. 돌려주는 값: {name, uri, mimeType, videoMetadata?}"""
    key = api_key.strip()
    size = os.path.getsize(path)
    _check(cancel)
    try:
        start = requests.post(
            f"{API_ROOT}/upload/v1beta/files",
            headers={
                "x-goog-api-key": key,
                "x-goog-upload-protocol": "resumable",
                "x-goog-upload-command": "start",
                "x-goog-upload-header-content-length": str(size),
                "x-goog-upload-header-content-type": mime,
            },
            json={"file": {"displayName": os.path.basename(path)[:120], "mimeType": mime}},
            timeout=60,
        )
    except requests.RequestException as e:
        raise _connection_error(e) from e
    if not start.ok:
        raise _failure(start)
    upload_url = start.headers.get("x-goog-upload-url")
    if not upload_url:
        raise SttError("Gemini에 파일을 올리지 못했습니다 (업로드 주소를 받지 못함). 잠시 뒤 다시 해 주세요.")

    offset, failures, last, finalized = 0, 0, None, False
    if on_progress:
        on_progress(Progress("upload", 0, size))
    with open(path, "rb") as f:
        while not finalized:
            _check(cancel)
            end = min(size, offset + CHUNK_BYTES)
            # 서버가 다 받았다고 했는데 마무리가 안 됐으면, 빈 'finalize'로 마무리만 합니다.
            command = "finalize" if offset >= size else "upload, finalize" if end >= size else "upload"
            f.seek(offset)
            chunk = f.read(end - offset) if command != "finalize" else b""
            try:
                res = requests.post(
                    upload_url,
                    headers={"x-goog-upload-command": command, "x-goog-upload-offset": str(offset)},
                    data=chunk,
                    timeout=300,
                )
            except requests.RequestException:
                res = None
            if res is not None and res.ok:
                last, offset, failures, finalized = res, end, 0, end >= size
                if on_progress:
                    on_progress(Progress("upload", offset, size))
                continue
            why = str(res.status_code) if res is not None else "연결 끊김"
            failures += 1
            if (res is not None and res.status_code not in RETRY_STATUS) or failures > 2:
                raise SttError(f"Gemini에 파일을 올리다 멈췄습니다 ({why}). 다시 해 주세요.")
            _sleep(2**failures, cancel)
            # 서버가 어디까지 받았는지 물어 그 자리부터 이어 올립니다 (조각이 반쯤 들어갔을 수 있습니다).
            q = _query_upload(upload_url)
            if q is not None and q.headers.get("x-goog-upload-status") == "final":
                last, offset, finalized = q, size, True
            elif q is not None and re.fullmatch(r"\d+", q.headers.get("x-goog-upload-size-received") or ""):
                offset = min(size, int(q.headers["x-goog-upload-size-received"]))

    try:
        info = (last.json() if last is not None else {}).get("file") or {}
    except ValueError:
        info = {}
    if not info.get("name") or not info.get("uri"):
        raise SttError("Gemini에 파일을 올렸지만 결과를 읽지 못했습니다. 다시 해 주세요.")

    # 올린 파일은 잠깐 'PROCESSING'이었다가 'ACTIVE'가 됩니다. 기다리다 멈추거나 실패하면 올린 녹음을 바로 지웁니다.
    if on_progress:
        on_progress(Progress("prepare", 0, 1))
    try:
        polls, misses = 0, 0  # misses: 잇달아 실패한 확인 (잠깐 끊기거나 바쁜 것은 몇 번 넘깁니다)
        while info.get("state") and info["state"] != "ACTIVE":
            if info["state"] == "FAILED":
                raise SttError("Gemini가 이 파일을 읽지 못했습니다. 다른 형식(mp3·m4a·wav)으로 바꿔 다시 해 주세요.")
            if polls > 150:
                raise SttError("Gemini가 파일을 준비하는 데 너무 오래 걸립니다. 잠시 뒤 다시 해 주세요.")
            polls += 1
            _sleep(2 * (misses + 1), cancel)
            try:
                res = requests.get(f"{API_ROOT}/v1beta/{info['name']}", headers={"x-goog-api-key": key}, timeout=30)
            except requests.RequestException as e:
                if misses >= 3:
                    raise _connection_error(e) from e
                misses += 1
                continue
            if res.ok:
                misses = 0
                info = {**info, **res.json()}
                continue
            if res.status_code not in RETRY_STATUS or misses >= 3:
                raise _failure(res)
            misses += 1
    except BaseException:
        delete(info["name"], key)
        raise
    return {"name": info["name"], "uri": info["uri"], "mimeType": info.get("mimeType") or mime, "videoMetadata": info.get("videoMetadata")}


def _query_upload(upload_url: str) -> requests.Response | None:
    """이어 올리기 전에 서버가 받은 크기를 묻습니다. 못 물으면 None."""
    try:
        res = requests.post(upload_url, headers={"x-goog-upload-command": "query"}, timeout=30)
    except requests.RequestException:
        return None
    return res if res.ok else None


def delete(name: str, api_key: str) -> None:
    """다 쓴 파일을 지웁니다 (48시간 뒤 저절로 지워지지만, 녹음이므로 바로 지웁니다). 실패해도 괜찮습니다."""
    with contextlib.suppress(requests.RequestException):
        requests.delete(f"{API_ROOT}/v1beta/{name}", headers={"x-goog-api-key": api_key.strip()}, timeout=15)


def _duration_from_gemini(info: dict, mime: str, api_key: str) -> float | None:
    """파일 머리로 길이를 못 읽은 녹음(ogg·webm 등): 영상은 Gemini가 적어 준 길이, 녹음은 토큰 수 ÷ 32."""
    video = info.get("videoMetadata") or {}
    m = re.fullmatch(r"([\d.]+)s", str(video.get("videoDuration") or ""))
    if m:
        return float(m.group(1))
    if not mime.startswith("audio/"):
        return None
    try:
        res = requests.post(
            f"{API_ROOT}/v1beta/models/{gemini.STT_MODEL}:countTokens",
            headers={"content-type": "application/json", "x-goog-api-key": api_key.strip()},
            json={"contents": [{"role": "user", "parts": [{"fileData": {"mimeType": info["mimeType"], "fileUri": info["uri"]}}]}]},
            timeout=60,
        )
        tokens = int(res.json().get("totalTokens") or 0) if res.ok else 0
    except (requests.RequestException, ValueError, TypeError):
        return None
    return tokens / AUDIO_TOKENS_PER_SECOND if tokens > 0 else None


def _generate(parts: list, api_key: str, cancel: threading.Event | None, config: dict | None = None) -> tuple[str, bool]:
    """한 번 받아씁니다: (글, 출력 한도에 걸려 잘렸는지). 서버가 바쁘면(429·5xx·연결 끊김) 잠시 뒤 두 번까지 더 해 봅니다."""
    body = gemini.build_body(parts, gemini.STT_MODEL, "low", max_tokens=32768)
    body["generationConfig"].update(config or {})
    url = f"{API_ROOT}/v1beta/models/{gemini.STT_MODEL}:generateContent"
    headers = {"content-type": "application/json", "x-goog-api-key": api_key.strip()}
    for attempt in range(1, MAX_TRIES + 1):
        _check(cancel)
        try:
            res = requests.post(url, headers=headers, json=body, timeout=600)
        except requests.RequestException as e:
            if attempt >= MAX_TRIES:
                raise _connection_error(e) from e
            _sleep(2 * 2 ** (attempt - 1), cancel)
            continue
        if res.ok:
            try:
                data = res.json()
            except ValueError as e:
                raise SttError("받아쓰기 결과를 읽지 못했습니다. 다시 해 주세요.") from e
            if gemini.is_blocked(data):
                raise SttError("Gemini가 이 녹음을 받아쓰지 않았습니다.")
            return gemini.text_of(data).strip(), gemini.is_truncated(data)
        if res.status_code not in RETRY_STATUS or attempt >= MAX_TRIES:
            raise _failure(res)
        asked = _retry_delay(res)
        # 하루 한도이거나 오래 기다리라는 답이면 기다리지 않고 바로 알립니다.
        if _is_daily_quota(res) or (asked is not None and asked > MAX_RETRY_WAIT):
            raise _failure(res)
        _sleep(asked if asked is not None else 2 * 2 ** (attempt - 1), cancel)
    raise SttError("받아쓰기에 실패했습니다. 다시 해 주세요.")  # 위 반복문에서 항상 끝나지만 형식상 남겨 둡니다


def _with_cut(text: str, truncated: bool, where: str) -> str:
    """잘린 받아쓰기는 버리지 않고 받은 데까지 쓰되, 어디가 빠졌는지 글 안에 표시합니다."""
    return f"{text}\n[{where} 뒷부분은 너무 길어 받아쓰지 못했습니다]".strip() if truncated else text


def transcribe_with_gemini(
    path: str,
    api_key: str,
    lang: str,
    hints: list[str] | None = None,
    duration: float | None = None,
    on_progress: ProgressFn | None = None,
    cancel: threading.Event | None = None,
) -> FileTranscript:
    """Gemini로 파일을 받아씁니다."""
    mime = file_mime(path)
    if not mime:
        raise SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 골라 주세요.")
    size = os.path.getsize(path)
    if size > MAX_FILE_BYTES:
        raise SttError("파일이 2GB보다 큽니다. 나눠서 올려 주세요.")
    video = mime.startswith("video/")
    # 영상은 말소리만 받아쓰면 되므로 화면을 낮은 해상도로 봅니다 (긴 강의 영상도 입력 한도에 걸리지 않게).
    config = {"mediaResolution": "MEDIA_RESOLUTION_LOW"} if video else {}
    segments = plan_segments(duration)

    def progress(stage: str, done: int, total: int) -> None:
        if on_progress:
            on_progress(Progress(stage, done, total))

    if size <= INLINE_MAX_BYTES and duration is not None and not segments:
        _check(cancel)
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode("ascii")
        progress("transcribe", 0, 1)
        text, cut = _generate([{"text": file_prompt(lang, hints)}, {"inlineData": {"mimeType": mime, "data": data}}], api_key, cancel, config)
        progress("transcribe", 1, 1)
        return FileTranscript(_with_cut(text, cut, "녹음"), missed=int(cut), duration=duration)

    info = upload(path, mime, api_key, on_progress, cancel)
    try:
        if duration is None:
            duration = _duration_from_gemini(info, mime, api_key)
            segments = plan_segments(duration)
        part = {"fileData": {"mimeType": info["mimeType"], "fileUri": info["uri"]}}
        if not segments:
            progress("transcribe", 0, 1)
            text, cut = _generate([{"text": file_prompt(lang, hints)}, part], api_key, cancel, config)
            progress("transcribe", 1, 1)
            return FileTranscript(_with_cut(text, cut, "녹음"), missed=int(cut), duration=duration)
        pieces, missed, stopped = [], 0, ""
        for i, (start, end) in enumerate(segments):
            progress("transcribe", i, len(segments))
            last = i == len(segments) - 1
            where = f"{clock(start)} 이후" if last else f"{clock(start)}~{clock(end)}"
            try:
                if video:
                    # 영상은 그 구간만 잘라 보내고(videoMetadata), 녹음은 같은 파일에서 시간으로 구간을 짚습니다.
                    clip = {"startOffset": f"{round(start)}s", **({} if last else {"endOffset": f"{round(end)}s"})}
                    text, cut = _generate([{"text": file_prompt(lang, hints)}, {**part, "videoMetadata": clip}], api_key, cancel, config)
                else:
                    text, cut = _generate([{"text": file_prompt(lang, hints, (start, None if last else end))}, part], api_key, cancel, config)
            except SttError as e:
                # 첫 구간부터 안 되면 그대로 알리고, 중간에 한 구간만 안 되면 표시를 남기고 이어 갑니다.
                # 키·하루 한도 문제는 뒤 구간도 똑같이 막히므로 거기서 멈추고, 받은 데까지만 돌려줍니다.
                if i == 0:
                    raise
                if _stops_everything(e):
                    pieces.append(f"[{clock(start)} 이후는 받아쓰지 못했습니다]")
                    missed += len(segments) - i
                    stopped = str(e)
                    break
                pieces.append(f"[{where} 구간은 받아쓰지 못했습니다]")
                missed += 1
                continue
            pieces.append(_with_cut(text, cut, f"{where} 구간"))
            missed += int(cut)
        progress("transcribe", len(segments), len(segments))
        return FileTranscript("\n\n".join(p for p in pieces if p), missed=missed, duration=duration, stopped=stopped)
    finally:
        delete(info["name"], api_key)


# ---------- 고른 서비스로 받아쓰고, 안 되면 Gemini로 ----------

def transcribe_file(
    path: str,
    provider: str,
    api_key: str,
    lang: str,
    hints: list[str] | None = None,
    gemini_key: str = "",
    duration: float | None = None,
    on_progress: ProgressFn | None = None,
    cancel: threading.Event | None = None,
) -> FileTranscript:
    """녹음 파일을 글로 바꿉니다. 고른 받아쓰기 서비스로 하고, 크레딧·키·차단 문제나 크기·길이 한도에 걸리면
    Gemini 키가 있을 때 Gemini로 넘깁니다(넘긴 사실과 이유를 함께 돌려줍니다). duration을 모르면 파일 머리에서 읽습니다."""
    if not api_key.strip():
        raise SttError("받아쓰기 API 키가 없습니다. 트레이 아이콘 → 설정에서 넣어 주세요.")
    mime = file_mime(path)
    if not mime:
        raise SttError("이 파일 형식은 받아쓸 수 없습니다. m4a·mp3·wav·mp4 같은 녹음·영상 파일을 골라 주세요.")
    size = os.path.getsize(path)
    if size == 0:
        raise SttError("빈 파일입니다. 다른 녹음 파일을 골라 주세요.")
    if size > MAX_FILE_BYTES:
        raise SttError("파일이 2GB보다 큽니다. 나눠서 올려 주세요.")
    if duration is None:
        duration = mediainfo.duration_seconds(path)
    gemini_key = (gemini_key or "").strip()

    def via_gemini(switched_from: str | None = None, reason: str = "", for_good: bool = False) -> FileTranscript:
        out = transcribe_with_gemini(path, gemini_key if switched_from else api_key, lang, hints, duration, on_progress, cancel)
        out.switched_from, out.reason, out.switch_for_good = switched_from, reason, for_good
        return out

    if provider == "gemini":
        return via_gemini()

    limit = None
    if provider == "openai" and size > OPENAI_MAX_BYTES:
        limit = "OpenAI 받아쓰기는 25MB까지만 받습니다"
    elif provider == "openai" and (duration or 0) > OPENAI_MAX_SECONDS:
        limit = "OpenAI 받아쓰기는 10분이 넘는 녹음을 끝까지 받아쓰지 못합니다"
    elif provider == "elevenlabs" and size > ELEVEN_MAX_BYTES:
        limit = "ElevenLabs로 바로 보내기에는 파일이 너무 큽니다(1GB까지)"
    elif provider == "elevenlabs" and (duration or 0) > ELEVEN_MAX_SECONDS:
        limit = "ElevenLabs 받아쓰기는 10시간까지만 받습니다"
    if limit:
        if gemini_key:
            return via_gemini(provider, limit)
        raise SttError(f"{limit}. 설정에서 받아쓰기 서비스를 Gemini로 바꾸면 2GB까지 긴 녹음도 받아씁니다.")

    _check(cancel)
    if on_progress:
        on_progress(Progress("transcribe", 0, 1))
    with open(path, "rb") as f:
        data = f.read()
    try:
        text = stt.transcribe(
            data, provider, api_key, lang, hints=hints, filename=os.path.basename(path), mime=mime, timeout=1200
        )
    except SttError as e:
        if gemini_key and can_switch(e) and not (cancel is not None and cancel.is_set()):
            return via_gemini(provider, str(e).split(".")[0], True)
        raise
    _check(cancel)
    if on_progress:
        on_progress(Progress("transcribe", 1, 1))
    return FileTranscript(text, duration=duration)
