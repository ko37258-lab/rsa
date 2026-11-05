@echo off
rem k-shorts.mrkzip.com : check Cloudflare tunnel, reconnect, register auto-start at boot
rem Double-click this file. Click [Yes] on the administrator prompt.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0k-shorts-tunnel.ps1"
