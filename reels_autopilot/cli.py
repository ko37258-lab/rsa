"""명령줄 — 창 없이도 같은 일을 합니다.

사용 예:
    python -m reels_autopilot ui                          # 화면 띄우기 (권장)
    python -m reels_autopilot make 촬영.mp4 --script 대본.txt
    python -m reels_autopilot make 촬영.mp4 --template auto --variants 3   # 한 번에 3가지 꾸밈
    python -m reels_autopilot watch                       # 자동 모드: 넣는곳 폴더 감시
    python -m reels_autopilot script "토지 투자 전 확인할 3가지"   # 대본 만들기
    python -m reels_autopilot bench 레퍼런스폴더 --apply     # 잘 되는 릴스 재서 기준값 바꾸기
    python -m reels_autopilot templates --preview          # 템플릿 100개 미리보기 그림
    python -m reels_autopilot fonts                        # 무료 한글 글꼴 30종 받기
    python -m reels_autopilot doctor                       # 설치 점검
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from . import APP_NAME, __version__
from .settings import Settings


def _settings(args) -> Settings:
    s = Settings.load()
    if getattr(args, "no_ai", False):
        s.ai_enabled = False
    return s


def cmd_make(args) -> int:
    from . import media
    from .pipeline import JobInput, make_reel

    s = _settings(args)
    script = ""
    if args.script:
        p = Path(args.script)
        script = p.read_text(encoding="utf-8") if p.exists() else args.script
    templates = [t.strip() for t in args.template.split(",") if t.strip()]
    inp = JobInput(video=Path(args.video), script=script, demo=Path(args.demo) if args.demo else None,
                   templates=templates, variants=args.variants,
                   materials_dir=Path(args.materials) if args.materials else None,
                   use_ai=not args.no_ai, out_dir=Path(args.out) if args.out else None,
                   transcript=Path(args.transcript) if args.transcript else None,
                   headline=args.headline or "", cut_silence=not args.keep_silence,
                   remove_fillers=not args.keep_fillers, speed_up=not args.no_speed, keep_work=args.keep_work)

    last = [-1]

    def progress(f: float, stage: str) -> None:
        pct = int(f * 100)
        if pct // 5 != last[0]:
            last[0] = pct // 5
            print(f"    … {pct}% ({stage})", flush=True)

    res = make_reel(inp, s, progress=progress)
    if args.open or (s.open_when_done and not args.no_open and sys.stdout.isatty()):
        media.open_path(res.videos[0])
    return 0


def cmd_watch(args) -> int:
    from .watch import run_forever

    run_forever(_settings(args), once=args.once)
    return 0


def cmd_ui(args) -> int:
    from .webui.server import serve

    serve(port=args.port, open_browser=not args.no_browser)
    return 0


def cmd_script(args) -> int:
    from .director import generate_script

    text, source = generate_script(args.topic, _settings(args), seconds=args.seconds)
    print(text)
    if source == "rules":
        print("\n(AI 키가 없어 빈칸 대본입니다. 괄호 안을 내 말로 바꿔 읽으세요.)", file=sys.stderr)
    return 0


def cmd_bench(args) -> int:
    from .bench import run

    run(Path(args.folder), _settings(args), apply=args.apply)
    return 0


def cmd_templates(args) -> int:
    from . import templates
    from .fonts import add_font_dir
    from .preview import cached

    s = _settings(args)
    if args.preview:
        add_font_dir(s.dirs()["fonts"])
        out = Path(args.preview_dir) if args.preview_dir else s.dirs()["cache"] / "previews"
        for t in templates.TEMPLATES:
            cached(t, out)
        print(f"미리보기 {len(templates.TEMPLATES)}장 → {out}")
        return 0
    for t in templates.TEMPLATES:
        print(f"{t.id}  {t.name:<28}  {t.desc}")
    return 0


def cmd_fonts(args) -> int:
    from . import fonts

    dest = _settings(args).dirs()["fonts"]
    print(f"구글 무료 한글 글꼴(OFL)을 '{dest}' 에 받습니다…")
    got = fonts.download(dest)
    print(f"완료: {len(got)}/{len(fonts.CATALOG)}종")
    return 0 if got else 1


def cmd_doctor(args) -> int:
    from . import fonts, media

    s = _settings(args)
    ok = True
    print(f"{APP_NAME} {__version__} / 파이썬 {sys.version.split()[0]}")
    print(f"작업폴더: {s.workspace_path}")
    try:
        print(f"✓ ffmpeg: {media.ffmpeg_bin()} (ffprobe: {media.ffprobe_bin() or '없음 → ffmpeg 로 대신'})")
        print(f"  인코더: {' '.join(media.video_encoder()[:2])}")
    except media.MediaError as e:
        ok = False
        print(f"✗ {e}")
    for mod, why in (("faster_whisper", "받아쓰기"), ("numpy", "계산"), ("PIL", "그림"), ("cv2", "얼굴 찾기(없어도 됨)"),
                     ("fontTools", "글자 검사(없어도 됨)"), ("anthropic", "AI 연출(없어도 됨)")):
        try:
            __import__(mod)
            print(f"✓ {mod} ({why})")
        except ImportError:
            essential = mod in ("faster_whisper", "numpy", "PIL")
            ok = ok and not essential
            print(f"{'✗' if essential else '·'} {mod} 없음 ({why})")
    fonts.add_font_dir(s.dirs()["fonts"])
    have = fonts.installed()
    print(f"{'✓' if have else '·'} 무료 글꼴 {len(have)}/{len(fonts.CATALOG)}종"
          + ("" if have else f" — 기본 글꼴 사용: {fonts.system_font()}"))
    print(f"{'✓' if s.ai_available else '·'} AI 연출: "
          + ("켜짐 (Claude)" if s.ai_available else "꺼짐 — .env 에 ANTHROPIC_API_KEY 를 넣으면 켜집니다"))
    print("모든 준비가 끝났습니다." if ok else "빠진 부품이 있습니다. '설치'를 다시 실행하세요.")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    if sys.platform == "win32":  # 콘솔 한글 깨짐 방지
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
            sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass
    p = argparse.ArgumentParser(prog="reels_autopilot", description=f"{APP_NAME} — 찍은 영상을 릴스로 자동 편집")
    sub = p.add_subparsers(dest="cmd", required=True)

    m = sub.add_parser("make", help="영상 하나를 릴스로 만들기")
    m.add_argument("video")
    m.add_argument("--script", help="대본 파일 경로 또는 대본 글")
    m.add_argument("--demo", help="시연 화면 녹화 영상")
    m.add_argument("--template", default="auto", help="템플릿 ID·이름 (쉼표로 여러 개, 기본 auto)")
    m.add_argument("--variants", type=int, help="auto 일 때 몇 가지 꾸밈을 뽑을지")
    m.add_argument("--materials", help="자료 폴더 (파일 이름이 대본에 나오면 그 장면에 삽입)")
    m.add_argument("--headline", help="위에 고정할 제목")
    m.add_argument("--out", help="결과 폴더")
    m.add_argument("--transcript", help="받아쓰기 JSON (받아쓰기 단계 건너뛰기)")
    m.add_argument("--no-ai", action="store_true", help="AI 연출 끄기")
    m.add_argument("--keep-silence", action="store_true", help="빈 곳 자르지 않기")
    m.add_argument("--keep-fillers", action="store_true", help="군말 자르지 않기")
    m.add_argument("--no-speed", action="store_true", help="배속하지 않기")
    m.add_argument("--keep-work", action="store_true", help="중간 파일 남기기")
    m.add_argument("--open", action="store_true", help="다 되면 영상 열기")
    m.add_argument("--no-open", action="store_true", help="다 돼도 열지 않기")
    m.set_defaults(func=cmd_make)

    w = sub.add_parser("watch", help="자동 모드: 넣는곳 폴더 감시")
    w.add_argument("--once", action="store_true", help="지금 있는 것만 처리하고 끝내기")
    w.add_argument("--no-ai", action="store_true")
    w.set_defaults(func=cmd_watch)

    u = sub.add_parser("ui", help="화면 띄우기")
    u.add_argument("--port", type=int, default=int(os.environ.get("REELS_PORT", "8765")))
    u.add_argument("--no-browser", action="store_true")
    u.set_defaults(func=cmd_ui)

    sc = sub.add_parser("script", help="주제 한 줄로 대본 만들기")
    sc.add_argument("topic")
    sc.add_argument("--seconds", type=int, default=36)
    sc.add_argument("--no-ai", action="store_true")
    sc.set_defaults(func=cmd_script)

    b = sub.add_parser("bench", help="레퍼런스 릴스 재서 기준값 만들기")
    b.add_argument("folder")
    b.add_argument("--apply", action="store_true", help="잰 숫자를 편집 기준값으로 저장")
    b.set_defaults(func=cmd_bench)

    t = sub.add_parser("templates", help="템플릿 목록·미리보기")
    t.add_argument("--preview", action="store_true", help="미리보기 그림 만들기")
    t.add_argument("--preview-dir")
    t.set_defaults(func=cmd_templates)

    f = sub.add_parser("fonts", help="무료 한글 글꼴 30종 받기")
    f.set_defaults(func=cmd_fonts)

    d = sub.add_parser("doctor", help="설치 점검")
    d.set_defaults(func=cmd_doctor)

    args = p.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        print("\n멈췄습니다.")
        return 130
    except Exception as e:
        print(f"\n✗ 오류: {e}", file=sys.stderr)
        return 1
