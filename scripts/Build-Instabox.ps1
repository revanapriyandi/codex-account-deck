param([string]$Box,[string]$OutputDirectory=(Join-Path $PSScriptRoot '..\dist'))
$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cli=(Get-Command instabox.cmd -ErrorAction SilentlyContinue).Source
if(-not $cli){$cli=(Get-Command instabox -ErrorAction Stop).Source}
$revision=(& git -C $repo rev-parse HEAD).Trim()
if($revision -notmatch '^[a-f0-9]{40}$'){throw 'A committed Git checkout is required.'}
if((& git -C $repo status --porcelain)){throw 'Commit changes before the remote build.'}
$owned=$false
if(-not $Box){
 $newName='account-deck-build-'+[Guid]::NewGuid().ToString('N').Substring(0,8)
 $created=& $cli create --name $newName --no-vault --secrets none --json
 if($LASTEXITCODE -ne 0){throw 'Could not create a build box. If quota is full, use -Box with an existing box you own.'}
 $machine=$created | ConvertFrom-Json;$Box=$machine.name;$owned=$true
}
$remoteScript='/data/home/account-deck-builder-'+[Guid]::NewGuid().ToString('N')+'.sh'
try{
 & $cli push $Box (Join-Path $PSScriptRoot 'cloud-build.sh') $remoteScript
 if($LASTEXITCODE -ne 0){throw 'Could not upload the build script.'}
 $raw=& $cli exec $Box --timeout 600 --json -- bash $remoteScript $revision
 $result=$raw | ConvertFrom-Json
 if($result.stdout){Write-Output $result.stdout}
 if($LASTEXITCODE -ne 0 -or $result.exitCode -ne 0){if($result.stderr){Write-Output $result.stderr};throw 'Instabox build failed.'}
 $match=[regex]::Match($result.stdout,'(?m)^ACCOUNT_DECK_BUILD_ROOT=(/data/home/account-deck-build-[A-Za-z0-9]+/source/dist)\s*$')
 if(-not $match.Success){throw 'Build succeeded but no validated artifact path was returned.'}
 $out=[IO.Path]::GetFullPath($OutputDirectory);New-Item -ItemType Directory -Path $out -Force | Out-Null
 $metadata=Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json
 $artifact=$metadata.name+'-v'+$metadata.version+'.zip'
 foreach($name in @($artifact,'SHA256SUMS.txt','build-report.json','portable-tests.txt')){
  & $cli pull $Box ($match.Groups[1].Value+'/'+$name) (Join-Path $out $name)
  if($LASTEXITCODE -ne 0){throw ('Artifact download failed: '+$name)}
 }
 $manifest=Get-Content -LiteralPath (Join-Path $out 'build-report.json') -Raw | ConvertFrom-Json
 $sha=[Security.Cryptography.SHA256]::Create();$stream=[IO.File]::OpenRead((Join-Path $out $artifact))
 try{$actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()}finally{$stream.Dispose();$sha.Dispose()}
 if($manifest.commit -ne $revision -or $manifest.sha256 -ne $actual){throw 'Downloaded build does not match the requested commit or checksum.'}
 Write-Output ('Instabox artifacts downloaded to '+$out)
}finally{if($owned){& $cli rm --yes $Box | Out-Null}}
