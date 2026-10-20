"""ffmpeg/ffprobe 도우미.

ffmpeg 위치는 다음 순서로 찾습니다.
1) 환경 변수 FFMPEG_BIN  2) PATH  3) 프로그램 폴더의 tools/ffmpeg  4) imageio-ffmpeg 패키지 내장본
ffprobe 가 없으면 `ffmpeg -i` 출력으로 대신 읽습니다(설치를 한 단계 줄이기 위해).
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .settings import ROOT

VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".mkv", ".avi", ".webm", ".mts", ".3gp"}
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

# pythonw 로 띄웠을 때 ffmpeg 마다 검은 창이 번쩍이지 않도록.
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if sys.platform == "win32" else 0


class MediaError(RuntimeError):
    pass


@lru_cache(maxsize=None)
def ffmpeg_bin() -> str:
    env = os.environ.get("FFMPEG_BIN")
    if env and Path(env).exists():
        return env
    found = shutil.which("ffmpeg")
    if found:
        return found
    exe = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    for cand in (ROOT / "tools" / "ffmpeg" / "bin" / exe, ROOT / "tools" / exe):
        if cand.exists():
            return str(cand)
    try:
        import imageio_ffmpeg  # type: ignore

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    raise MediaError("ffmpeg 를 찾을 수 없습니다. '설치'를 다시 실행하거나 ffmpeg 를 설치하세요.")


@lru_cache(maxsize=None)
def ffprobe_bin() -> str | None:
    env = os.environ.get("FFPROBE_BIN")
    if env and Path(env).exists():
        return env
    found = shutil.which("ffprobe")
    if found:
        return found
    sibling = Path(ffmpeg_bin()).with_name("ffprobe.exe" if sys.platform == "win32" else "ffprobe")
    return str(sibling) if sibling.exists() else None


@lru_cache(maxsize=None)
def ffmpeg_version() -> tuple[int, int]:
    out = subprocess.run(
        [ffmpeg_bin(), "-version"], capture_output=True, text=True, creationflags=_NO_WINDOW
    ).stdout
    m = re.search(r"version\s+n?(\d+)\.(\d+)", out)
    return (int(m.group(1)), int(m.group(2))) if m else (6, 0)


@lru_cache(maxsize=None)
def video_encoder() -> list[str]:
    """쓸 수 있는 H.264 인코더 인자. 없으면 mpeg4 로 대신합니다."""
    out = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-encoders"], capture_output=True, text=True, creationflags=_NO_WINDOW
    ).stdout
    if " libx264 " in out:
        return ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-profile:v", "high"]
    if " libopenh264 " in out:
        return ["-c:v", "libopenh264", "-b:v", "8M"]
    return ["-c:v", "mpeg4", "-q:v", "3"]


def run(args: list[str], *, input_bytes: bytes | None = None) -> subprocess.CompletedProcess:
    """ffmpeg 실행. 실패하면 stderr 끝부분을 담아 MediaError."""
    cmd = [ffmpeg_bin(), "-hide_banner"]
    if input_bytes is None:
        cmd.append("-nostdin")
    cmd += args
    proc = subprocess.run(
        cmd, input=input_bytes, capture_output=True, creationflags=_NO_WINDOW
    )
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace")[-1500:]
        raise MediaError(f"ffmpeg 실패 (코드 {proc.returncode}):\n{tail}")
    return proc


def popen(args: list[str], **kw) -> subprocess.Popen:
    return subprocess.Popen([ffmpeg_bin(), "-hide_banner", *args], creationflags=_NO_WINDOW, **kw)


def filter_script_args(script_path: Path) -> list[str]:
    """긴 필터 그래프는 파일로 넘깁니다(윈도우 명령줄 길이 제한 회피)."""
    if ffmpeg_version() >= (7, 0):
        return ["-/filter_complex", str(script_path)]
    return ["-filter_complex_script", str(script_path)]


# ---------------------------------------------------------------------------
# 영상 정보
# ---------------------------------------------------------------------------
@dataclass
class MediaInfo:
    path: Path
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool
    has_video: bool

    @property
    def portrait(self) -> bool:
        return self.height >= self.width


def _rotation_from_stream(stream: dict) -> int:
    rot = 0
    tags = stream.get("tags") or {}
    if "rotate" in tags:
        try:
            rot = int(float(tags["rotate"]))
        except ValueError:
            rot = 0
    for sd in stream.get("side_data_list") or []:
        if "rotation" in sd:
            try:
                rot = int(float(sd["rotation"]))
            except (TypeError, ValueError):
                pass
    return rot


def _parse_rate(rate: str) -> float:
    if not rate or rate == "0/0":
        return 0.0
    if "/" in rate:
        n, d = rate.split("/", 1)
        return float(n) / float(d) if float(d) else 0.0
    return float(rate)


def probe(path: Path | str) -> MediaInfo:
    path = Path(path)
    if not path.exists():
        raise MediaError(f"파일이 없습니다: {path}")
    fp = ffprobe_bin()
    if fp:
        proc = subprocess.run(
            [fp, "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(path)],
            capture_output=True, creationflags=_NO_WINDOW,
        )
        if proc.returncode == 0:
            data = json.loads(proc.stdout.decode("utf-8", "replace") or "{}")
            return _info_from_ffprobe(path, data)
    return _info_from_ffmpeg(path)


def _info_from_ffprobe(path: Path, data: dict) -> MediaInfo:
    streams = data.get("streams") or []
    v = next((s for s in streams if s.get("codec_type") == "video"
              and not (s.get("disposition") or {}).get("attached_pic")), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    duration = float((data.get("format") or {}).get("duration") or 0.0)
    w = h = 0
    fps = 0.0
    if v:
        w, h = int(v.get("width") or 0), int(v.get("height") or 0)
        if abs(_rotation_from_stream(v)) % 180 == 90:
            w, h = h, w
        fps = _parse_rate(v.get("avg_frame_rate") or "") or _parse_rate(v.get("r_frame_rate") or "")
        if not duration:
            duration = float(v.get("duration") or 0.0)
    if not duration and a:
        duration = float(a.get("duration") or 0.0)
    return MediaInfo(path, duration, w, h, fps or 30.0, a is not None, v is not None)


def _info_from_ffmpeg(path: Path) -> MediaInfo:
    proc = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-i", str(path)], capture_output=True, creationflags=_NO_WINDOW
    )
    err = proc.stderr.decode("utf-8", "replace")
    m = re.search(r"Duration:\s*(\d+):(\d+):([\d.]+)", err)
    duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    vline = next((ln for ln in err.splitlines() if "Video:" in ln and "attached pic" not in ln), "")
    w = h = 0
    fps = 30.0
    if vline:
        sm = re.search(r"\b(\d{2,5})x(\d{2,5})\b", vline)
        if sm:
            w, h = int(sm.group(1)), int(sm.group(2))
        fm = re.search(r"([\d.]+)\s*fps", vline)
        if fm:
            fps = float(fm.group(1))
    rm = re.search(r"rotation of (-?[\d.]+) degrees", err)
    if rm and abs(int(float(rm.group(1)))) % 180 == 90:
        w, h = h, w
    return MediaInfo(path, duration, w, h, fps, "Audio:" in err, bool(vline))


# ---------------------------------------------------------------------------
# 오디오
# ---------------------------------------------------------------------------
def extract_audio(src: Path, dst: Path, sr: int = 16000, channels: int = 1) -> Path:
    run(["-y", "-i", str(src), "-vn", "-ac", str(channels), "-ar", str(sr), "-c:a", "pcm_s16le", str(dst)])
    return dst


def read_audio_f32(src: Path, sr: int = 48000, channels: int = 2):
    """오디오를 float32 numpy 배열(샘플×채널)로 읽습니다."""
    import numpy as np

    proc = run(["-i", str(src), "-vn", "-ac", str(channels), "-ar", str(sr), "-f", "f32le", "-"])
    data = np.frombuffer(proc.stdout, dtype=np.float32)
    return data.reshape(-1, channels).copy()


def write_wav_f32(dst: Path, samples, sr: int = 48000) -> Path:
    import numpy as np

    arr = np.ascontiguousarray(samples, dtype=np.float32)
    channels = 1 if arr.ndim == 1 else arr.shape[1]
    run(["-y", "-f", "f32le", "-ar", str(sr), "-ac", str(channels), "-i", "-",
         "-c:a", "pcm_s16le", str(dst)], input_bytes=arr.tobytes())
    return dst


def _last_json(stderr: str) -> dict:
    start = stderr.rfind("{")
    end = stderr.rfind("}")
    if start < 0 or end < start:
        raise MediaError("loudnorm 측정 결과를 읽지 못했습니다.")
    return json.loads(stderr[start:end + 1])


def measure_loudness(src: Path, target_i: float = -14.0, tp: float = -1.0, lra: float = 11.0) -> dict:
    proc = run(["-i", str(src), "-vn", "-af",
                f"loudnorm=I={target_i}:TP={tp}:LRA={lra}:print_format=json", "-f", "null", "-"])
    return _last_json(proc.stderr.decode("utf-8", "replace"))


def loudnorm(src: Path, dst: Path, target_i: float = -14.0, tp: float = -1.0, lra: float = 11.0,
             sr: int = 48000) -> dict:
    """2패스 loudnorm 으로 정확히 목표 LUFS 에 맞춥니다."""
    m = measure_loudness(src, target_i, tp, lra)
    af = (f"loudnorm=I={target_i}:TP={tp}:LRA={lra}"
          f":measured_I={m['input_i']}:measured_TP={m['input_tp']}"
          f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
          f":offset={m['target_offset']}:linear=true")
    run(["-y", "-i", str(src), "-af", af, "-ar", str(sr), "-c:a", "pcm_s16le", str(dst)])
    return m


def integrated_loudness(src: Path) -> float:
    """완성본의 실제 통합 라우드니스(LUFS)."""
    proc = run(["-i", str(src), "-vn", "-af", "ebur128=framelog=quiet", "-f", "null", "-"])
    err = proc.stderr.decode("utf-8", "replace")
    found = re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", err)
    if not found:
        raise MediaError("라우드니스를 재지 못했습니다.")
    return float(found[-1])


def scene_changes(src: Path, threshold: float = 0.3) -> list[float]:
    """화면이 통째로 바뀌는 시점(초) 목록 — 레퍼런스 릴스의 컷 간격을 잴 때 사용."""
    proc = run(["-i", str(src), "-an", "-vf",
                f"scale=270:-2,select='gt(scene,{threshold})',showinfo", "-f", "null", "-"])
    err = proc.stderr.decode("utf-8", "replace")
    return [float(x) for x in re.findall(r"pts_time:([\d.]+)", err)]


def grab_frame(src: Path, t: float, dst: Path, width: int | None = None) -> Path:
    vf = ["-vf", f"scale={width}:-2"] if width else []
    run(["-y", "-ss", f"{max(0.0, t):.3f}", "-i", str(src), "-frames:v", "1", *vf, "-q:v", "3", str(dst)])
    return dst


def open_path(path: Path) -> None:
    """완성 영상·폴더를 운영체제 기본 프로그램으로 엽니다."""
    try:
        if sys.platform == "win32":
            os.startfile(str(path))  # type: ignore[attr-defined]
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(path)])
        else:
            subprocess.Popen(["xdg-open", str(path)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass
