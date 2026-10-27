param([string]$Config=(Join-Path $PSScriptRoot 'config.json'),[switch]$WaitForExit,[switch]$Interactive)
$ErrorActionPreference='Stop'
trap {if($Interactive){$popup=New-Object -ComObject WScript.Shell;$popup.Popup($_.Exception.Message,0,'Codex Account Deck',48) | Out-Null};Write-Error $_ -ErrorAction Continue;exit 1}
$configPath=[IO.Path]::GetFullPath($Config)
if(-not (Test-Path -LiteralPath $configPath)){throw 'Run Install.ps1 first, or supply a test configuration.'}
$settings=Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$node=(Get-Command node.exe -ErrorAction Stop).Source
$pkg=Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if(-not $pkg){throw 'The official Codex Windows package is not installed.'}
if($settings.mode -eq 'desktop') {
 $running=@(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object {$_.ExecutablePath -eq (Join-Path $pkg.InstallLocation 'app\ChatGPT.exe') -and $_.CommandLine -notmatch '--type='})
 if($running.Count -and -not $WaitForExit){throw 'Close Codex normally before using this shortcut. Your running window was not stopped.'}
 foreach($item in $running){Wait-Process -Id $item.ProcessId -ErrorAction SilentlyContinue}
}
$launcher=Join-Path $PSScriptRoot 'Start-Hidden.vbs'
$runner=Join-Path $PSScriptRoot 'src\main.cjs'
$argsLine='"'+$launcher+'" "'+$node+'" "'+$runner+'" "'+$configPath+'"'
Invoke-CommandInDesktopPackage -PackageFamilyName $pkg.PackageFamilyName -AppId 'App' -Command (Join-Path $env:SystemRoot 'System32\wscript.exe') -Args $argsLine -PreventBreakaway
Write-Output 'Codex launch requested. Add-on status is in the configured data directory.'
