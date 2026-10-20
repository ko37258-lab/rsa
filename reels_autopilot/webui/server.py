"""화면 서버 — http://127.0.0.1:8765 (내 컴퓨터에서만 접속 가능).

추가 설치 없이 파이썬 기본 부품만 씁니다. 편집은 한 번에 하나씩 차례로 돌립니다.
"""
from __future__ import annotations

import json
import mimetypes
import os
import queue
import re
import threading
import time
import uuid
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .. import APP_NAME, __version__, director, media, templates
from ..fonts import add_font_dir
from ..pipeline import Cancelled, JobInput, JobResult, make_reel
from ..settings import ROOT, Settings
from ..watch import Watcher

STATIC = Path(__file__).resolve().parent / "static"
MAX_LOG = 4000


# ---------------------------------------------------------------------------
# 작업 관리
# ---------------------------------------------------------------------------
class Job:
    def __init__(self, inp: JobInput, label: str):
        self.id = uuid.uuid4().hex[:10]
        self.inp = inp
        self.label = label
        self.status = "queued"
        self.progress = 0.0
        self.stage = "대기 중"
        self.log: list[str] = []
        self.result: JobResult | None = None
        self.error = ""
        self.cancel = threading.Event()
        self.created = time.time()

    def write(self, msg: str) -> None:
        for line in str(msg).splitlines() or [""]:
            self.log.append(line)
        if len(self.log) > MAX_LOG:
            del self.log[: len(self.log) - MAX_LOG]

    def to_dict(self, since: int = 0) -> dict:
        d = {"id": self.id, "label": self.label, "status": self.status, "progress": round(self.progress, 4),
             "stage": self.stage, "log": self.log[since:], "log_total": len(self.log), "error": self.error}
        if self.result:
            r = self.result
            d["result"] = {
                "out_dir": str(r.out_dir),
                "videos": [str(v) for v in r.videos],
                "thumbnail": str(r.thumbnail) if r.thumbnail else None,
                "post": r.post.read_text(encoding="utf-8") if r.post and r.post.exists() else "",
                "caption": r.direction.get("caption", ""),
                "hashtags": r.direction.get("hashtags", []),
                "first_comment": r.direction.get("first_comment", ""),
                "reports": r.reports,
                "elapsed": r.elapsed,
            }
        return d


class JobManager:
    def __init__(self, settings_ref):
        self.settings_ref = settings_ref
        self.jobs: dict[str, Job] = {}
        self.q: queue.Queue[Job] = queue.Queue()
        threading.Thread(target=self._worker, daemon=True).start()

    def submit(self, inp: JobInput, label: str) -> Job:
        job = Job(inp, label)
        self.jobs[job.id] = job
        job.write(f"줄 서는 중… ({label})")
        self.q.put(job)
        return job

    def _worker(self) -> None:
        while True:
            job = self.q.get()
            if job.cancel.is_set():
                job.status = "cancelled"
                continue
            job.status = "running"

            def prog(f: float, stage: str, job=job) -> None:
                job.progress, job.stage = f, stage

            try:
                job.result = make_reel(job.inp, self.settings_ref(), log=job.write, progress=prog, cancel=job.cancel)
                job.status, job.progress, job.stage = "done", 1.0, "완료"
                s = self.settings_ref()
                if s.open_when_done and job.result.videos:
                    media.open_path(job.result.videos[0])  # 다 되면 완성 영상이 저절로 열림
            except Cancelled as e:
                job.status, job.stage = "cancelled", "멈춤"
                job.write(f"■ {e}")
            except Exception as e:  # 기록 복사로 보낼 수 있게 자세히
                import traceback

                job.status, job.stage, job.error = "error", "오류", str(e)
                job.write(f"■ 오류: {e}")
                job.write(traceback.format_exc())


# ---------------------------------------------------------------------------
# 도우미
# ---------------------------------------------------------------------------
def recent_videos(settings: Settings, limit: int = 12) -> list[dict]:
    """최근에 찍은 영상이 미리 들어가 있게 — 작업폴더·동영상·다운로드·바탕화면에서 찾습니다."""
    dirs = settings.dirs()
    home = Path.home()
    places = [dirs["uploads"], dirs["inbox"], home / "Videos", home / "Movies", home / "Downloads",
              home / "Desktop", home / "Pictures", home / "OneDrive" / "Desktop"]
    found: list[Path] = []
    for d in places:
        try:
            found += [p for p in d.iterdir() if p.is_file() and p.suffix.lower() in media.VIDEO_EXTS]
        except OSError:
            continue
    found = sorted(set(found), key=lambda p: p.stat().st_mtime, reverse=True)[:limit]
    return [{"path": str(p), "name": p.name, "mtime": p.stat().st_mtime, "size": p.stat().st_size} for p in found]


def _inside(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _set_env_key(key: str, value: str) -> None:
    env = ROOT / ".env"
    lines = env.read_text(encoding="utf-8").splitlines() if env.exists() else []
    lines = [ln for ln in lines if not ln.startswith(f"{key}=")]
    if value:
        lines.append(f"{key}={value}")
    env.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if value:
        os.environ[key] = value
    else:
        os.environ.pop(key, None)


EDITABLE = {"persona", "brand_handle", "cta_keyword", "domain", "default_template", "variants", "ai_enabled",
            "sfx", "open_when_done", "whisper_model", "inbox"}


# ---------------------------------------------------------------------------
class App:
    def __init__(self):
        self.settings = Settings.load()
        add_font_dir(self.settings.dirs()["fonts"])
        self.jobs = JobManager(lambda: self.settings)
        self.watch_log: list[str] = []
        self.watcher = Watcher(self.settings, log=self._watch_write)
        self.preview_lock = threading.Lock()

    def _watch_write(self, msg: str) -> None:
        self.watch_log.extend(str(msg).splitlines())
        del self.watch_log[: max(0, len(self.watch_log) - MAX_LOG)]

    def state(self) -> dict:
        s = self.settings
        return {
            "app": APP_NAME, "version": __version__, "ai": s.ai_available,
            "workspace": str(s.workspace_path), "inbox": str(s.dirs()["inbox"]),
            "recent": recent_videos(s),
            "templates": templates.catalog(),
            "bases": [{"base": t.base, "label": t.label, "desc": t.desc, "id": t.id}
                      for t in templates.BASE_DEFAULT.values()],
            "settings": {k: getattr(s, k) for k in sorted(EDITABLE)},
            "targets": s.targets.__dict__,
            "watch": {"running": self.watcher.running},
            "jobs": [j.to_dict(len(j.log)) for j in sorted(self.jobs.jobs.values(), key=lambda j: -j.created)[:10]],
        }


class Handler(BaseHTTPRequestHandler):
    app: App
    server_version = "ReelsAutopilot"

    def log_message(self, fmt, *args):  # 조용히
        pass

    # -- 응답 도우미 --------------------------------------------------------
    def _json(self, data, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, msg: str, status: int = 400) -> None:
        self._json({"error": msg}, status)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").split(":")[0]
        return host in ("127.0.0.1", "localhost")

    def _file(self, path: Path, ctype: str | None = None) -> None:
        if not path.exists() or not path.is_file():
            return self._error("파일이 없습니다.", 404)
        size = path.stat().st_size
        ctype = ctype or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        rng = self.headers.get("Range")
        start, end = 0, size - 1
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng)
            if m:
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                elif m.group(2):
                    start = max(0, size - int(m.group(2)))
            end = min(end, size - 1)
            self.send_response(HTTPStatus.PARTIAL_CONTENT)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        with path.open("rb") as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    return
                left -= len(chunk)

    # -- GET ----------------------------------------------------------------
    def do_GET(self):
        if not self._host_ok():
            return self._error("forbidden", 403)
        url = urlparse(self.path)
        q = parse_qs(url.query)
        p = url.path
        app = self.app
        if p in ("/", "/index.html"):
            return self._file(STATIC / "index.html", "text/html; charset=utf-8")
        if p.startswith("/static/"):
            target = (STATIC / unquote(p[len("/static/"):])).resolve()
            return self._file(target) if _inside(target, STATIC) else self._error("forbidden", 403)
        if p == "/api/state":
            return self._json(app.state())
        if p.startswith("/api/jobs/"):
            job = app.jobs.jobs.get(p.split("/")[3])
            if not job:
                return self._error("작업이 없습니다.", 404)
            return self._json(job.to_dict(int(q.get("since", ["0"])[0])))
        if p.startswith("/api/preview/"):
            tid = p.rsplit("/", 1)[-1].removesuffix(".jpg")
            return self._preview(tid, q.get("k", ["base"])[0])
        if p == "/api/watch":
            since = int(q.get("since", ["0"])[0])
            return self._json({"running": app.watcher.running, "log": app.watch_log[since:],
                               "total": len(app.watch_log), "inbox": str(app.settings.dirs()["inbox"])})
        if p == "/files":
            target = Path(q.get("path", [""])[0])
            if not _inside(target, app.settings.workspace_path):
                return self._error("작업폴더 밖의 파일은 열 수 없습니다.", 403)
            return self._file(target)
        return self._error("없는 주소입니다.", 404)

    def _preview(self, tid: str, key: str) -> None:
        from .. import preview

        try:
            tpl = templates.get(tid)
        except KeyError:
            return self._error("템플릿이 없습니다.", 404)
        cache = self.app.settings.dirs()["cache"] / "previews"
        frame = None
        if key == "me":
            import numpy as np
            from PIL import Image

            src = cache / "me.jpg"
            if src.exists():
                frame = np.asarray(Image.open(src).convert("RGB"))
            else:
                key = "base"
        with self.app.preview_lock:
            path = preview.cached(tpl, cache, frame, key)
        self._file(path, "image/jpeg")

    # -- POST ---------------------------------------------------------------
    def do_POST(self):
        if not self._host_ok():
            return self._error("forbidden", 403)
        url = urlparse(self.path)
        p = url.path
        app = self.app
        try:
            if p == "/api/upload":
                return self._upload(parse_qs(url.query).get("name", ["video.mp4"])[0])
            data = self._body()
            if p == "/api/jobs":
                return self._new_job(data)
            if p.startswith("/api/jobs/") and p.endswith("/cancel"):
                job = app.jobs.jobs.get(p.split("/")[3])
                if job:
                    job.cancel.set()
                return self._json({"ok": True})
            if p == "/api/script":
                text, source = director.generate_script(data.get("topic", ""), app.settings,
                                                        int(data.get("seconds") or 36))
                return self._json({"script": text, "source": source})
            if p == "/api/open":
                target = Path(data.get("path", ""))
                inbox = app.settings.dirs()["inbox"]
                if not (_inside(target, app.settings.workspace_path) or _inside(target, inbox)):
                    return self._error("작업폴더 밖은 열 수 없습니다.", 403)
                media.open_path(target)
                return self._json({"ok": True})
            if p == "/api/watch":
                app.watcher.settings = app.settings
                app.watcher.start() if data.get("on") else app.watcher.stop()
                time.sleep(0.05)
                return self._json({"running": app.watcher.running})
            if p == "/api/settings":
                for k, v in data.items():
                    if k in EDITABLE:
                        setattr(app.settings, k, type(getattr(app.settings, k))(v))
                app.settings.save()
                return self._json({"ok": True, "ai": app.settings.ai_available})
            if p == "/api/apikey":
                _set_env_key("ANTHROPIC_API_KEY", (data.get("key") or "").strip())
                return self._json({"ok": True, "ai": app.settings.ai_available})
            if p == "/api/preview-frame":
                return self._preview_frame(Path(data.get("video", "")))
            if p == "/api/quit":  # 창 없이 켜진 프로그램을 끄는 단추
                self._json({"ok": True})
                threading.Thread(target=self.server.shutdown, daemon=True).start()
                return
        except (ValueError, KeyError, media.MediaError) as e:
            return self._error(str(e))
        return self._error("없는 주소입니다.", 404)

    def _upload(self, name: str) -> None:
        n = int(self.headers.get("Content-Length") or 0)
        safe = re.sub(r"[\\/:*?\"<>|]+", "_", Path(unquote(name)).name) or "video.mp4"
        dest = self.app.settings.dirs()["uploads"] / safe
        if dest.exists():
            dest = dest.with_name(f"{dest.stem}_{int(time.time())}{dest.suffix}")
        left = n
        with dest.open("wb") as f:
            while left > 0:
                chunk = self.rfile.read(min(1 << 20, left))
                if not chunk:
                    break
                f.write(chunk)
                left -= len(chunk)
        if left:
            dest.unlink(missing_ok=True)
            return self._error("올리다가 끊겼습니다. 다시 시도하세요.")
        self._json({"path": str(dest), "name": dest.name})

    def _new_job(self, data: dict) -> None:
        video = Path(data.get("video", "")).expanduser()
        if not video.exists():
            return self._error("찍은 영상을 먼저 골라 주세요.")
        tpls = [t for t in (data.get("templates") or ["auto"]) if t]
        demo = Path(data["demo"]) if data.get("demo") else None
        inp = JobInput(video=video, script=data.get("script", ""), demo=demo if demo and demo.exists() else None,
                       templates=tpls, variants=int(data.get("variants") or 1),
                       use_ai=bool(data.get("use_ai", True)), headline=data.get("headline", ""),
                       cut_silence=bool(data.get("cut_silence", True)),
                       remove_fillers=bool(data.get("remove_fillers", True)),
                       speed_up=bool(data.get("speed_up", True)))
        job = self.app.jobs.submit(inp, video.name)
        self._json({"id": job.id})

    def _preview_frame(self, video: Path) -> None:
        """고른 영상의 내 얼굴 장면으로 템플릿 미리보기를 다시 그립니다."""
        if not video.exists():
            return self._error("영상이 없습니다.")
        cache = self.app.settings.dirs()["cache"] / "previews"
        cache.mkdir(parents=True, exist_ok=True)
        info = media.probe(video)
        media.grab_frame(video, min(1.5, info.duration / 3), cache / "me.jpg", 1080)
        for old in cache.glob("*_me.jpg"):
            old.unlink(missing_ok=True)
        self._json({"ok": True})


def serve(port: int = 8765, open_browser: bool = True) -> None:
    url = f"http://127.0.0.1:{port}/"
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:  # 이미 켜져 있으면(두 번 누름) 창만 다시 엶
        print(f"이미 실행 중입니다: {url}")
        if open_browser:
            webbrowser.open(url)
        return
    Handler.app = App()
    print(f"{APP_NAME} 화면: {url}  (끄려면 이 창을 닫거나 Ctrl+C)")
    if open_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()
