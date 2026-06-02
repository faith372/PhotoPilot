@echo off
cd /d %~dp0
if exist PhotoPilot.exe (
  start "" PhotoPilot.exe
) else if exist launcher.cjs (
  node launcher.cjs
) else (
  node server.mjs
)
