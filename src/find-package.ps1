$ErrorActionPreference='Stop'
$item=Get-AppxPackage -Name OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1
if(-not $item){throw 'Codex package is not installed'}
[Console]::Out.Write((@{installLocation=$item.InstallLocation;version=$item.Version.ToString();family=$item.PackageFamilyName;appId='App'} | ConvertTo-Json -Compress))
