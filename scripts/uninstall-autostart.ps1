# Hapus task "Life Dashboard" dan matiin app production yang lagi jalan.
# powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1
# -KeepTask: cuma matiin server, task tetap terdaftar (besok login nyala lagi)
param([switch]$KeepTask, [int]$Port = 3999)

$ErrorActionPreference = "Stop"
$taskName = "Life Dashboard"

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) { Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue }

# matiin supervisor dulu (run-prod.ps1), kalau tidak dia nyalain ulang server yang dimatiin
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like "*run-prod.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host "supervisor dimatiin (PID $($_.ProcessId))" }

# lalu node yang masih megang port
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue; Write-Host "server di port $Port dimatiin (PID $_)" }

if ($KeepTask) {
  Write-Host "Server mati. Task '$taskName' tetap terdaftar."
} elseif ($task) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  Write-Host "Task '$taskName' dihapus. App ga nyala sendiri lagi."
} else {
  Write-Host "Task '$taskName' memang tidak ada."
}
