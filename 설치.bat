@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
echo ============================================================
echo   릴스 오토파일럿 설치  -  10~20분쯤 걸려요. 창을 닫지 마세요.
echo ============================================================
echo.

set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY goto :install_python

echo [1/4] 파이썬 확인
%PY% --version
if errorlevel 1 goto :install_python

echo [2/4] 전용 공간 만들기 (.venv)
if not exist ".venv\Scripts\python.exe" %PY% -m venv .venv
set "VPY=.venv\Scripts\python.exe"
"%VPY%" -m pip install --upgrade pip >nul

echo [3/4] 부품 설치 - 받아쓰기, 영상, 그림, AI
"%VPY%" -m pip install -r requirements.txt
if errorlevel 1 goto :pip_failed

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo     ffmpeg 설치를 시도합니다. 실패해도 내장본으로 동작해요.
  winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements >nul 2>nul
)

echo [4/4] 무료 한글 글꼴 30종 받기
"%VPY%" -m reels_autopilot fonts
"%VPY%" -m reels_autopilot doctor
echo.
echo ============================================================
echo   설치 완료!  '릴스 만들기' 를 두 번 누르세요.
echo   처음 한 번은 받아쓰기 모델 1.6GB 를 받느라 오래 걸려요.
echo ============================================================
pause
exit /b 0

:install_python
echo 파이썬이 없어 설치합니다...
winget install -e --id Python.Python.3.12 --scope user --accept-package-agreements --accept-source-agreements
echo.
echo 파이썬 설치가 끝났습니다. 컴퓨터를 한 번 다시 켠 뒤 '설치' 를 한 번 더 눌러 주세요.
echo winget 이 없다면 https://www.python.org/downloads/ 에서 3.12 를 설치하세요.
pause
exit /b 0

:pip_failed
echo.
echo 부품 설치에 실패했습니다. 인터넷 연결을 확인하고 '설치' 를 다시 눌러 주세요.
pause
exit /b 1
