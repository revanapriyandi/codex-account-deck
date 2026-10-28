param([Parameter(Mandatory=$true)][string]$Installer,[switch]$LaunchSmoke)
$ErrorActionPreference='Stop'
$installerPath=[IO.Path]::GetFullPath($Installer)
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('AccountDeck-Installer-Test-'+[Guid]::NewGuid().ToString('N'))
$installRoot=Join-Path $testRoot 'installed with spaces'
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$report=@{passed=$false;installed=$false;reinstalled=$false;savedDataPreserved=$false;uninstalled=$false;bundledNode=$null;launchReady=$false;unknownDirectoryRefused=$false;activeHelperRefused=$false}
$originalPath=$env:PATH
$registryKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\CodexAccountDeck'
function Read-RegistrySnapshot {
 if(Test-Path -LiteralPath $registryKey){return (Get-ItemProperty -LiteralPath $registryKey | Select-Object DisplayName,DisplayVersion,InstallLocation,UninstallString | ConvertTo-Json -Compress)}
 return 'absent'
}
$registryBefore=Read-RegistrySnapshot
function Run-Setup([string]$Destination,[int]$Expected=0){
 $process=Start-Process -FilePath $installerPath -ArgumentList ('/S /TESTMODE /D='+$Destination) -WindowStyle Hidden -Wait -PassThru
 if($process.ExitCode -ne $Expected){throw ('Unexpected installer exit code: '+$process.ExitCode+' expected '+$Expected)}
}
try {
 $env:PATH=(Join-Path $env:SystemRoot 'System32')+';'+$env:SystemRoot
 Run-Setup $installRoot
 $marker=Join-Path $installRoot 'installation.json'
 $manifest=Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
 $package=Get-Content -LiteralPath (Join-Path $installRoot 'app\package.json') -Raw | ConvertFrom-Json
 if($manifest.version -ne $package.version){throw 'Installed version does not match payload'}
 $node=Join-Path $installRoot 'app\runtime\node.exe'
 $report.bundledNode=(& $node --version).Trim()
 if($LASTEXITCODE -ne 0 -or $report.bundledNode -notmatch '^v22\.'){throw 'Bundled Node did not execute'}
 if(-not (Test-Path -LiteralPath (Join-Path $installRoot 'Uninstall.exe'))){throw 'EXE uninstaller missing'}
 $report.installed=$true
 $report.version=$manifest.version
 if($LaunchSmoke){
  $dataRoot=Join-Path $installRoot 'data'
  Copy-Item -LiteralPath (Join-Path $installRoot 'app\config.json') -Destination (Join-Path $dataRoot 'launch-config.json')
  & (Join-Path $installRoot 'app\Launch.ps1')
  $deadline=(Get-Date).AddSeconds(90)
  do {
   Start-Sleep -Milliseconds 500
   $statusFile=Join-Path $dataRoot 'helper-status.json'
   if(Test-Path -LiteralPath $statusFile){try{$status=Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json}catch{}}
   if($status.state -in @('error','incompatible')){throw ('Bundled launch failed: '+$status.state)}
  }until($status.state -eq 'ready' -or (Get-Date) -gt $deadline)
  if($status.state -ne 'ready'){throw 'Bundled launch did not become ready'}
  $report.launchReady=$true
  & $node (Join-Path $PSScriptRoot 'stop-sandbox.cjs') $dataRoot
  if($LASTEXITCODE -ne 0){throw 'Isolated installer test app did not close normally'}
 }
 $vault=Join-Path $installRoot 'data\saved-accounts'
 New-Item -ItemType Directory -Path $vault -Force | Out-Null
 $saved=Join-Path $vault (('a'*64)+'.json')
 'encrypted-test-fixture' | Set-Content -LiteralPath $saved
 $note=Join-Path $installRoot 'app\personal-note.txt'
 'keep this unrelated file' | Set-Content -LiteralPath $note
 $savedHash=(Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash
 Run-Setup $installRoot
 $report.reinstalled=$true
 if((Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash -ne $savedHash){throw 'Saved account fixture changed'}
 $report.savedDataPreserved=$true
 $helperLock=Join-Path $installRoot 'data\helper.lock'
 [string]$PID | Set-Content -LiteralPath $helperLock
 try {Run-Setup $installRoot 1;$report.activeHelperRefused=$true}finally{Remove-Item -LiteralPath $helperLock -Force}
 $unowned=Join-Path $testRoot 'unowned'
 New-Item -ItemType Directory -Path $unowned | Out-Null
 $sentinel=Join-Path $unowned 'personal.txt'
 'keep' | Set-Content -LiteralPath $sentinel
 Run-Setup $unowned 1
 if((Get-Content -LiteralPath $sentinel -Raw).Trim() -ne 'keep'){throw 'Unowned directory was altered'}
 $report.unknownDirectoryRefused=$true
 $uninstaller=Join-Path $installRoot 'Uninstall.exe'
 $process=Start-Process -FilePath $uninstaller -ArgumentList '/S' -Wait -PassThru -WindowStyle Hidden
 if($process.ExitCode -ne 0){throw 'EXE uninstaller failed'}
 $deadline=(Get-Date).AddSeconds(30)
 while((Test-Path -LiteralPath $marker) -and (Get-Date) -lt $deadline){Start-Sleep -Milliseconds 250}
 if((Test-Path -LiteralPath $marker) -or (Test-Path -LiteralPath $node)){throw 'Recorded application files were not removed'}
 if((Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash -ne $savedHash -or -not (Test-Path -LiteralPath $note)){throw 'Uninstall discarded retained data'}
 $report.uninstalled=$true
 $report.registryUnchanged=(Read-RegistrySnapshot) -eq $registryBefore
 if(-not $report.registryUnchanged){throw 'Sandbox installer altered primary uninstall registration'}
 $report.passed=$true
} catch {
 $report.error=$_.Exception.Message
} finally {
 $env:PATH=$originalPath
 $report | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $testRoot 'verification.json') -Encoding utf8
 $report | ConvertTo-Json -Compress
 Write-Output ('Test report: '+(Join-Path $testRoot 'verification.json'))
}
if(-not $report.passed){exit 1}
