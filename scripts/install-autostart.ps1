# Daftarin task "Life Dashboard" di Windows Task Scheduler (REQUIREMENTS §9b):
# jalan saat user login, tanpa jendela, app production di http://localhost:3999.
# Jalanin sekali: powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1
# Matikan sementara: schtasks /Change /TN "Life Dashboard" /Disable  (nyalain: /Enable)
# Hapus: scripts\uninstall-autostart.ps1
param([switch]$NoStart)

$ErrorActionPreference = "Stop"
$taskName = "Life Dashboard"
$runner = Join-Path $PSScriptRoot "run-prod.ps1"
$app = Split-Path -Parent $PSScriptRoot

# conhost --headless = powershell jalan tanpa jendela sama sekali (-WindowStyle Hidden masih kedip)
$action = New-ScheduledTaskAction -Execute "conhost.exe" -WorkingDirectory $app `
  -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
# retry tiap 1 menit maks 3x kalau task gagal start; crash server ditangani run-prod.ps1 sendiri.
# ExecutionTimeLimit 0 = jangan dimatiin setelah 72 jam (bawaan Task Scheduler)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
  -Settings $settings -Description "Life Dashboard (Next.js production) di http://localhost:3999. Log: $app\logs\app.log" `
  -Force | Out-Null
Write-Host "Task '$taskName' terdaftar: nyala tiap login."

if (-not $NoStart) {
  Start-ScheduledTask -TaskName $taskName
  Write-Host "Task dijalanin sekarang. Build pertama bisa 1-2 menit; pantau logs\app.log, lalu buka http://localhost:3999"
}
