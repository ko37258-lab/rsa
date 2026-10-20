"""7단계 굽기 — 자르기·배속, 화면 배치, 카드·자막 합성, 효과음, -14 LUFS, 1080×1920 30프레임.

1) ffmpeg 가 편집 결정표대로 원본을 잘라 이어 붙이고 배속한 '바탕 영상'을 만듭니다.
2) 바탕 영상을 한 프레임씩 읽어 장면마다 전체샷·반반·클로즈업으로 배치하고 카드·자막을 얹습니다.
3) 효과음을 섞고 2패스 loudnorm 으로 -14 LUFS 에 맞춘 뒤 H.264 로 굽습니다.
영상 전체를 메모리에 올리지 않고 필요한 프레임만 읽어 씁니다.
"""
from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

import numpy as np
from PIL import Image

from . import draw, media, sfx
from .edit import EditPlan
from .scenes import Scene
from .templates import Template

try:  # opencv 가 없으면 얼굴 찾기·빠른 크기 바꾸기 대신 Pillow 사용
    import cv2  # type: ignore
except Exception:  # pragma: no cover
    cv2 = None

W, H = draw.W, draw.H


# ---------------------------------------------------------------------------
# 1) 자르고 이어 붙이기 + 배속
# ---------------------------------------------------------------------------
def cut_base(src: Path, plan: EditPlan, info: media.MediaInfo, out_video: Path, out_audio: Path,
             fps: int, work: Path) -> None:
    segs = plan.segments
    sp = plan.speed
    # 4K 원본은 미리 줄여서 합성 속도를 지킴 (세로 영상 높이 1920 / 가로 영상 높이 1080 까지)
    scale = "scale=-2:'min(1920,ih)'" if info.portrait else "scale=-2:'min(1080,ih)'"
    parts: list[str] = []
    for i, s in enumerate(segs):
        parts.append(f"[0:v]trim=start={s.start:.3f}:end={s.end:.3f},setpts=PTS-STARTPTS[v{i}]")
        if info.has_audio:
            parts.append(f"[0:a]atrim=start={s.start:.3f}:end={s.end:.3f},asetpts=PTS-STARTPTS[a{i}]")
    n = len(segs)
    if info.has_audio:
        ins = "".join(f"[v{i}][a{i}]" for i in range(n))
        parts.append(f"{ins}concat=n={n}:v=1:a=1[vc][ac]")
        parts.append(f"[ac]atempo={sp:.4f},aresample=48000[a]")
    else:
        ins = "".join(f"[v{i}]" for i in range(n))
        parts.append(f"{ins}concat=n={n}:v=1:a=0[vc]")
    parts.append(f"[vc]setpts=PTS/{sp:.4f},fps={fps},{scale},format=yuv420p[v]")
    script = work / "cut.filter"
    script.write_text(";\n".join(parts), encoding="utf-8")
    enc = media.video_encoder()
    if "libx264" in enc:  # 중간 파일은 빠르고 거의 무손실로
        enc = ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "14"]
    args = ["-y", "-i", str(src), *media.filter_script_args(script), "-map", "[v]", *enc, "-an", str(out_video)]
    if info.has_audio:
        args += ["-map", "[a]", "-ac", "2", "-c:a", "pcm_s16le", str(out_audio)]
    media.run(args)
    if not info.has_audio:
        media.write_wav_f32(out_audio, np.zeros((int(plan.output_duration * sfx.SR), 2), np.float32), sfx.SR)


# ---------------------------------------------------------------------------
# 얼굴 위치
# ---------------------------------------------------------------------------
@dataclass
class Face:
    cx: float = 0.5  # 원본 화면 기준 비율
    cy: float = 0.38
    h: float = 0.0  # 얼굴 높이 비율 (0 = 못 찾음)


def track_faces(video: Path, duration: float, step: float = 0.5) -> list[tuple[float, Face]]:
    """0.5초마다 얼굴을 찾아 (시각, 위치) 목록을 만듭니다."""
    if cv2 is None:
        return []
    cascade_path = Path(cv2.data.haarcascades) / "haarcascade_frontalface_default.xml"
    if not cascade_path.exists():
        return []
    det = cv2.CascadeClassifier(str(cascade_path))
    rate = 1.0 / step
    proc = media.run(["-i", str(video), "-vf", f"fps={rate},scale=360:-2,format=gray", "-f", "rawvideo", "-"])
    info = media.probe(video)
    w = 360
    h = int(round(info.height * w / max(1, info.width) / 2) * 2)
    frame_size = w * h
    buf = proc.stdout
    out: list[tuple[float, Face]] = []
    for k in range(len(buf) // frame_size):
        img = np.frombuffer(buf, dtype=np.uint8, count=frame_size, offset=k * frame_size).reshape(h, w)
        faces = det.detectMultiScale(img, scaleFactor=1.15, minNeighbors=5, minSize=(int(w * 0.08), int(w * 0.08)))
        if len(faces):
            x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
            out.append((k * step, Face((x + fw / 2) / w, (y + fh / 2) / h, fh / h)))
    return out


def face_for(track: list[tuple[float, Face]], start: float, end: float, default: Face) -> Face:
    pts = [f for t, f in track if start - 0.25 <= t <= end + 0.25]
    if not pts:
        return default
    return Face(float(np.median([f.cx for f in pts])), float(np.median([f.cy for f in pts])),
                float(np.median([f.h for f in pts])))


# ---------------------------------------------------------------------------
# 그림 합성 도우미
# ---------------------------------------------------------------------------
def _resize(img: np.ndarray, w: int, h: int) -> np.ndarray:
    if img.shape[1] == w and img.shape[0] == h:
        return img.copy()  # 원본 프레임 버퍼는 읽기 전용이라 그 위에 그리지 않도록 복사
    if cv2 is not None:
        return cv2.resize(img, (w, h), interpolation=cv2.INTER_LINEAR)
    return np.asarray(Image.fromarray(img).resize((w, h), Image.BILINEAR))


def cover(src: np.ndarray, out_w: int, out_h: int, anchor: tuple[float, float], target: tuple[float, float],
          zoom: float = 1.0) -> np.ndarray:
    """원본을 out 크기에 꽉 차게 자르되, 원본의 anchor(비율) 지점이 출력의 target(px)에 오도록."""
    h, w = src.shape[:2]
    scale = max(out_w / w, out_h / h) * zoom
    cw, ch = out_w / scale, out_h / scale
    x0 = min(max(anchor[0] * w - target[0] / scale, 0), w - cw)
    y0 = min(max(anchor[1] * h - target[1] / scale, 0), h - ch)
    xi, yi = int(round(x0)), int(round(y0))
    crop = src[yi: yi + max(1, int(round(ch))), xi: xi + max(1, int(round(cw)))]
    return _resize(crop, out_w, out_h)


def to_rgba_array(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGBA"))


def blend(dst: np.ndarray, ov: np.ndarray, x: int, y: int, opacity: float = 1.0) -> None:
    oh, ow = ov.shape[:2]
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(dst.shape[1], x + ow), min(dst.shape[0], y + oh)
    if x0 >= x1 or y0 >= y1:
        return
    part = ov[y0 - y: y1 - y, x0 - x: x1 - x]
    a = part[..., 3:4].astype(np.uint16)
    if opacity < 1.0:
        a = (a * opacity).astype(np.uint16)
    region = dst[y0:y1, x0:x1]
    region[:] = ((part[..., :3].astype(np.uint16) * a + region.astype(np.uint16) * (255 - a) + 127) // 255).astype(
        np.uint8)


def _ease(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return 1 - (1 - p) ** 3


def _dark_top(h: int) -> np.ndarray:
    col = np.linspace(14, 22, h, dtype=np.float32)[:, None, None]
    return np.broadcast_to(col, (h, W, 3)).astype(np.uint8).copy()


class VideoSource:
    """자료 영상·시연 영상을 원하는 시각의 프레임으로 꺼내 줍니다."""

    def __init__(self, path: Path):
        self.path = path
        self.cap = cv2.VideoCapture(str(path)) if cv2 is not None else None
        self.fps = (self.cap.get(cv2.CAP_PROP_FPS) or 30.0) if self.cap is not None else 30.0
        self.pos = -1.0
        self.last: np.ndarray | None = None

    def frame_at(self, t: float) -> np.ndarray | None:
        if self.cap is None:
            return None
        if self.last is not None and 0 <= t - self.pos < 0.5 / self.fps:
            return self.last
        if t < self.pos or t - self.pos > 1.0:
            self.cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            self.pos = t - 1.0 / self.fps
        while self.pos < t:
            ok, fr = self.cap.read()
            if not ok:
                break
            self.last = cv2.cvtColor(fr, cv2.COLOR_BGR2RGB)
            self.pos += 1.0 / self.fps
        return self.last


# ---------------------------------------------------------------------------
# 2) 한 프레임 합성기
# ---------------------------------------------------------------------------
class Compositor:
    def __init__(self, tpl: Template, scenes: list[Scene], total: float, *, faces: list[tuple[float, Face]] | None = None,
                 materials: dict[str, Path] | None = None, demo: Path | None = None, handle: str = "",
                 headline_title: str = ""):
        self.tpl = tpl
        self.scenes = scenes
        self.total = max(total, 0.01)
        self.fonts = draw.Fonts(tpl)
        self.materials = materials or {}
        self.handle = handle
        default = Face()
        if faces:
            default = Face(float(np.median([f.cx for _, f in faces])), float(np.median([f.cy for _, f in faces])),
                           float(np.median([f.h for _, f in faces])))
        self.faces = [face_for(faces or [], s.start, s.end, default) for s in scenes]
        self._cards: dict[tuple, tuple] = {}
        self._subs: dict[tuple, tuple] = {}
        self._starts = [s.start for s in scenes]
        self.headline = (to_rgba_array(draw.headline(headline_title, tpl, self.fonts))
                         if tpl.headline and headline_title else None)
        self.demo = VideoSource(demo) if demo else None
        self._demo_offsets: dict[int, float] = {}
        acc = 0.0
        for s in scenes:
            if s.kind == "demo":
                self._demo_offsets[s.index] = acc
                acc += s.dur
        self._mat_video: dict[str, VideoSource] = {}

    # -- 장면 찾기 ----------------------------------------------------------
    def scene_index(self, t: float) -> int:
        lo, hi = 0, len(self._starts) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self._starts[mid] <= t:
                lo = mid
            else:
                hi = mid - 1
        return lo

    # -- 바탕(영상 배치) ----------------------------------------------------
    def background(self, src: np.ndarray, scene: Scene, face: Face, local_t: float) -> np.ndarray:
        tpl = self.tpl
        layout = scene.layout
        anchor = (face.cx, face.cy)
        if layout == "closeup":
            zoom = 1.32
            if tpl.zoom_punch:
                zoom = 1.22 + 0.10 * _ease(local_t / 0.3)
            return cover(src, W, H, anchor, (W / 2, H * 0.40), zoom)
        if layout == "half" and tpl.style == "split":
            canvas = np.empty((H, W, 3), np.uint8)
            vh = H - tpl.split_h
            # 가로로 찍은 강의 영상은 아래 칸에 화면 전체가 들어가 사람이 작아 보이므로 사람 쪽으로 당김
            zoom = 1.45 if src.shape[1] > src.shape[0] else 1.0
            canvas[tpl.split_h:] = cover(src, W, vh, anchor, (W / 2, vh * 0.42), zoom)
            canvas[: tpl.split_h] = 0
            return canvas
        # 전체샷 (overlay 형은 영상을 face_shift 만큼 내리고 위는 어두운 바탕)
        shift = tpl.face_shift
        full = cover(src, W, H, anchor, (W / 2, H * 0.40), 1.0)
        if shift <= 0:
            return full
        canvas = np.empty((H, W, 3), np.uint8)
        canvas[:shift] = _dark_top(shift)
        canvas[shift:] = full[: H - shift]
        fade = min(140, shift)
        ramp = np.linspace(1.0, 0.0, fade, dtype=np.float32)[:, None, None]
        seg = canvas[shift: shift + fade].astype(np.float32)
        canvas[shift: shift + fade] = (seg * (1 - ramp) + 18 * ramp).astype(np.uint8)
        return canvas

    # -- 카드 -------------------------------------------------------------
    def _material_image(self, scene: Scene) -> Image.Image | None:
        key = scene.card.get("material")
        path = self.materials.get(key) if key else None
        if path and path.suffix.lower() in media.IMAGE_EXTS:
            return draw.load_image(path)
        return None

    def card_overlay(self, scene: Scene, t: float):
        reveal = None
        if scene.kind == "checklist":
            reveal = sum(1 for r in scene.card.get("reveal", []) if r <= t + 0.05)
        key = (scene.index, reveal)
        if key not in self._cards:
            img, pos, slot = draw.card(scene, self.tpl, self.fonts, reveal=reveal,
                                       material=self._material_image(scene), handle=self.handle)
            self._cards[key] = (to_rgba_array(img) if img is not None else None, pos, slot, img)
        return self._cards[key]

    def _slot_frame(self, scene: Scene, t: float) -> np.ndarray | None:
        local = t - scene.start
        if scene.kind == "demo" and self.demo:
            return self.demo.frame_at(self._demo_offsets.get(scene.index, 0.0) + local)
        key = scene.card.get("material")
        path = self.materials.get(key) if key else None
        if path and path.suffix.lower() in media.VIDEO_EXTS:
            src = self._mat_video.setdefault(key, VideoSource(path))
            return src.frame_at(local)
        return None

    # -- 자막 -------------------------------------------------------------
    def subtitle_overlay(self, scene: Scene, t: float):
        for li, line in enumerate(scene.lines):
            if line.start - 0.05 <= t < line.end:
                key = (scene.index, li, scene.layout)
                if key not in self._subs:
                    img, x, y = draw.subtitle(line, self.tpl, self.fonts, scene.layout)
                    self._subs[key] = (to_rgba_array(img), x, y, line.start)
                return self._subs[key]
        return None

    # -- 프레임 하나 ------------------------------------------------------
    def frame(self, src: np.ndarray, t: float) -> np.ndarray:
        si = self.scene_index(t)
        scene = self.scenes[si]
        local = t - scene.start
        canvas = self.background(src, scene, self.faces[si], local)
        if self.headline is not None:
            blend(canvas, self.headline, 0, 0)
        show_card = scene.layout == "half" or scene.kind in ("hook", "closing")
        if scene.kind == "hook" and self.headline is not None:
            show_card = False  # 고정 제목이 이미 훅 역할
        if show_card:
            arr, (x, y), slot, _ = self.card_overlay(scene, t)
            if slot is not None:
                fr = self._slot_frame(scene, t)
                if fr is not None:
                    sx, sy, sw, sh = slot
                    fitted = _fit_into(fr, sw, sh)
                    fh, fw = fitted.shape[:2]
                    ox, oy = sx + (sw - fw) // 2, sy + (sh - fh) // 2
                    arr = arr.copy()
                    arr[oy - y: oy - y + fh, ox - x: ox - x + fw, :3] = fitted
                    arr[oy - y: oy - y + fh, ox - x: ox - x + fw, 3] = 255
            if arr is not None:
                p = _ease(local / 0.18)
                if p < 1.0 and scene.kind != "hook":
                    _pop_blend(canvas, arr, x, y, p)
                else:
                    blend(canvas, arr, x, y)
        sub = self.subtitle_overlay(scene, t)
        if sub is not None:
            arr, x, y, start = sub
            p = _ease((t - start) / 0.1)
            if p < 1.0:
                _pop_blend(canvas, arr, x, y, p, 0.92)
            else:
                blend(canvas, arr, x, y)
        if self.tpl.progress:
            w = int(W * min(1.0, t / self.total))
            canvas[0:14, :w] = draw.rgb(self.tpl.palette.accent)
            canvas[0:14, w:] = (canvas[0:14, w:] * 0.35).astype(np.uint8)
        return canvas


def _fit_into(fr: np.ndarray, sw: int, sh: int) -> np.ndarray:
    h, w = fr.shape[:2]
    s = min(sw / w, sh / h)
    return _resize(fr, max(1, int(w * s)), max(1, int(h * s)))


def _pop_blend(canvas: np.ndarray, arr: np.ndarray, x: int, y: int, p: float, s0: float = 0.88) -> None:
    """등장할 때 살짝 커지며 나타나기."""
    s = s0 + (1 - s0) * p
    h, w = arr.shape[:2]
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    small = _resize(arr, nw, nh)
    blend(canvas, small, x + (w - nw) // 2, y + (h - nh) // 2, opacity=p)


# ---------------------------------------------------------------------------
# 3) 굽기
# ---------------------------------------------------------------------------
def render(base_video: Path, audio: Path, out_path: Path, comp: Compositor, duration: float, fps: int,
           progress: Callable[[float], None] | None = None) -> Path:
    info = media.probe(base_video)
    sw, sh = info.width, info.height
    n_frames = max(1, int(round(duration * fps)))
    reader = media.popen(["-nostdin", "-i", str(base_video), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    writer = media.popen(
        ["-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
         "-i", str(audio), "-map", "0:v", "-map", "1:a", *media.video_encoder(), "-pix_fmt", "yuv420p",
         "-r", str(fps), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", str(out_path)],
        stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    frame_bytes = sw * sh * 3
    last: np.ndarray | None = None
    try:
        for i in range(n_frames):
            raw = reader.stdout.read(frame_bytes) if reader.stdout else b""
            if len(raw) == frame_bytes:
                last = np.frombuffer(raw, np.uint8).reshape(sh, sw, 3)
            if last is None:
                last = np.zeros((sh, sw, 3), np.uint8)
            out = comp.frame(last, i / fps)
            writer.stdin.write(out.tobytes())
            if progress and i % 15 == 0:
                progress(i / n_frames)
    finally:
        if writer.stdin:
            writer.stdin.close()
        err = writer.stderr.read().decode("utf-8", "replace") if writer.stderr else ""
        writer.wait()
        reader.kill()
        reader.wait()
    if writer.returncode != 0:
        raise media.MediaError(f"영상 굽기 실패:\n{err[-1500:]}")
    if progress:
        progress(1.0)
    return out_path


def build_audio(base_audio: Path, scenes: list[Scene], tpl: Template, out_wav: Path, work: Path,
                lufs: float, tp: float, use_sfx: bool, sfx_dir: Path | None) -> dict:
    speech = media.read_audio_f32(base_audio, sfx.SR, 2)
    cues = [c for s in scenes for c in s.sfx] if use_sfx else []
    mixed = sfx.mix(speech, cues, tpl.sfx_level, sfx_dir)
    peak = float(np.max(np.abs(mixed))) if len(mixed) else 0.0
    if peak > 0.99:
        mixed = mixed * (0.99 / peak)
    raw = work / f"mix_{tpl.id}.wav"
    media.write_wav_f32(raw, mixed, sfx.SR)
    if not len(mixed) or float(np.max(np.abs(mixed))) < 1e-4:
        raw.replace(out_wav)  # 소리 없는 영상
        return {}
    return media.loudnorm(raw, out_wav, lufs, tp)


def still(comp: Compositor, src: np.ndarray, t: float) -> Image.Image:
    return Image.fromarray(comp.frame(src, t))


def nearest_time(scenes: list[Scene], kind: str, offset: float = 0.6) -> float | None:
    for s in scenes:
        if s.kind == kind:
            return s.start + min(offset, max(0.0, s.dur - 0.05))
    return None
