Unicode true
RequestExecutionLevel user
ManifestDPIAware true
SetCompressor /SOLID lzma
Name "Codex Account Deck"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\CodexAccountSwitcher"
BrandingText "Codex Account Deck"
VIProductVersion "0.2.0.0"
VIAddVersionKey "ProductName" "Codex Account Deck"
VIAddVersionKey "FileDescription" "Codex Account Deck Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "MIT License - Codex Account Deck contributors"

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccountDeck"
!define MUI_WELCOMEPAGE_TEXT "Install the removable account switcher for the official Windows Codex app.$\r$\n$\r$\nSaved accounts are retained when updating. Codex and its chat/project profiles remain in their existing locations."
!define MUI_FINISHPAGE_TEXT "Codex Account Deck is installed.$\r$\n$\r$\nClose Codex normally, then open the Codex Account Deck shortcut."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Var PowerShell
Var TestMode
Var Arguments

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "This installer requires 64-bit Windows."
    SetErrorLevel 1
    Quit
  ${EndIf}
  SetShellVarContext current
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/TESTMODE" $1
  ${IfNot} ${Errors}
    StrCpy $TestMode "true"
  ${EndIf}
FunctionEnd

Section "Install"
  InitPluginsDir
  SetOutPath "$PLUGINSDIR\payload"
  File /r "${PAYLOAD}/*"
  StrCpy $PowerShell "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$PowerShell" +2 0
    StrCpy $PowerShell "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  StrCpy $Arguments ''
  ${If} $TestMode == "true"
    StrCpy $Arguments '-Sandbox -NoShortcuts'
  ${EndIf}
  DetailPrint "Installing add-on and bundled Node.js runtime..."
  nsExec::ExecToStack '"$PowerShell" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$PLUGINSDIR\payload\Install.ps1" -InstallRoot "$INSTDIR" $Arguments'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "$1"
    IfSilent +2 0
      MessageBox MB_OK|MB_ICONSTOP "Installation failed. Existing Codex was not stopped.$\r$\n$1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  ${If} $TestMode != "true"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "Codex Account Deck"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "Codex Account Deck contributors"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
    WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
    WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
    WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://github.com/revanapriyandi/codex-account-deck"
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
    WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  ${EndIf}
  SetErrorLevel 0
SectionEnd

Section "Uninstall"
  StrCpy $PowerShell "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$PowerShell" +2 0
    StrCpy $PowerShell "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  nsExec::ExecToStack '"$PowerShell" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\app\Uninstall.ps1" -InstallRoot "$INSTDIR"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "$1"
    IfSilent +2 0
      MessageBox MB_OK|MB_ICONSTOP "Uninstall could not complete.$\r$\n$1"
    SetErrorLevel 1
    Abort
  ${EndIf}
  ReadRegStr $0 HKCU "${UNINSTALL_KEY}" "InstallLocation"
  ${If} $0 == $INSTDIR
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
  ${EndIf}
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  SetErrorLevel 0
SectionEnd
