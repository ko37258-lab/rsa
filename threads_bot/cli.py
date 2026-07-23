"""명령줄 인터페이스.

사용 예:
    python -m threads_bot login
    python -m threads_bot me
    python -m threads_bot publish "오늘의 글입니다 🧵"
    python -m threads_bot autoreply --dry-run
    python -m threads_bot run --interval 300
"""
from __future__ import annotations

import argparse
import sys
import time
from datetime import datetime

from . import auth, threads_api
from .autoreply import ReplyPolicy, run_once
from .config import Config
from .store import State


def _client(state: State) -> threads_api.ThreadsClient:
    auth.ensure_fresh_token(state)
    return threads_api.ThreadsClient(state.access_token)


def cmd_login(args, cfg: Config, state: State) -> int:
    cfg.require_app()
    if args.code:
        auth.complete_login(cfg, args.code, state)
        print(f"✅ 로그인 완료! 사용자: @{state.username or state.user_id}")
        _print_expiry(state)
        return 0

    url = threads_api.build_authorize_url(cfg.app_id, cfg.redirect_uri, cfg.scopes)
    print("\n1) 아래 주소를 브라우저에서 열어 로그인/권한 허용을 하세요:\n")
    print(f"   {url}\n")
    print("2) 허용 후 이동한 주소창의 전체 URL(또는 code= 뒤의 값)을 복사하세요.")
    print("   (형식: {}?code=XXXXXXXX...)\n".format(cfg.redirect_uri))
    try:
        pasted = input("3) 여기에 붙여넣고 Enter: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n취소되었습니다.")
        return 1
    if not pasted:
        print("입력이 비어 있습니다.")
        return 1
    auth.complete_login(cfg, pasted, state)
    print(f"\n✅ 로그인 완료! 사용자: @{state.username or state.user_id}")
    _print_expiry(state)
    return 0


def cmd_refresh(args, cfg: Config, state: State) -> int:
    if not state.has_token():
        print("토큰이 없습니다. 먼저 login 하세요.")
        return 1
    refreshed = threads_api.refresh_long_lived(state.access_token)
    state.access_token = refreshed["access_token"]
    state.token_expires_at = time.time() + int(refreshed.get("expires_in", 60 * 86400))
    state.save()
    print("✅ 장기 토큰을 갱신했습니다.")
    _print_expiry(state)
    return 0


def cmd_me(args, cfg: Config, state: State) -> int:
    client = _client(state)
    me = client.me(fields="id,username,threads_profile_picture_url")
    print(f"id       : {me.get('id')}")
    print(f"username : @{me.get('username')}")
    _print_expiry(state)
    return 0


def cmd_publish(args, cfg: Config, state: State) -> int:
    client = _client(state)
    if args.image:
        media_id = client.publish_container(
            client.create_image_container(args.image, text=args.text or "")
        )
    else:
        if not args.text:
            print("발행할 텍스트를 입력하세요.")
            return 1
        media_id = client.publish_text(args.text)
    print(f"✅ 발행 완료! media_id={media_id}")
    return 0


def cmd_replies(args, cfg: Config, state: State) -> int:
    client = _client(state)
    posts = client.my_threads(limit=args.limit)
    for post in posts:
        text = (post.get("text") or "").replace("\n", " ")[:50]
        print(f"\n📝 {post['id']}  {text}")
        try:
            for r in client.replies(post["id"]):
                who = (r.get("from") or {}).get("username") or r.get("username") or "?"
                rt = (r.get("text") or "").replace("\n", " ")[:60]
                print(f"   └ @{who}: {rt}")
        except threads_api.ThreadsAPIError as e:
            print(f"   (답글 조회 실패: {e})")
    return 0


def cmd_autoreply(args, cfg: Config, state: State) -> int:
    client = _client(state)
    policy = ReplyPolicy.load()
    print(f"[{_now()}] 자동답글 실행{' (모의)' if args.dry_run else ''} ...")
    result = run_once(
        client, state, policy, post_limit=args.limit, dry_run=args.dry_run
    )
    print(
        f"완료 — 글 {result.checked_posts}개 / 답글 {result.checked_replies}개 확인, "
        f"발송 {result.sent} · 건너뜀 {result.skipped} · 오류 {result.errors}"
    )
    return 0


def cmd_run(args, cfg: Config, state: State) -> int:
    """주기적으로 자동답글을 반복 실행하는 상주 모드."""
    policy = ReplyPolicy.load()
    print(f"자동답글 상주 모드 시작 — {args.interval}초 간격 (Ctrl+C로 종료)")
    try:
        while True:
            state = State.load(state.path)
            try:
                client = _client(state)
                print(f"\n[{_now()}] 점검 중...")
                result = run_once(
                    client, state, policy, post_limit=args.limit, dry_run=args.dry_run
                )
                print(
                    f"  발송 {result.sent} · 건너뜀 {result.skipped} · 오류 {result.errors}"
                )
            except threads_api.ThreadsAPIError as e:
                print(f"  [API 오류] {e}")
            except SystemExit as e:
                print(f"  [중단] {e}")
                return 1
            time.sleep(max(30, args.interval))
    except KeyboardInterrupt:
        print("\n종료합니다.")
        return 0


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _print_expiry(state: State) -> None:
    if state.token_expires_at:
        days = state.seconds_until_expiry() / 86400
        when = datetime.fromtimestamp(state.token_expires_at).strftime("%Y-%m-%d %H:%M")
        print(f"토큰 만료: {when} (약 {days:.1f}일 남음)")


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="threads_bot",
        description="스레드(Threads) 자동화 — 글 발행 & 댓글 자동답글 (메타 공식 API)",
    )
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("login", help="로그인하고 60일 장기 토큰 발급")
    sp.add_argument("--code", help="이미 얻은 code 또는 리디렉트 URL (비대화형)")
    sp.set_defaults(func=cmd_login)

    sp = sub.add_parser("refresh", help="장기 토큰 갱신(다시 60일)")
    sp.set_defaults(func=cmd_refresh)

    sp = sub.add_parser("me", help="내 프로필/토큰 상태 확인")
    sp.set_defaults(func=cmd_me)

    sp = sub.add_parser("publish", help="글 발행")
    sp.add_argument("text", nargs="?", help="발행할 텍스트")
    sp.add_argument("--image", help="이미지 URL (공개 접근 가능한 주소)")
    sp.set_defaults(func=cmd_publish)

    sp = sub.add_parser("replies", help="내 글의 답글 목록 보기")
    sp.add_argument("--limit", type=int, default=10, help="확인할 최근 글 수")
    sp.set_defaults(func=cmd_replies)

    sp = sub.add_parser("autoreply", help="댓글 자동답글 1회 실행")
    sp.add_argument("--limit", type=int, default=25, help="확인할 최근 글 수")
    sp.add_argument("--dry-run", action="store_true", help="실제 발송 없이 미리보기")
    sp.set_defaults(func=cmd_autoreply)

    sp = sub.add_parser("run", help="자동답글 상주 모드(주기 반복)")
    sp.add_argument("--interval", type=int, default=300, help="반복 간격(초), 최소 30")
    sp.add_argument("--limit", type=int, default=25, help="확인할 최근 글 수")
    sp.add_argument("--dry-run", action="store_true", help="실제 발송 없이 미리보기")
    sp.set_defaults(func=cmd_run)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    cfg = Config.from_env()
    state = State.load()
    try:
        return args.func(args, cfg, state)
    except threads_api.ThreadsAPIError as e:
        print(f"❌ {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
