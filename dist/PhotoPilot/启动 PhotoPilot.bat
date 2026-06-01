@echo off
cd /d %~dp0
if exist PhotoPilot.exe (
  start "" PhotoPilot.exe
) else (
  node server.mjs
)
