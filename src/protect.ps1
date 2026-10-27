param([ValidateSet('Protect','Unprotect')][string]$Mode)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())
$entropy=[Text.Encoding]::UTF8.GetBytes('codex-account-switcher-local:v1')
try {
 if($Mode -eq 'Protect') {
  $outputBytes=[Security.Cryptography.ProtectedData]::Protect($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 } else {
  $outputBytes=[Security.Cryptography.ProtectedData]::Unprotect($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 }
 [Console]::Out.Write([Convert]::ToBase64String($outputBytes))
} catch { [Console]::Error.Write('Credential protection failed'); exit 1 }
finally { [Array]::Clear($inputBytes,0,$inputBytes.Length) }
