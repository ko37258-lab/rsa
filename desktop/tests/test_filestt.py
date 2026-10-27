"""녹음 파일 받아쓰기 (웹앱 transcribeFile.test.ts와 같은 경우들): Gemini Files API 올리기·구간 나누기·다시 하기·
멈추기·지우기, 그리고 ElevenLabs·OpenAI에서 Gemini로 넘기기. 진짜 서버 대신 가짜 requests를 씁니다."""

import json
import re
import threading
import wave

import pytest
import requests

from mrk_typeless import filestt
from mrk_typeless.filestt import (
    CHUNK_BYTES,
    INLINE_MAX_BYTES,
    Cancelled,
    clock,
    file_mime,
    file_prompt,
    plan_segments,
)
from mrk_typeless.stt import SttError

UPLOAD_URL = "https://upload.example/session-1"


def resp(status=200, body=None, headers=None):
    r = requests.Response()
    r.status_code = status
    r._content = b"" if body is None else json.dumps(body).encode()
    r.headers.update(headers or {})
    return r


class FakeServers:
    """Gemini·ElevenLabs·OpenAI를 흉내 냅니다. 받은 요청을 calls에 남깁니다."""

    def __init__(self, **opts):
        self.opts = opts
        self.calls = []
        self.generate_failures = list(opts.get("generate_failures", []))
        self.poll_failures = opts.get("poll_failures", 0)
        self.chunk_failed = False
        self.on_generate = opts.get("on_generate")

    def _record(self, method, url, headers=None, json_body=None, data=None):
        self.calls.append({"method": method, "url": url, "headers": {k.lower(): v for k, v in (headers or {}).items()}, "json": json_body, "data": data})

    def post(self, url, headers=None, json=None, data=None, files=None, timeout=None):
        self._record("POST", url, headers, json, data if files is None else files)
        o = self.opts
        h = {k.lower(): v for k, v in (headers or {}).items()}
        if "api.elevenlabs.io" in url:
            return resp(o.get("eleven_status", 200), o.get("eleven_body", {"text": "일레븐랩스가 받아쓴 글"}))
        if "api.openai.com" in url:
            return resp(200, {"text": "오픈에이아이가 받아쓴 글"})
        if url.endswith("/upload/v1beta/files"):
            return resp(200, {}, {"x-goog-upload-url": UPLOAD_URL, "x-goog-upload-status": "active"})
        if url == UPLOAD_URL:
            command = h.get("x-goog-upload-command")
            if command == "query":
                received = o.get("query_received", o.get("chunk_fail_at"))
                return resp(200, None, {"x-goog-upload-status": "active", "x-goog-upload-size-received": str(received)})
            if o.get("chunk_fail_at") is not None and h.get("x-goog-upload-offset") == str(o["chunk_fail_at"]) and not self.chunk_failed:
                self.chunk_failed = True
                return resp(503)
            if command in ("upload, finalize", "finalize"):
                f = {"name": "files/abc", "uri": "https://g/files/abc", "mimeType": o.get("mime", "audio/m4a"), "state": o.get("upload_state", "ACTIVE")}
                if o.get("video_duration"):
                    f["videoMetadata"] = {"videoDuration": o["video_duration"]}
                return resp(200, {"file": f}, {"x-goog-upload-status": "final"})
            return resp(200, None, {"x-goog-upload-status": "active"})
        if url.endswith(":countTokens"):
            return resp(200, {"totalTokens": o.get("tokens", 0)})
        if url.endswith(":generateContent"):
            if self.on_generate:
                self.on_generate()
            if self.generate_failures:
                status, body = self.generate_failures.pop(0)
                return resp(status, body or {"error": {"code": status, "message": "busy"}})
            prompt = json["contents"][0]["parts"][0]["text"]
            m = re.search(r"(\d\d+:\d\d)부터 (?:(\d\d+:\d\d)까지|녹음이 끝날 때까지)", prompt)
            if m and m.group(1) == o.get("fail_from"):
                return resp(400, {"error": {"code": 400, "message": "bad"}})
            text = f"구간 {m.group(1)}~{m.group(2) or '끝'}" if m else "제미나이가 받아쓴 글"
            return resp(200, {"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": o.get("finish", "STOP")}]})
        return resp(500, {"error": {"message": "unexpected " + url}})

    def get(self, url, headers=None, timeout=None):
        self._record("GET", url, headers)
        if self.poll_failures > 0:
            self.poll_failures -= 1
            return resp(503, {"error": {"code": 503, "message": "busy"}})
        return resp(200, {"name": "files/abc", "uri": "https://g/files/abc", "state": self.opts.get("poll_state", "ACTIVE")})

    def delete(self, url, headers=None, timeout=None):
        self._record("DELETE", url, headers)
        return resp(200, {})

    # 편의
    def generates(self):
        return [c for c in self.calls if c["url"].endswith(":generateContent")]

    def deleted(self):
        return any(c["method"] == "DELETE" and c["url"].endswith("/files/abc") for c in self.calls)

    def chunks(self):
        return [(c["headers"].get("x-goog-upload-command"), c["headers"].get("x-goog-upload-offset")) for c in self.calls if c["url"] == UPLOAD_URL]


@pytest.fixture
def server(monkeypatch):
    def make(**opts):
        fake = FakeServers(**opts)
        monkeypatch.setattr(filestt.requests, "post", fake.post)
        monkeypatch.setattr(filestt.requests, "get", fake.get)
        monkeypatch.setattr(filestt.requests, "delete", fake.delete)
        monkeypatch.setattr(filestt.stt.requests, "post", fake.post)
        return fake

    return make


@pytest.fixture
def no_wait(monkeypatch):
    """다시 하기 전 기다림을 건너뛰고, 얼마나 기다리려 했는지 남깁니다."""
    waits = []

    def sleep(seconds, cancel):
        waits.append(seconds)
        if cancel is not None and cancel.is_set():
            raise Cancelled()

    monkeypatch.setattr(filestt, "_sleep", sleep)
    return waits


def make_file(tmp_path, name="녹음.m4a", size=1000):
    p = tmp_path / name
    with open(p, "wb") as f:
        f.truncate(size)  # 큰 파일도 디스크를 거의 쓰지 않게 비워 둡니다
    return str(p)


def make_wav(tmp_path, seconds=2.0):
    p = tmp_path / "말.wav"
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\0\0" * int(8000 * seconds))
    return str(p)


# ---------- 형식·구간 ----------

def test_file_types_and_segments():
    assert file_mime("통화.M4A") == "audio/m4a"
    assert file_mime("강의.mp3") == "audio/mp3"
    assert file_mime("아이폰 영상.MOV") == "video/mov"
    assert file_mime("메모.txt") is None
    assert plan_segments(None) == [] and plan_segments(25 * 60) == []
    assert plan_segments(45 * 60) == [(0, 1200), (1200, 2400), (2400, 2700)]
    assert plan_segments(41 * 60) == [(0, 1200), (1200, 2460)]  # 2분 미만 꼬리는 앞 구간에
    assert clock(4530) == "75:30"
    p = file_prompt("ko", ["지구단위계획"], (1200, 2400))
    assert "20:00부터 40:00까지" in p and "지구단위계획" in p and "한국어" in p and "말하는 사람이 바뀌면" in p
    assert "40:00부터 녹음이 끝날 때까지" in file_prompt("ko", [], (2400, None))


# ---------- Gemini ----------

def test_short_recording_goes_inline(server, tmp_path):
    fake = server()
    out = filestt.transcribe_file(make_wav(tmp_path), "gemini", "AIza-k", "ko")
    assert out.text == "제미나이가 받아쓴 글" and out.missed == 0 and out.duration == pytest.approx(2.0)
    assert len(fake.calls) == 1
    part = fake.calls[0]["json"]["contents"][0]["parts"][1]
    assert part["inlineData"]["mimeType"] == "audio/wav"
    assert fake.calls[0]["headers"]["x-goog-api-key"] == "AIza-k"


def test_big_file_uploads_in_chunks_waits_and_deletes(server, no_wait, tmp_path):
    fake = server(upload_state="PROCESSING")
    size = INLINE_MAX_BYTES + 3 * 1024 * 1024
    progress = []
    out = filestt.transcribe_file(
        make_file(tmp_path, size=size), "gemini", "AIza-k", "ko", duration=600, on_progress=lambda p: progress.append((p.stage, p.done, p.total))
    )
    assert out.text == "제미나이가 받아쓴 글"
    start = fake.calls[0]
    assert start["url"].endswith("/upload/v1beta/files")
    assert start["headers"]["x-goog-upload-protocol"] == "resumable"
    assert start["headers"]["x-goog-upload-header-content-length"] == str(size)
    assert start["headers"]["x-goog-upload-header-content-type"] == "audio/m4a"
    assert fake.chunks() == [("upload", "0"), ("upload", str(CHUNK_BYTES)), ("upload, finalize", str(2 * CHUNK_BYTES))]
    assert any(c["method"] == "GET" for c in fake.calls)  # PROCESSING → ACTIVE 기다림
    assert fake.generates()[0]["json"]["contents"][0]["parts"][1]["fileData"]["fileUri"] == "https://g/files/abc"
    assert fake.deleted()
    assert progress[0] == ("upload", 0, size) and ("upload", size, size) in progress and progress[-1] == ("transcribe", 1, 1)


def test_long_lecture_is_split_into_20_minute_segments(server, tmp_path):
    fake = server()
    out = filestt.transcribe_file(make_file(tmp_path, size=2000), "gemini", "k", "ko", duration=45 * 60)
    assert out.text == "구간 00:00~20:00\n\n구간 20:00~40:00\n\n구간 40:00~끝"
    assert len(fake.generates()) == 3
    assert fake.calls[0]["url"].endswith("/upload/v1beta/files")  # 짧은 파일이어도 여러 번 쓰므로 한 번만 올립니다
    assert fake.deleted()


def test_unknown_length_is_counted_from_tokens(server, tmp_path):
    """파일 머리로 길이를 못 읽는 형식(ogg 등)은 올린 뒤 토큰 수로 길이를 셉니다 (Gemini 3: 1초 25토큰)."""
    fake = server(tokens=25 * 45 * 60, mime="audio/ogg")
    out = filestt.transcribe_file(make_file(tmp_path, "녹음.ogg", 3000), "gemini", "k", "ko")
    assert out.duration == pytest.approx(45 * 60)
    assert len(fake.generates()) == 3
    count = next(c for c in fake.calls if c["url"].endswith(":countTokens"))
    assert count["json"] == {"contents": [{"role": "user", "parts": [{"fileData": {"mimeType": "audio/ogg", "fileUri": "https://g/files/abc"}}]}]}


def test_video_segments_are_clipped_and_low_resolution(server, tmp_path):
    fake = server(mime="video/mp4")
    filestt.transcribe_file(make_file(tmp_path, "강의.mp4", 2000), "gemini", "k", "ko", duration=45 * 60)
    gens = [c["json"] for c in fake.generates()]
    assert [g["contents"][0]["parts"][1]["videoMetadata"] for g in gens] == [
        {"startOffset": "0s", "endOffset": "1200s"},
        {"startOffset": "1200s", "endOffset": "2400s"},
        {"startOffset": "2400s"},
    ]
    assert all(g["generationConfig"]["mediaResolution"] == "MEDIA_RESOLUTION_LOW" for g in gens)
    assert "처음부터 끝까지" in gens[1]["contents"][0]["parts"][0]["text"]


def test_video_length_from_gemini_when_unknown(server, tmp_path):
    fake = server(mime="video/mp4", video_duration="2700.5s")
    out = filestt.transcribe_file(make_file(tmp_path, "화면녹화.webm", 2000), "gemini", "k", "ko")
    assert out.duration == pytest.approx(2700.5)
    assert len(fake.generates()) == 3
    assert not any(c["url"].endswith(":countTokens") for c in fake.calls)


def test_not_media_or_empty_is_rejected_before_sending(server, tmp_path):
    fake = server()
    with pytest.raises(SttError):
        filestt.transcribe_file(make_file(tmp_path, "메모.txt"), "gemini", "k", "ko")
    with pytest.raises(SttError, match="빈 파일"):
        filestt.transcribe_file(make_file(tmp_path, "빈.m4a", 0), "gemini", "k", "ko")
    assert fake.calls == []


# ---------- 실패·멈추기 ----------

def test_failed_file_is_deleted(server, no_wait, tmp_path):
    fake = server(upload_state="PROCESSING", poll_state="FAILED")
    with pytest.raises(SttError, match="읽지 못했습니다"):
        filestt.transcribe_file(make_file(tmp_path, size=INLINE_MAX_BYTES + 1), "gemini", "k", "ko", duration=600)
    assert fake.deleted()


def test_cancel_while_preparing_stops_and_deletes(server, tmp_path):
    fake = server(upload_state="PROCESSING")
    cancel = threading.Event()

    def on_progress(p):
        if p.stage == "prepare":
            cancel.set()

    with pytest.raises(Cancelled):
        filestt.transcribe_file(make_file(tmp_path, size=INLINE_MAX_BYTES + 1), "gemini", "k", "ko", duration=600, on_progress=on_progress, cancel=cancel)
    assert fake.deleted() and fake.generates() == []


def test_cancel_before_start_sends_nothing(server, tmp_path):
    fake = server()
    cancel = threading.Event()
    cancel.set()
    with pytest.raises(Cancelled):
        filestt.transcribe_file(make_wav(tmp_path), "gemini", "k", "ko", cancel=cancel)
    assert fake.calls == []


def test_dropped_chunk_resumes_from_what_server_received(server, no_wait, tmp_path):
    fake = server(chunk_fail_at=CHUNK_BYTES)
    filestt.transcribe_file(make_file(tmp_path, size=INLINE_MAX_BYTES + 3 * 1024 * 1024), "gemini", "k", "ko", duration=600)
    assert fake.chunks() == [
        ("upload", "0"),
        ("upload", str(CHUNK_BYTES)),  # 503
        ("query", None),
        ("upload", str(CHUNK_BYTES)),
        ("upload, finalize", str(2 * CHUNK_BYTES)),
    ]


def test_all_bytes_received_but_not_final_sends_empty_finalize(server, no_wait, tmp_path):
    size = INLINE_MAX_BYTES + 3 * 1024 * 1024
    fake = server(chunk_fail_at=2 * CHUNK_BYTES, query_received=size)
    out = filestt.transcribe_file(make_file(tmp_path, size=size), "gemini", "k", "ko", duration=600)
    assert out.text == "제미나이가 받아쓴 글"
    assert [c for c, _ in fake.chunks()] == ["upload", "upload", "upload, finalize", "query", "finalize"]
    last = [c for c in fake.calls if c["url"] == UPLOAD_URL][-1]
    assert last["headers"]["x-goog-upload-offset"] == str(size) and last["data"] == b""


def test_busy_poll_is_retried_not_deleted(server, no_wait, tmp_path):
    fake = server(upload_state="PROCESSING", poll_failures=1)
    out = filestt.transcribe_file(make_file(tmp_path, size=INLINE_MAX_BYTES + 1), "gemini", "k", "ko", duration=600)
    assert out.text == "제미나이가 받아쓴 글"
    assert len([c for c in fake.calls if c["method"] == "GET"]) == 2
    assert len(fake.generates()) == 1


def test_busy_server_is_retried_honoring_retry_delay(server, no_wait, tmp_path):
    retry_info = {"error": {"code": 429, "details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "7s"}]}}
    fake = server(generate_failures=[(503, None), (429, retry_info)])
    out = filestt.transcribe_file(make_wav(tmp_path), "gemini", "k", "ko")
    assert out.text == "제미나이가 받아쓴 글"
    assert len(fake.generates()) == 3
    assert no_wait == [2, 7.0]


def test_daily_quota_is_not_waited_on_and_stops_remaining_segments(server, no_wait, tmp_path):
    daily = {
        "error": {
            "code": 429,
            "message": "You exceeded your current quota",
            "details": [
                {"@type": "type.googleapis.com/google.rpc.QuotaFailure", "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]},
                {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "28s"},
            ],
        }
    }
    count = {"n": 0}
    fake = None

    def second_is_daily():
        count["n"] += 1
        if count["n"] == 2:
            fake.generate_failures.append((429, daily))

    fake = server(on_generate=second_is_daily)
    out = filestt.transcribe_file(make_file(tmp_path, size=2000), "gemini", "k", "ko", duration=65 * 60)
    assert out.text == "구간 00:00~20:00\n\n[20:00 이후는 받아쓰지 못했습니다]"
    assert out.missed == 3 and "한도" in out.stopped
    assert len(fake.generates()) == 2 and no_wait == []


def test_one_failed_segment_leaves_a_marker(server, tmp_path):
    fake = server(fail_from="20:00")
    out = filestt.transcribe_file(make_file(tmp_path, size=2000), "gemini", "k", "ko", duration=45 * 60)
    assert out.text == "구간 00:00~20:00\n\n[20:00~40:00 구간은 받아쓰지 못했습니다]\n\n구간 40:00~끝"
    assert out.missed == 1 and fake.deleted()


def test_first_segment_failure_is_reported(server, tmp_path):
    fake = server(fail_from="00:00")
    with pytest.raises(SttError):
        filestt.transcribe_file(make_file(tmp_path, size=2000), "gemini", "k", "ko", duration=45 * 60)
    assert len(fake.generates()) == 1 and fake.deleted()


def test_truncated_output_is_kept_and_marked(server, tmp_path):
    server(finish="MAX_TOKENS")
    out = filestt.transcribe_file(make_wav(tmp_path), "gemini", "k", "ko")
    assert out.text == "제미나이가 받아쓴 글\n[녹음 뒷부분은 너무 길어 받아쓰지 못했습니다]" and out.missed == 1


# ---------- 고른 서비스와 Gemini로 넘기기 ----------

def test_elevenlabs_gets_the_file_with_its_name_and_type(server, tmp_path):
    fake = server()
    out = filestt.transcribe_file(make_file(tmp_path, "통화.m4a"), "elevenlabs", "sk_e", "ko", gemini_key="AIza")
    assert out.text == "일레븐랩스가 받아쓴 글" and out.switched_from is None
    name, _data, mime = fake.calls[0]["data"]["file"]
    assert (name, mime) == ("통화.m4a", "audio/m4a")


def test_elevenlabs_out_of_credit_switches_to_gemini_for_good(server, tmp_path):
    server(eleven_status=401, eleven_body={"detail": {"status": "quota_exceeded", "message": "0 credits"}})
    out = filestt.transcribe_file(make_wav(tmp_path), "elevenlabs", "sk_e", "ko", gemini_key="AIza")
    assert out.text == "제미나이가 받아쓴 글"
    assert out.switched_from == "elevenlabs" and out.switch_for_good and "크레딧" in out.reason


def test_openai_long_recording_goes_to_gemini_without_changing_settings(server, tmp_path):
    fake = server()
    out = filestt.transcribe_file(make_file(tmp_path, size=2000), "openai", "sk-o", "ko", gemini_key="AIza", duration=30 * 60)
    assert out.switched_from == "openai" and not out.switch_for_good and "10분" in out.reason
    assert not any("api.openai.com" in c["url"] for c in fake.calls)


def test_openai_too_big_without_gemini_key_explains(server, tmp_path):
    server()
    with pytest.raises(SttError, match="25MB"):
        filestt.transcribe_file(make_file(tmp_path, size=26 * 1024 * 1024), "openai", "sk-o", "ko")


# ---------- 2차 검토 반영 ----------

def test_openai_unsupported_format_or_unknown_length_goes_to_gemini(server, tmp_path):
    fake = server()
    out = filestt.transcribe_file(make_file(tmp_path, "아이폰.mov", 2000), "openai", "sk-o", "ko", gemini_key="AIza", duration=60)
    assert out.switched_from == "openai" and ".mov" in out.reason
    out = filestt.transcribe_file(make_file(tmp_path, "녹음.ogg", 2000), "openai", "sk-o", "ko", gemini_key="AIza")
    assert out.switched_from == "openai" and "길이를 알 수 없습니다" in out.reason
    assert not any("api.openai.com" in c["url"] for c in fake.calls)


def test_answer_without_candidates_is_not_taken_as_silence(server, tmp_path, monkeypatch):
    fake = server()
    real_post = fake.post
    n = {"i": 0}

    def post(url, **kw):
        if url.endswith(":generateContent"):
            n["i"] += 1
            if n["i"] == 2:  # 둘째 구간: 후보 없는 빈 답
                fake._record("POST", url, kw.get("headers"), kw.get("json"))
                return resp(200, {"promptFeedback": {}})
        return real_post(url, **kw)

    monkeypatch.setattr(filestt.requests, "post", post)
    out = filestt.transcribe_file(make_file(tmp_path, size=2000), "gemini", "k", "ko", duration=45 * 60)
    assert out.text == "구간 00:00~20:00\n\n[20:00~40:00 구간은 받아쓰지 못했습니다]\n\n구간 40:00~끝" and out.missed == 1


def test_quitting_mid_job_deletes_uploaded_recording(server, tmp_path):
    fake = server(upload_state="PROCESSING")
    cancel = threading.Event()
    seen = {}

    def on_progress(p):
        if p.stage == "prepare":
            seen["pending"] = dict(filestt._live)
            cancel.set()

    with pytest.raises(Cancelled):
        filestt.transcribe_file(
            make_file(tmp_path, size=INLINE_MAX_BYTES + 1), "gemini", "k", "ko", duration=600, on_progress=on_progress, cancel=cancel
        )
    assert seen["pending"] == {"files/abc": "k"}  # 올린 뒤에는 '지울 목록'에 있다가
    assert filestt._live == {} and fake.deleted()  # 지우면 빠집니다
    filestt._live["files/old"] = "k"  # 끌 때 남은 것이 있으면
    assert filestt.delete_pending() == 1 and filestt._live == {}


def test_broken_mp4_header_gives_unknown_length(tmp_path):
    from mrk_typeless.mediainfo import duration_seconds

    p = tmp_path / "깨진.m4a"
    p.write_bytes(b"\0\0\0\x10ftypM4A \0\0\0\0" + b"\0\0\0\x08moov" + b"\0\0\0\x08mvhd")  # mvhd 내용이 없음
    assert duration_seconds(str(p)) is None
