@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall.ps1" -InstallRoot "%LOCALAPPDATA%\CodexAccountSwitcher"
if errorlevel 1 (
  echo Uninstall failed. Read the message above.
  pause
  exit /b 1
)
pause
