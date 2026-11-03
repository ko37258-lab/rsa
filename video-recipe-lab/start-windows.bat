@echo off
chcp 65001 >nul
setlocal
title MR.K-VR owner
rem MR.K-VR (K-video maker) one-click installer / launcher - owner
set "BRANCH=claude/inspiring-pasteur-xhx7wd"
set "REPO=https://github.com/ko37258-lab/rsa.git"
set "DEST=%USERPROFILE%\rsa"
set "APP=%DEST%\video-recipe-lab"
set "LAUNCHER=%DEST%\start-mrk-vr.bat"
rem add install folders so programs installed by winget are found right away
set "PATH=%PATH%;%ProgramFiles%\Git\cmd;%ProgramFiles%\nodejs;%LOCALAPPDATA%\Microsoft\WinGet\Links"

echo.
echo  ==========================================
echo    MR.K-VR  /  K-video maker  (owner)
echo  ==========================================
echo.

echo [1/6] Checking Git ...
where git >nul 2>nul || call :install Git.Git
where git >nul 2>nul || goto fail

echo [2/6] Checking Node.js ...
where node >nul 2>nul || call :install OpenJS.NodeJS.LTS
where node >nul 2>nul || goto fail

echo [3/6] Checking ffmpeg ...
where ffmpeg >nul 2>nul || call :install Gyan.FFmpeg
where ffmpeg >nul 2>nul || goto fail

echo [4/6] Getting the latest version into %DEST% ...
if exist "%DEST%\.git" (
  cd /d "%DEST%"
  git checkout -- video-recipe-lab/package-lock.json >nul 2>nul
  git pull --ff-only || echo     [!] update skipped - starting the version you already have
) else (
  git clone -b %BRANCH% %REPO% "%DEST%" || git clone %REPO% "%DEST%"
)
if not exist "%APP%\package.json" goto fail
cd /d "%APP%"
if not exist ".env" copy ".env.example" ".env" >nul
rem owner version: all tabs (K-video maker + teardown)
echo [5/6] Installing packages (first time: 1-2 minutes) ...
call npm.cmd install --no-fund --no-audit
if errorlevel 1 goto fail

echo [6/6] Desktop shortcut ...
if /i not "%~f0"=="%LAUNCHER%" copy /y "%~f0" "%LAUNCHER%" >nul
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut($d+'\MR.K-VR.lnk'); $s.TargetPath='%LAUNCHER%'; $s.WorkingDirectory='%DEST%'; $s.IconLocation='%SystemRoot%\System32\imageres.dll,18'; $s.Save()" >nul 2>nul

echo.
echo  ------------------------------------------
echo   Browser opens when ready: http://localhost:5173
echo   Keep THIS window open while using the app.
echo   Close this window to stop.
echo   Next time: double-click "MR.K-VR" on your desktop.
echo  ------------------------------------------
echo.
start "" /min powershell -NoProfile -Command "for($i=0;$i -lt 180;$i++){ try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://localhost:5173' | Out-Null; Start-Process 'http://localhost:5173'; break } catch { Start-Sleep 1 } }"
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
echo [!] Something went wrong. Take a screenshot of this window and send it.
pause
exit /b 1

:end
pause
