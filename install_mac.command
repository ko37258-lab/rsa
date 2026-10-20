#!/bin/bash
# 맥 설치: 이 파일을 두 번 누르세요.
cd "$(dirname "$0")" || exit 1
echo "릴스 오토파일럿 설치 — 10~20분쯤 걸려요."
if ! command -v python3 >/dev/null 2>&1; then
  echo "파이썬 3.12 를 먼저 설치하세요: https://www.python.org/downloads/"
  read -r -p "엔터를 누르면 닫힙니다." _
  exit 1
fi
if ! command -v ffmpeg >/dev/null 2>&1 && command -v brew >/dev/null 2>&1; then
  brew install ffmpeg || echo "ffmpeg 설치 실패 — 내장본으로 동작합니다."
fi
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt || { echo "부품 설치 실패 — 인터넷 연결을 확인하세요."; exit 1; }
.venv/bin/python -m reels_autopilot fonts
.venv/bin/python -m reels_autopilot doctor
echo "설치 완료! '릴스 만들기.command' 를 두 번 누르세요."
read -r -p "엔터를 누르면 닫힙니다." _
