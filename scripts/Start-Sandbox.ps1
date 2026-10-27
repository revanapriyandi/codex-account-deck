param([string]$DataRoot=(Join-Path $env:LOCALAPPDATA 'CodexAccountSwitcher-Sandbox'))
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($DataRoot)
New-Item -ItemType Directory -Path $root -Force | Out-Null
$config=Join-Path $root 'launch-config.json'
@{mode='isolated-test';dataRoot=$root;silentPanel=$true} | ConvertTo-Json | Set-Content -LiteralPath $config -Encoding utf8
& (Join-Path $PSScriptRoot '..\Launch.ps1') -Config $config
