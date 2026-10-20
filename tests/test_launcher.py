"""윈도우 바로가기 만들기 — 경로에 따옴표·한글이 있어도 명령이 깨지지 않는지."""
from pathlib import Path

from reels_autopilot import launcher


def test_powershell_quoting_doubles_apostrophes():
    cmd = launcher.shortcut_command(Path("D:/대표's 폴더/pythonw.exe"), Path("D:/대표's 폴더"))
    assert "'D:/대표''s 폴더/pythonw.exe'" in cmd
    assert "'릴스 만들기.lnk'" in cmd and "'-m reels_autopilot ui'" in cmd


def test_vbs_quoting_doubles_quotes():
    vbs = launcher.vbs_launcher(Path('D:/릴스 "오토"/pythonw.exe'), Path("D:/릴스"))
    assert 'sh.Run """D:/릴스 ""오토""/pythonw.exe"" -m reels_autopilot ui", 0, False' in vbs
    assert vbs.endswith("\r\n")


def test_noop_off_windows(monkeypatch):
    monkeypatch.setattr(launcher.sys, "platform", "linux")
    assert launcher.make(log=lambda m: None) == []
    assert launcher.unblock() == 0
