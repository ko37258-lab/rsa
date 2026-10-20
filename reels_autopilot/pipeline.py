"""공장 라인 — 찍은 영상 하나가 업로드 꾸러미가 되기까지 전 단계를 순서대로 돌립니다.

받아쓰기 → 대본 맞춤 → 빈 곳·군말 자르기 → 말 빠르기 → 장면 나누기 → AI 연출
→ (템플릿마다) 효과음·소리 맞춤·굽기·검수 → 썸네일·캡션.
단계가 나뉘어 있어 어디서 문제가 생겼는지 기록에 바로 보입니다.
"""
from __future__ import annotations

import json
import re
import shutil
import threading
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Callable

from . import align, compose, director, edit, media, post, qa, scenes as S, templates, transcribe
from .fonts import add_font_dir
from .lexicon import load_terms
from .settings import Settings


class Cancelled(RuntimeError):
    pass


@dataclass
class JobInput:
    video: Path
    script: str = ""
    demo: Path | None = None  # 시연 화면 녹화
    templates: list[str] = field(default_factory=lambda: ["auto"])
    variants: int | None = None  # 'auto' 일 때 몇 개 뽑을지 (없으면 설정값)
    materials_dir: Path | None = None
    use_ai: bool = True
    out_dir: Path | None = None
    transcript: Path | None = None  # 받아쓰기 결과(JSON)를 직접 줄 때
    headline: str = ""  # 위 고정 제목 직접 지정
    cut_silence: bool = True
    remove_fillers: bool = True
    speed_up: bool = True
    keep_work: bool = False


@dataclass
class JobResult:
    out_dir: Path
    videos: list[Path]
    thumbnail: Path | None
    post: Path | None
    reports: list[dict]
    timings: dict[str, float]
    elapsed: float
    direction: dict


# 진행 막대에서 단계마다 차지하는 몫
_WEIGHTS = [("준비", 0.02), ("받아쓰기", 0.33), ("대본 맞춤", 0.01), ("편집 결정", 0.01), ("자르기·배속", 0.08),
            ("장면·연출", 0.05), ("얼굴 찾기", 0.03), ("굽기", 0.45), ("마무리", 0.02)]


class Progress:
    def __init__(self, cb: Callable[[float, str], None] | None, cancel: threading.Event | None):
        self.cb = cb
        self.cancel = cancel
        self.base = 0.0
        self.weights = dict(_WEIGHTS)
        self.stage = ""

    def start(self, stage: str) -> None:
        if self.cancel and self.cancel.is_set():
            raise Cancelled("사용자가 멈췄습니다.")
        if self.stage:
            self.base += self.weights.get(self.stage, 0.0)
        self.stage = stage
        self.update(0.0)

    def update(self, frac: float) -> None:
        if self.cancel and self.cancel.is_set():
            raise Cancelled("사용자가 멈췄습니다.")
        if self.cb:
            self.cb(min(0.999, self.base + self.weights.get(self.stage, 0.0) * frac), self.stage)


def find_materials(*dirs: Path | None) -> dict[str, Path]:
    """'01_용적률.png' → {'용적률': 경로}. 파일 이름이 대본에 나오면 그 장면에 자동으로 들어갑니다."""
    out: dict[str, Path] = {}
    for d in dirs:
        if not d or not d.exists():
            continue
        for p in sorted(d.iterdir()):
            if p.suffix.lower() in media.IMAGE_EXTS | media.VIDEO_EXTS:
                key = re.sub(r"^[\d\s_\-.]+", "", p.stem).replace("_", " ").strip()
                if len(key.replace(" ", "")) >= 2:
                    out.setdefault(key, p)
    return out


def _srt_time(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def write_srt(scenes: list[S.Scene], path: Path) -> Path:
    n = 0
    out: list[str] = []
    for s in scenes:
        for ln in s.lines:
            n += 1
            out += [str(n), f"{_srt_time(ln.start)} --> {_srt_time(ln.end)}", ln.text, ""]
    path.write_text("\n".join(out), encoding="utf-8")
    return path


def _pick_templates(inp: JobInput, scenes: list[S.Scene], settings: Settings) -> list[templates.Template]:
    picked: list[templates.Template] = []
    n_auto = inp.variants or settings.variants
    for key in inp.templates or ["auto"]:
        if key in ("auto", "자동", ""):
            picked += templates.auto_pick([s.kind for s in scenes], settings.domain, n_auto)
        else:
            picked.append(templates.get(key))
    uniq: dict[str, templates.Template] = {t.id: t for t in picked}
    return list(uniq.values())


def make_reel(inp: JobInput, settings: Settings, *, log: Callable[[str], None] = print,
              progress: Callable[[float, str], None] | None = None,
              cancel: threading.Event | None = None) -> JobResult:
    t0 = time.time()
    timings: dict[str, float] = {}
    pr = Progress(progress, cancel)
    dirs = settings.dirs()
    add_font_dir(dirs["fonts"])
    tg = settings.targets

    def stage(name: str):
        pr.start(name)
        timings[name] = time.time()
        log(f"▶ {name}")

    def done(name: str):
        timings[name] = round(time.time() - timings[name], 1)

    # ---- 준비 --------------------------------------------------------
    stage("준비")
    video = Path(inp.video).expanduser().resolve()
    info = media.probe(video)
    if not info.has_video:
        raise media.MediaError("영상이 아니거나 화면이 없는 파일입니다.")
    out_dir = inp.out_dir or dirs["output"] / f"{datetime.now():%m%d-%H%M%S}_{video.stem}"
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir / ".작업"
    work.mkdir(exist_ok=True)
    log(f"  {video.name}: {info.width}×{info.height}, {info.duration:.1f}초, 소리 {'있음' if info.has_audio else '없음'}")
    done("준비")

    # ---- 1 받아쓰기 ---------------------------------------------------
    stage("받아쓰기")
    if inp.transcript:
        words = transcribe.load_words(Path(inp.transcript))
        log(f"  받아쓰기 파일 사용: {Path(inp.transcript).name}")
    elif info.has_audio:
        words = transcribe.transcribe(video, settings, hint=inp.script, log=log, progress=pr.update)
    else:
        words = []
        log("  소리가 없어 받아쓰기를 건너뜁니다.")
    if words and info.has_audio:
        words = transcribe.tighten(words, media.read_audio_f32(video, 16000, 1)[:, 0])
    transcribe.save_words(words, out_dir / "받아쓰기.json")
    log(f"  낱말 {len(words)}개")
    done("받아쓰기")

    # ---- 2 대본 맞춤 --------------------------------------------------
    stage("대본 맞춤")
    ar = align.align(words, inp.script, tg)
    if ar.mode != "none":
        log(f"  대본 일치율 {ar.similarity * 100:.0f}% → "
            f"{'대본 글자로 통째 맞춤' if ar.mode == 'whole' else '비슷한 낱말만 고침'} ({ar.replaced}개)")
    if ar.removed:
        log(f"  대본에 없는 군말 {len(ar.removed)}개 뺌: {' '.join(w.text for w in ar.removed)}")
    for note in ar.notes:
        log(f"  ⚠ {note}")
    done("대본 맞춤")

    # ---- 3~5 자르기·군말·배속 결정 -----------------------------------
    stage("편집 결정")
    plan = edit.plan_edit(ar.words, info.duration, tg, cut_silence=inp.cut_silence,
                          remove_fillers=inp.remove_fillers, speed_up=inp.speed_up)
    plan.fillers = ar.removed + plan.fillers
    log(f"  빈 곳 {plan.cut_count}곳 자름, 군말 {len(plan.fillers)}개 뺌, "
        f"{plan.speed:.2f}배속 → 말속도 {plan.output_cps:.2f}글자/초, 길이 {plan.output_duration:.1f}초")
    (out_dir / "편집.json").write_text(json.dumps(plan.to_dict(), ensure_ascii=False, indent=1), encoding="utf-8")
    done("편집 결정")

    stage("자르기·배속")
    base_video, base_audio = work / "base.mp4", work / "base.wav"
    compose.cut_base(video, plan, info, base_video, base_audio, tg.fps, work)
    done("자르기·배속")

    # ---- 6 장면 나누기 + AI 연출 --------------------------------------
    stage("장면·연출")
    materials = find_materials(dirs["materials"], inp.materials_dir)
    terms = load_terms(settings.domain, dirs["workspace"] / "사전.txt")
    scene_list = S.build_scenes(plan.words, tg, terms, total_duration=plan.output_duration, materials=materials,
                                has_demo=bool(inp.demo), cta=settings.cta_keyword)
    direction = director.direct(scene_list, settings, use_ai=inp.use_ai, log=log)
    S.apply_direction(scene_list, direction, tg)
    kinds = [s.kind for s in scene_list]
    log(f"  장면 {len(scene_list)}개: " + ", ".join(f"{k} {kinds.count(k)}" for k in dict.fromkeys(kinds)))
    log(f"  문구: {'Claude 연출' if direction.get('source') == 'ai' else '규칙 연출 (AI 키 없음/끔)'}")
    chosen = _pick_templates(inp, scene_list, settings)
    log("  템플릿: " + ", ".join(t.name for t in chosen))
    write_srt(scene_list, out_dir / "자막.srt")
    done("장면·연출")

    stage("얼굴 찾기")
    faces = compose.track_faces(base_video, plan.output_duration)
    log(f"  얼굴 {len(faces)}번 찾음" if faces else "  얼굴을 못 찾아 화면 가운데 기준으로 배치")
    done("얼굴 찾기")

    # ---- 7 템플릿마다 굽기 -------------------------------------------
    stage("굽기")
    videos: list[Path] = []
    reports: list[dict] = []
    n = len(chosen)
    headline_title = inp.headline or direction.get("hook_title", "")
    for vi, tpl in enumerate(chosen):
        S.assign_layouts(scene_list, tpl.cycle)
        final_audio = work / f"audio_{tpl.id}.wav"
        compose.build_audio(base_audio, scene_list, tpl, final_audio, work, tg.loudness_lufs, tg.true_peak,
                            settings.sfx, dirs["sfx"])
        comp = compose.Compositor(tpl, scene_list, plan.output_duration, faces=faces, materials=materials,
                                  demo=inp.demo, handle=settings.brand_handle, headline_title=headline_title)
        out = out_dir / (f"릴스_{tpl.id}.mp4" if n > 1 else "릴스.mp4")
        log(f"  [{vi + 1}/{n}] {tpl.name} 굽는 중…")
        compose.render(base_video, final_audio, out, comp, plan.output_duration, tg.fps,
                       progress=lambda f, vi=vi: pr.update((vi + f) / n))
        rep = qa.check(out, plan, scene_list, tg)
        rep["template"] = tpl.name
        qa.save(rep, out_dir, out.stem)
        bad = [r["name"] for r in rep["rows"] if not r["ok"] and not r["warn_only"]]
        log(f"  ✓ {out.name} — 검수 {'통과' if rep['passed'] else '확인 필요: ' + ', '.join(bad)} "
            f"(말속도 {rep['measured']['cps']}, {rep['measured']['lufs']} LUFS)")
        videos.append(out)
        reports.append(rep)
    (out_dir / "장면.json").write_text(json.dumps([s.to_dict() for s in scene_list], ensure_ascii=False, indent=1),
                                     encoding="utf-8")
    done("굽기")

    # ---- 마무리: 썸네일·캡션 -----------------------------------------
    stage("마무리")
    hook = scene_list[0]
    thumb = post.write_thumbnail(base_video, hook.start + min(0.8, hook.dur / 2),
                                 direction.get("thumbnail_title") or headline_title, chosen[0], out_dir, work)
    post_md = post.write_post(direction, out_dir, settings.brand_handle)
    done("마무리")
    if not inp.keep_work:
        shutil.rmtree(work, ignore_errors=True)
    elapsed = round(time.time() - t0, 1)
    m, s = divmod(int(elapsed), 60)
    log(f"■ 완성! {m}분 {s}초 — {out_dir}")
    log("  단계별 시간: " + ", ".join(f"{k} {v}초" for k, v in timings.items()))
    if progress:
        progress(1.0, "완료")
    return JobResult(out_dir, videos, thumb, post_md, reports, timings, elapsed, direction)


def run_safely(inp: JobInput, settings: Settings, log: Callable[[str], None] = print, **kw) -> JobResult | None:
    """오류가 나도 기록을 남기고 None 을 돌려줍니다(자동 모드·화면용)."""
    try:
        return make_reel(inp, settings, log=log, **kw)
    except Cancelled as e:
        log(f"■ 멈춤: {e}")
    except Exception as e:  # 사용자에게 '기록 복사'로 보낼 수 있게 자세히 남김
        log(f"■ 오류: {e}")
        log(traceback.format_exc())
    return None
