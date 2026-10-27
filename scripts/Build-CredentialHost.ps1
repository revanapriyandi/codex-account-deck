param([string]$OutputDirectory=(Join-Path $PSScriptRoot '..\src'))
$ErrorActionPreference='Stop'
$compiler=Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if(-not (Test-Path -LiteralPath $compiler)){throw '.NET Framework C# compiler is required on Windows'}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output=Join-Path ([IO.Path]::GetFullPath($OutputDirectory)) 'CredentialHost.exe'
& $compiler /nologo /target:exe /optimize+ /reference:System.Security.dll ("/out:"+$output) (Join-Path $PSScriptRoot '..\src\credential-host.cs')
if($LASTEXITCODE -ne 0){throw 'CredentialHost build failed'}
Write-Output 'CredentialHost built from local source.'
