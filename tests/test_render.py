"""끝까지 굽기: 합성 영상 + 받아쓰기 JSON 으로 받아쓰기 모델 없이 전 단계를 돌립니다."""
import json
import shutil
import subprocess
import threading
import urllib.error
import urllib.request

import pytest

from reels_autopilot import media, templates
from reels_autopilot.pipeline import JobInput, make_reel
from reels_autopilot.settings import Settings
from tests.test_rules import SCRIPT, words_from

pytestmark = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg 필요")


@pytest.fixture()
def workspace(tmp_path, monkeypatch):
    monkeypatch.setenv("REELS_WORKSPACE", str(tmp_path / "ws"))
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    return tmp_path


def _make_video(tmp_path, dur: float, size: str = "1080x1920"):
    out = tmp_path / "in.mp4"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc2=size={size}:rate=30:d={dur}",
                    "-f", "lavfi", "-i", f"sine=frequency=220:duration={dur}", "-c:v", "libx264", "-preset",
                    "ultrafast", "-c:a", "aac", "-shortest", str(out)], check=True)
    return out


@pytest.mark.parametrize("size,tpl", [("1080x1920", "T001"), ("1280x720", "T021")])
def test_full_pipeline(workspace, size, tpl):
    words = words_from(SCRIPT)
    video = _make_video(workspace, words[-1].end + 1.0, size)
    tr = workspace / "words.json"
    tr.write_text(json.dumps([w.to_dict() for w in words], ensure_ascii=False), encoding="utf-8")
    stages = []
    res = make_reel(JobInput(video=video, script=SCRIPT, templates=[tpl], transcript=tr), Settings(),
                    log=lambda m: None, progress=lambda f, s: stages.append((f, s)))
    out = res.videos[0]
    info = media.probe(out)
    assert (info.width, info.height) == (1080, 1920) and round(info.fps) == 30
    assert abs(media.integrated_loudness(out) - (-14.0)) < 1.0
    rep = res.reports[0]
    assert {r["name"] for r in rep["rows"] if r["ok"]} >= {"소리 크기", "화면 크기·프레임", "0.3초 넘는 말 없는 구간"}
    assert res.thumbnail and res.thumbnail.exists() and res.post.exists()
    assert (res.out_dir / "자막.srt").read_text(encoding="utf-8").startswith("1\n")
    assert stages[-1][0] == 1.0 and all(a[0] <= b[0] for a, b in zip(stages, stages[1:]))


def test_every_base_template_draws_every_scene_kind(workspace):
    import numpy as np

    from reels_autopilot import draw
    from reels_autopilot.compose import Compositor
    from reels_autopilot.scenes import build_scenes
    from reels_autopilot.lexicon import load_terms
    from reels_autopilot.settings import Targets

    ws = words_from(SCRIPT)
    sc = build_scenes(ws, Targets(), load_terms("realestate"), total_duration=ws[-1].end)
    src = np.asarray(draw.placeholder_frame(720, 1280))
    for tpl in templates.BASE_DEFAULT.values():
        comp = Compositor(tpl, sc, ws[-1].end, headline_title="테스트 제목", handle="@test")
        for s in sc:
            frame = comp.frame(src, s.start + 0.3)
            assert frame.shape == (1920, 1080, 3)


def test_server_guards(workspace):
    from http.server import ThreadingHTTPServer

    from reels_autopilot.webui import server

    server.Handler.app = server.App()
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    try:
        state = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/api/state"))
        assert len(state["templates"]) == 100
        for url, headers in ((f"http://127.0.0.1:{port}/files?path=/etc/hosts", {}),
                             (f"http://127.0.0.1:{port}/api/state", {"Host": "evil.example"})):
            with pytest.raises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(urllib.request.Request(url, headers=headers))
            assert e.value.code == 403
    finally:
        httpd.shutdown()
