@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install.ps1"
if errorlevel 1 (
  echo Installation failed. Read the message above.
  pause
  exit /b 1
)
echo Use the Codex Account Deck shortcut after quitting Codex normally.
pause
