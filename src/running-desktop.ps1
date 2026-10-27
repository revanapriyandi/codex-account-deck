param([string]$Executable)
$ErrorActionPreference='Stop'
$items=@(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object { $_.ExecutablePath -eq $Executable -and $_.CommandLine -notmatch '--type=' } | Select-Object -ExpandProperty ProcessId)
[Console]::Out.Write((ConvertTo-Json -InputObject $items -Compress))
