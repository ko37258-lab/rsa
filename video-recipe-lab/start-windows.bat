@echo off
chcp 65001 >nul
setlocal
title Video Recipe Lab
set "BRANCH=claude/inspiring-pasteur-xhx7wd"
set "REPO=https://github.com/ko37258-lab/rsa.git"
set "DEST=%USERPROFILE%\rsa"
rem add install folders so programs installed by winget are found right away
set "PATH=%PATH%;%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Microsoft\WinGet\Links"

echo.
echo  ==========================================
echo    Video Recipe Lab - one-click start
echo  ==========================================
echo.

echo [1/5] Checking Git ...
where git >nul 2>nul || call :install Git.Git
where git >nul 2>nul || goto fail

echo [2/5] Checking Node.js ...
where node >nul 2>nul || call :install OpenJS.NodeJS.LTS
where node >nul 2>nul || goto fail

echo [3/5] Checking ffmpeg ...
where ffmpeg >nul 2>nul || call :install Gyan.FFmpeg
where ffmpeg >nul 2>nul || goto fail

echo [4/5] Downloading the project to %DEST% ...
if exist "%DEST%\.git" (
  cd /d "%DEST%"
  git fetch origin %BRANCH%
  git checkout %BRANCH%
  git pull --ff-only origin %BRANCH%
) else (
  git clone -b %BRANCH% %REPO% "%DEST%"
)
if not exist "%DEST%\video-recipe-lab\package.json" goto fail
cd /d "%DEST%\video-recipe-lab"
if not exist ".env" copy ".env.example" ".env" >nul

echo [5/5] Installing packages (first time: 1-2 minutes) ...
call npm.cmd install --no-fund --no-audit
if errorlevel 1 goto fail

echo.
echo  ------------------------------------------
echo   Browser will open: http://localhost:5173
echo   Keep THIS window open while using the app.
echo   Close this window to stop.
echo  ------------------------------------------
echo.
start "" /min powershell -NoProfile -Command "Start-Sleep 8; Start-Process 'http://localhost:5173'"
call npm.cmd run dev
goto end

:install
echo     installing %1 ... (click YES if Windows asks)
where winget >nul 2>nul || (
  echo [!] winget not found. Install "App Installer" from Microsoft Store and run again.
  exit /b 1
)
winget install -e --id %1 --accept-package-agreements --accept-source-agreements
exit /b 0

:fail
echo.
echo [!] Something went wrong. Take a screenshot of this window and send it to Claude.
pause
exit /b 1

:end
pause
