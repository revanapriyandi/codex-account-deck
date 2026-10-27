param([string]$InstallRoot=(Split-Path $PSScriptRoot -Parent),[switch]$RemoveSavedAccounts)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($InstallRoot);$marker=Join-Path $root 'installation.json'
if(-not (Test-Path -LiteralPath $marker)){throw 'This directory is not a recorded installation.'}
$record=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
if($record.product -ne 'codex-account-switcher' -or $record.schema -ne 1){throw 'Invalid installation marker.'}
$lock=Join-Path $root 'data\helper.lock'
if(Test-Path -LiteralPath $lock){$helperId=0;if([int]::TryParse((Get-Content -LiteralPath $lock -Raw).Trim(),[ref]$helperId) -and (Get-Process -Id $helperId -ErrorAction SilentlyContinue)){throw 'Close the add-on Codex window normally before uninstalling. No process was stopped.'}}
$app=Join-Path $root 'app';$paths=@()
foreach($entry in $record.files){$full=[IO.Path]::GetFullPath((Join-Path $root $entry.path));if(-not $full.StartsWith($app+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe manifest path; nothing was removed.'};$paths+=$full}
$shell=New-Object -ComObject WScript.Shell
foreach($link in $record.shortcuts){if(Test-Path -LiteralPath $link){$shortcut=$shell.CreateShortcut($link);if($shortcut.Arguments -like ('*'+(Join-Path $app 'Launch.ps1')+'*')){Remove-Item -LiteralPath $link -Force}}}
foreach($file in $paths){if(Test-Path -LiteralPath $file -PathType Leaf){Remove-Item -LiteralPath $file -Force}}
if($RemoveSavedAccounts){$vault=Join-Path $root 'data\saved-accounts';if(Test-Path -LiteralPath $vault){Get-ChildItem -LiteralPath $vault -File | Where-Object Name -match '^[a-f0-9]{64}\.json$' | Remove-Item -Force}}
Remove-Item -LiteralPath $marker -Force
Get-ChildItem -LiteralPath $app -Directory -Recurse | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {if(-not @(Get-ChildItem -LiteralPath $_.FullName -Force).Count){Remove-Item -LiteralPath $_.FullName}}
if((Test-Path -LiteralPath $app) -and -not @(Get-ChildItem -LiteralPath $app -Force).Count){Remove-Item -LiteralPath $app}
Write-Output 'Add-on removed. Official Codex and its chat/project profiles were not modified. Local add-on data is retained unless explicitly removed.'
