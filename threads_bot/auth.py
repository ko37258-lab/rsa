"""토큰 발급/저장/갱신 로직.

플로우:
1. build_authorize_url()로 인증 URL 생성 → 브라우저에서 로그인
2. 리디렉트된 주소의 ?code=... 값을 붙여넣기
3. 단기 토큰 발급 → 즉시 장기 토큰(60일)으로 교환 → state.json 저장
"""
from __future__ import annotations

import time
from urllib.parse import parse_qs, urlparse

from . import threads_api
from .config import Config
from .store import State


def extract_code(pasted: str) -> str:
    """사용자가 붙여넣은 값에서 code를 추출. 전체 URL이든 code만이든 처리."""
    pasted = pasted.strip()
    if "code=" in pasted:
        query = urlparse(pasted).query or pasted
        codes = parse_qs(query).get("code")
        if codes:
            # 메타는 code 뒤에 #_ 를 붙이기도 합니다.
            return codes[0].split("#")[0]
    return pasted.split("#")[0]


def complete_login(cfg: Config, code_or_url: str, state: State) -> State:
    """code로 로그인을 완료하고 장기 토큰을 저장합니다."""
    cfg.require_app()
    code = extract_code(code_or_url)

    short = threads_api.exchange_code_for_token(
        cfg.app_id, cfg.app_secret, cfg.redirect_uri, code
    )
    short_token = short["access_token"]
    user_id = str(short.get("user_id", ""))

    long = threads_api.exchange_for_long_lived(cfg.app_secret, short_token)
    long_token = long["access_token"]
    expires_in = int(long.get("expires_in", 60 * 86400))

    state.access_token = long_token
    state.token_expires_at = time.time() + expires_in
    if user_id:
        state.user_id = user_id

    # 사용자 이름 조회(자기 자신 답글 필터링에 사용).
    try:
        client = threads_api.ThreadsClient(long_token)
        me = client.me()
        state.user_id = str(me.get("id", state.user_id))
        state.username = me.get("username", state.username)
    except threads_api.ThreadsAPIError:
        pass

    state.save()
    return state


def ensure_fresh_token(state: State) -> State:
    """만료가 임박했으면 장기 토큰을 자동 갱신합니다."""
    if not state.has_token():
        raise SystemExit("토큰이 없습니다. 먼저 `login`으로 로그인하세요.")
    if state.is_expired():
        raise SystemExit(
            "토큰이 만료되었습니다. `login`으로 다시 로그인하세요."
        )
    if state.needs_refresh():
        refreshed = threads_api.refresh_long_lived(state.access_token)
        state.access_token = refreshed["access_token"]
        expires_in = int(refreshed.get("expires_in", 60 * 86400))
        state.token_expires_at = time.time() + expires_in
        state.save()
    return state
