"""메타 Threads Graph API 저수준 클라이언트.

공식 문서: https://developers.facebook.com/docs/threads
모든 호출은 https://graph.threads.net 를 사용합니다.
"""
from __future__ import annotations

import time
from typing import Any, Optional
from urllib.parse import urlencode

import requests

from .config import API_VERSION, GRAPH_BASE

AUTHORIZE_URL = "https://threads.net/oauth/authorize"
TIMEOUT = 30


class ThreadsAPIError(RuntimeError):
    def __init__(self, message: str, payload: Any = None):
        super().__init__(message)
        self.payload = payload


def _check(resp: requests.Response) -> dict:
    try:
        data = resp.json()
    except ValueError:
        resp.raise_for_status()
        raise ThreadsAPIError(f"JSON 응답이 아님: {resp.text[:200]}")
    if resp.status_code >= 400 or "error" in data:
        err = data.get("error", {}) if isinstance(data, dict) else {}
        msg = err.get("message") or resp.text
        raise ThreadsAPIError(f"API 오류({resp.status_code}): {msg}", payload=data)
    return data


# ---------------------------------------------------------------------------
# OAuth / 토큰
# ---------------------------------------------------------------------------
def build_authorize_url(app_id: str, redirect_uri: str, scopes: list[str]) -> str:
    """사용자가 브라우저에서 열 인증 URL을 만듭니다."""
    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "scope": ",".join(scopes),
        "response_type": "code",
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def exchange_code_for_token(
    app_id: str, app_secret: str, redirect_uri: str, code: str
) -> dict:
    """authorization code → 단기 토큰(약 1시간)."""
    resp = requests.post(
        f"{GRAPH_BASE}/oauth/access_token",
        data={
            "client_id": app_id,
            "client_secret": app_secret,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
            "code": code,
        },
        timeout=TIMEOUT,
    )
    return _check(resp)


def exchange_for_long_lived(app_secret: str, short_token: str) -> dict:
    """단기 토큰 → 장기 토큰(약 60일). 버튼 하나로 만료 걱정 끝."""
    resp = requests.get(
        f"{GRAPH_BASE}/access_token",
        params={
            "grant_type": "th_exchange_token",
            "client_secret": app_secret,
            "access_token": short_token,
        },
        timeout=TIMEOUT,
    )
    return _check(resp)


def refresh_long_lived(long_token: str) -> dict:
    """장기 토큰 갱신(다시 60일). 유효기간이 남아 있을 때만 가능."""
    resp = requests.get(
        f"{GRAPH_BASE}/refresh_access_token",
        params={
            "grant_type": "th_refresh_token",
            "access_token": long_token,
        },
        timeout=TIMEOUT,
    )
    return _check(resp)


# ---------------------------------------------------------------------------
# 클라이언트
# ---------------------------------------------------------------------------
class ThreadsClient:
    def __init__(self, access_token: str):
        self.access_token = access_token
        self.base = f"{GRAPH_BASE}/{API_VERSION}"

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        params = dict(params or {})
        params["access_token"] = self.access_token
        resp = requests.get(f"{self.base}/{path}", params=params, timeout=TIMEOUT)
        return _check(resp)

    def _post(self, path: str, params: dict) -> dict:
        params = dict(params)
        params["access_token"] = self.access_token
        resp = requests.post(f"{self.base}/{path}", data=params, timeout=TIMEOUT)
        return _check(resp)

    # --- 프로필 ---
    def me(self, fields: str = "id,username,threads_profile_picture_url") -> dict:
        return self._get("me", {"fields": fields})

    # --- 글 발행 (2단계) ---
    def create_text_container(
        self, text: str, reply_to_id: Optional[str] = None
    ) -> str:
        """1단계: 미디어 컨테이너 생성 → creation_id 반환."""
        params: dict[str, Any] = {"media_type": "TEXT", "text": text}
        if reply_to_id:
            params["reply_to_id"] = reply_to_id
        data = self._post("me/threads", params)
        return data["id"]

    def create_image_container(
        self, image_url: str, text: str = "", reply_to_id: Optional[str] = None
    ) -> str:
        params: dict[str, Any] = {"media_type": "IMAGE", "image_url": image_url}
        if text:
            params["text"] = text
        if reply_to_id:
            params["reply_to_id"] = reply_to_id
        data = self._post("me/threads", params)
        return data["id"]

    def publish_container(self, creation_id: str) -> str:
        """2단계: 컨테이너 발행 → 최종 media_id 반환."""
        data = self._post("me/threads_publish", {"creation_id": creation_id})
        return data["id"]

    def publish_text(
        self,
        text: str,
        reply_to_id: Optional[str] = None,
        wait_seconds: float = 3.0,
    ) -> str:
        """텍스트 글 발행 (컨테이너 생성 → 잠깐 대기 → 발행)."""
        creation_id = self.create_text_container(text, reply_to_id=reply_to_id)
        # 메타 권장: 컨테이너 처리 시간을 위해 잠깐 대기 후 발행.
        if wait_seconds > 0:
            time.sleep(wait_seconds)
        return self.publish_container(creation_id)

    # --- 내 글 목록 ---
    def my_threads(
        self,
        limit: int = 25,
        fields: str = "id,text,timestamp,permalink,media_type",
        since: Optional[str] = None,
    ) -> list[dict]:
        params: dict[str, Any] = {"fields": fields, "limit": limit}
        if since:
            params["since"] = since
        data = self._get("me/threads", params)
        return data.get("data", [])

    # --- 답글 읽기 ---
    def replies(
        self,
        media_id: str,
        fields: str = "id,text,username,timestamp,from,replied_to,root_post",
    ) -> list[dict]:
        """특정 글에 달린 최상위 답글 목록."""
        data = self._get(f"{media_id}/replies", {"fields": fields})
        return data.get("data", [])

    def conversation(
        self,
        media_id: str,
        fields: str = "id,text,username,timestamp,from,replied_to,root_post",
    ) -> list[dict]:
        """글의 전체 대화(중첩 답글 포함)."""
        data = self._get(f"{media_id}/conversation", {"fields": fields})
        return data.get("data", [])

    # --- 답글 쓰기 ---
    def reply_to(self, media_id: str, text: str, wait_seconds: float = 3.0) -> str:
        """특정 글/댓글에 답글을 답니다."""
        return self.publish_text(text, reply_to_id=media_id, wait_seconds=wait_seconds)
