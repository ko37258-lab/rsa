"""윈도우 실행 단추 — 내 컴퓨터에서 직접 만든 바로가기.

윈도우 11 '스마트 앱 컨트롤'은 인터넷에서 받은 .bat·.vbs 를 '위험한 파일 확장자'로 막습니다.
내 컴퓨터에서 새로 만든 바로가기는 인터넷에서 온 파일이 아니라서 막히지 않으므로, 설치 끝에 한 번 만들어 둡니다.
1) 바탕화면·시작 메뉴에 '릴스 만들기' 바로가기(.lnk)를 만들고
2) PowerShell 이 제한 모드라 실패하면 바탕화면에 실행 파일(.vbs)을 직접 써 둡니다.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path
from typing import Callable

from .settings import ROOT

LINK_NAME = "릴스 만들기"
_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def ps_quote(value) -> str:
    """PowerShell 작은따옴표 문자열 (안의 ' 는 '' 로)."""
    return "'" + str(value).replace("'", "''") + "'"


def shortcut_command(target: Path, workdir: Path, name: str = LINK_NAME) -> str:
    """바탕화면·시작 메뉴에 바로가기를 만드는 PowerShell 명령."""
    return (
        "$ws = New-Object -ComObject WScript.Shell; "
        "foreach ($d in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) { "
        f"$s = $ws.CreateShortcut((Join-Path $d {ps_quote(name + '.lnk')})); "
        f"$s.TargetPath = {ps_quote(target)}; $s.Arguments = '-m reels_autopilot ui'; "
        f"$s.WorkingDirectory = {ps_quote(workdir)}; $s.Description = {ps_quote('릴스 오토파일럿')}; $s.Save() }}"
    )


def vbs_launcher(target: Path, workdir: Path) -> str:
    """검은 창 없이 화면을 여는 VBScript (UTF-16 으로 저장해야 한글 경로가 깨지지 않음)."""
    q = lambda s: str(s).replace('"', '""')  # noqa: E731
    return (
        'Set sh = CreateObject("WScript.Shell")\r\n'
        f'sh.CurrentDirectory = "{q(workdir)}"\r\n'
        f'sh.Run """{q(target)}"" -m reels_autopilot ui", 0, False\r\n'
    )


def pythonw(root: Path = ROOT) -> Path:
    for cand in (root / ".venv" / "Scripts" / "pythonw.exe", Path(sys.executable).with_name("pythonw.exe")):
        if cand.exists():
            return cand
    return Path(sys.executable)


def unblock(root: Path = ROOT) -> int:
    """'인터넷에서 받은 파일' 표시(Zone.Identifier)를 지웁니다 — 파일 속성의 '차단 해제'와 같음."""
    if sys.platform != "win32":
        return 0
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".venv", ".git", "작업폴더")]
        for f in filenames:
            try:
                os.remove(os.path.join(dirpath, f) + ":Zone.Identifier")
                n += 1
            except OSError:
                pass
    return n


def _desktop() -> Path:
    try:
        import ctypes

        buf = ctypes.create_unicode_buffer(260)
        if ctypes.windll.shell32.SHGetFolderPathW(None, 0x10, None, 0, buf) == 0:  # CSIDL_DESKTOPDIRECTORY
            return Path(buf.value)
    except Exception:
        pass
    return Path.home() / "Desktop"


def make(log: Callable[[str], None] = print) -> list[Path]:
    if sys.platform != "win32":
        log("바로가기는 윈도우에서만 만듭니다. 맥은 '릴스 만들기.command' 를 두 번 누르세요.")
        return []
    n = unblock()
    if n:
        log(f"  인터넷에서 받은 표시를 지웠습니다: 파일 {n}개")
    target = pythonw()
    proc = subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", shortcut_command(target, ROOT)],
                          capture_output=True, creationflags=_NO_WINDOW)
    desktop = _desktop()
    link = desktop / f"{LINK_NAME}.lnk"
    if proc.returncode == 0 and link.exists():
        log(f"  ✓ 바탕화면과 시작 메뉴에 '{LINK_NAME}' 바로가기를 만들었습니다.")
        return [link]
    # PowerShell 이 제한 모드면 실행 파일을 직접 씀 (내 컴퓨터에서 만든 파일이라 막히지 않음)
    vbs = desktop / f"{LINK_NAME}.vbs"
    vbs.write_text(vbs_launcher(target, ROOT), encoding="utf-16")
    log(f"  ✓ 바탕화면에 '{LINK_NAME}' 실행 파일을 만들었습니다.")
    return [vbs]
