# Jalanin app mode production di port 3999 (REQUIREMENTS §9b). Dipanggil task "Life Dashboard"
# saat login, tapi bisa juga dijalanin manual: powershell -File scripts\run-prod.ps1
# - build ulang kalau commit HEAD beda dari build terakhir (atau belum pernah build)
# - log ke logs\app.log, dirotasi tiap start kalau > 5 MB (simpan 3 file lama)
# - kalau server mati sendiri, coba lagi tiap 1 menit, maks 3x
param(
  [int]$Port = 3999,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$app = Split-Path -Parent $PSScriptRoot
Set-Location $app

$logDir = Join-Path $app "logs"
$log = Join-Path $logDir "app.log"
New-Item -ItemType Directory -Force $logDir | Out-Null

# rotasi sederhana: app.log -> app.log.1 -> app.log.2 -> app.log.3 (yang paling lama dibuang)
if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) {
  for ($i = 3; $i -ge 1; $i--) {
    $src = if ($i -eq 1) { $log } else { "$log.$($i - 1)" }
    if (Test-Path $src) { Move-Item -Force $src "$log.$i" }
  }
}

function Write-Log([string]$msg) {
  $line = "[{0}] [autostart] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
}

# node.exe: pakai yang di PATH; task scheduler kadang belum dapet PATH lengkap, jadi ada cadangan
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = "C:\nvm4w\nodejs\node.exe" }
$next = Join-Path $app "node_modules\next\dist\bin\next"

# jalanin node, stdout+stderr ke log (lewat cmd biar PowerShell 5.1 ga ngebungkus stderr)
function Invoke-Node([string]$nodeArgs) {
  cmd.exe /d /c "`"$node`" `"$next`" $nodeArgs >> `"$log`" 2>&1"
  return $LASTEXITCODE
}

$stamp = Join-Path $app ".next\autostart-commit"
$head = (git -C $app rev-parse HEAD 2>$null)
$built = if (Test-Path $stamp) { (Get-Content $stamp -Raw).Trim() } else { "" }
if (-not (Test-Path (Join-Path $app ".next\BUILD_ID")) -or ($head -and $head -ne $built)) {
  Write-Log "build production (HEAD $head)"
  $code = Invoke-Node "build"
  if ($code -ne 0) { Write-Log "build gagal (exit $code)"; exit 1 }
  if ($head) { Set-Content -Path $stamp -Value $head -Encoding ascii }
}

# Cloudflare Tunnel (docs/cloudflare-tunnel.md): jalan di proses sendiri, nunggu server siap.
# Dilewati sendiri kalau CLOUDFLARE_TUNNEL_TOKEN kosong / TUNNEL_AUTOSTART=0. Cuma satu yang jalan.
$tunnelRunning = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like "*run-tunnel.ps1*" }
if (-not $tunnelRunning) {
  Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$(Join-Path $PSScriptRoot 'run-tunnel.ps1')`"", "-Port", $Port
  )
  Write-Log "tunnel supervisor dijalankan (lihat logs\tunnel.log)"
}

$retries = 3
$try = 0
while ($true) {
  Write-Log "start http://localhost:$Port (bind $HostName)"
  $started = Get-Date
  $code = Invoke-Node "start -p $Port -H $HostName"
  Write-Log "server berhenti (exit $code)"
  # sempat jalan lama = crash baru, jatah coba lagi direset
  if (((Get-Date) - $started).TotalMinutes -ge 10) { $try = 0 }
  $try++
  if ($try -gt $retries) { break }
  Write-Log "coba lagi 1 menit lagi ($try/$retries)"
  Start-Sleep -Seconds 60
}
Write-Log "menyerah setelah $retries kali coba"
exit 1
