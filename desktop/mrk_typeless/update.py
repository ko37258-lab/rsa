"""새 버전 확인: GitHub 릴리스의 최신 태그(desktop-vX.Y.Z)와 지금 버전을 비교합니다. 켤 때 한 번, 조용히 합니다."""

import logging
import re

import requests

from . import __version__

LATEST_URL = "https://api.github.com/repos/ko37258-lab/rsa/releases/latest"
DOWNLOAD_URL = "https://mrk-typeless.vercel.app/download"

log = logging.getLogger("mrk_typeless")


def parse_version(text: str) -> tuple[int, ...]:
    """'desktop-v1.2.0' 또는 '1.2.0' → (1, 2, 0). 모양이 다르면 빈 튜플."""
    m = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    return tuple(int(x) for x in m.groups()) if m else ()


def is_newer(latest: str, current: str = __version__) -> bool:
    a, b = parse_version(latest), parse_version(current)
    return bool(a and b) and a > b


def fetch_latest(timeout: float = 6.0) -> str | None:
    """최신 릴리스 태그. 인터넷이 안 되거나 GitHub가 막혀 있으면 None (오류를 내지 않음)."""
    try:
        res = requests.get(LATEST_URL, headers={"Accept": "application/vnd.github+json"}, timeout=timeout)
        if not res.ok:
            return None
        tag = res.json().get("tag_name")
        return tag if isinstance(tag, str) else None
    except (requests.RequestException, ValueError):
        return None
    except Exception:  # noqa: BLE001 - 업데이트 확인은 실패해도 프로그램에 영향을 주지 않습니다
        log.exception("업데이트 확인 실패")
        return None


def check() -> str | None:
    """지금보다 새 버전이 있으면 그 버전 문자열('1.2.0'), 없으면 None."""
    tag = fetch_latest()
    if tag and is_newer(tag):
        return ".".join(str(x) for x in parse_version(tag))
    return None
