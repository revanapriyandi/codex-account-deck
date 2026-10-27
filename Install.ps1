param(
 [string]$InstallRoot=(Join-Path $env:LOCALAPPDATA 'CodexAccountSwitcher'),
 [string]$CodexHome=$(if($env:CODEX_HOME){$env:CODEX_HOME}else{Join-Path $env:USERPROFILE '.codex'}),
 [string]$BrowserProfile,
 [switch]$NoShortcuts,
 [switch]$Sandbox
)
$ErrorActionPreference='Stop'
function Get-Sha256([string]$File){$stream=[IO.File]::OpenRead($File);$hash=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$hash.Dispose()}}
$root=[IO.Path]::GetFullPath($InstallRoot)
$source=[IO.Path]::GetFullPath($PSScriptRoot)
if($root -eq $source -or $root.StartsWith($source+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Choose an installation directory outside the source checkout.'}
$marker=Join-Path $root 'installation.json'
if((Test-Path -LiteralPath $root) -and @(Get-ChildItem -LiteralPath $root -Force).Count -and -not (Test-Path -LiteralPath $marker)){throw 'Installation directory is not empty and is not owned by this add-on.'}
if(Test-Path -LiteralPath $marker){$old=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json;if($old.product -ne 'codex-account-switcher'){throw 'Invalid installation marker.'}}
$data=Join-Path $root 'data'
$lock=Join-Path $data 'helper.lock'
if(Test-Path -LiteralPath $lock){$helperId=0;if([int]::TryParse((Get-Content -LiteralPath $lock -Raw).Trim(),[ref]$helperId) -and (Get-Process -Id $helperId -ErrorAction SilentlyContinue)){throw 'Close the add-on Codex window before updating this installation.'}}
$node=(Get-Command node.exe -ErrorAction Stop).Source
if(([version]((& $node --version).TrimStart('v'))).Major -lt 22){throw 'Node.js 22 or newer is required.'}
$pkg=$null
if(-not $Sandbox){
 $pkg=Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
 if(-not $pkg){throw 'Install the official Codex desktop app first.'}
 if(-not $BrowserProfile){
  $parents=@(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object {$_.ExecutablePath -eq (Join-Path $pkg.InstallLocation 'app\ChatGPT.exe') -and $_.CommandLine -notmatch '--type=|--user-data-dir='})
  foreach($parent in $parents){$crash=Get-CimInstance Win32_Process -Filter ("ParentProcessId = "+$parent.ProcessId) | Where-Object {$_.CommandLine -match '--type=crashpad-handler'} | Select-Object -First 1;if($crash.CommandLine -match '--user-data-dir=(.+?)(?=\s+/prefetch:|\s+--monitor|$)'){$BrowserProfile=$Matches[1].Trim('"');break}}
  if(-not $BrowserProfile){$BrowserProfile=Join-Path $env:APPDATA 'Codex\web\Codex'}
 }
 $CodexHome=[IO.Path]::GetFullPath($CodexHome);$BrowserProfile=[IO.Path]::GetFullPath($BrowserProfile)
 if(-not (Test-Path -LiteralPath $CodexHome) -or -not (Test-Path -LiteralPath (Join-Path $BrowserProfile 'Local State'))){throw 'Original Codex profiles were not found. Supply -CodexHome and -BrowserProfile explicitly.'}
}
New-Item -ItemType Directory -Path $root,$data -Force | Out-Null
$app=Join-Path $root 'app'
New-Item -ItemType Directory -Path $app,(Join-Path $app 'src'),(Join-Path $app 'scripts') -Force | Out-Null
$files=@('Launch.ps1','Uninstall.ps1','Start-Hidden.vbs','README.md','LICENSE','package.json')
$files+=@(Get-ChildItem -LiteralPath (Join-Path $source 'src') -File | Where-Object Extension -in '.cjs','.js','.css','.ps1','.cs' | ForEach-Object {'src\'+$_.Name})
$files+=@('scripts\Build-CredentialHost.ps1')
foreach($relative in $files){$from=Join-Path $source $relative;$to=Join-Path $app $relative;if(-not (Test-Path -LiteralPath $to) -or (Get-Sha256 $from) -ne (Get-Sha256 $to)){Copy-Item -LiteralPath $from -Destination $to -Force}}
& (Join-Path $app 'scripts\Build-CredentialHost.ps1') -OutputDirectory (Join-Path $app 'src')
$files+='src\CredentialHost.exe'
$settings=if($Sandbox){@{mode='isolated-test';dataRoot=$data;silentPanel=$true}}else{@{mode='desktop';dataRoot=$data;codexHome=$CodexHome;browserProfile=$BrowserProfile;silentPanel=$true}}
$config=Join-Path $app 'config.json'
$json=$settings | ConvertTo-Json
if(-not (Test-Path -LiteralPath $config) -or (Get-Content -LiteralPath $config -Raw).Trim() -ne $json.Trim()){$json | Set-Content -LiteralPath $config -Encoding utf8}
$files+='config.json'
$shortcuts=@()
if(-not $NoShortcuts){
 $shell=New-Object -ComObject WScript.Shell
 foreach($folder in @([Environment]::GetFolderPath('Desktop'),(Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs'))){
  $link=Join-Path $folder 'Codex Account Deck.lnk'
  if(Test-Path -LiteralPath $link){$existing=$shell.CreateShortcut($link);if($existing.Arguments -notlike ('*'+(Join-Path $app 'Launch.ps1')+'*')){throw ('Shortcut name is already in use: '+$link)}}
  $shortcut=$shell.CreateShortcut($link);$shortcut.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$shortcut.Arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $app 'Launch.ps1')+'" -Interactive';$shortcut.WorkingDirectory=$app
  if($pkg){$shortcut.IconLocation=(Join-Path $pkg.InstallLocation 'app\ChatGPT.exe')+',0'}
  $shortcut.Description='Open official Codex with the local account switcher';$shortcut.Save();$shortcuts+=$link
 }
}
if($old -and -not $NoShortcuts){foreach($oldLink in $old.shortcuts){if($oldLink -notin $shortcuts -and (Test-Path -LiteralPath $oldLink)){$prior=$shell.CreateShortcut($oldLink);if($prior.Arguments -like ('*'+(Join-Path $app 'Launch.ps1')+'*')){Remove-Item -LiteralPath $oldLink -Force}}}}
$entries=@($files | ForEach-Object {@{path=('app\'+$_);sha256=(Get-Sha256 (Join-Path $app $_))}})
@{product='codex-account-switcher';displayName='Codex Account Deck';schema=1;version='0.2.0-beta.1';files=$entries;shortcuts=$shortcuts} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $marker -Encoding utf8
Write-Output ('Installed: '+$root)
Write-Output 'Close Codex normally, then use the Codex Account Deck shortcut. Existing chats and projects use the original profiles.'
