#!/bin/bash
# 맥 실행: 두 번 누르면 브라우저에 릴스 오토파일럿 화면이 열립니다.
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then
  echo "먼저 install_mac.command 를 두 번 눌러 설치하세요."
  exit 1
fi
exec .venv/bin/python -m reels_autopilot ui
