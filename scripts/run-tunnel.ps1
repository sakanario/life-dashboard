# Jalanin Cloudflare Tunnel ke app production (docs/cloudflare-tunnel.md). Dipanggil run-prod.ps1
# (jendela tersembunyi), bisa juga manual: powershell -File scripts\run-tunnel.ps1
# - token dari .env CLOUDFLARE_TUNNEL_TOKEN, dioper lewat env TUNNEL_TOKEN (tidak muncul di command line proses)
# - nunggu app di port 3999 siap dulu, baru nyambung
# - kalau cloudflared mati, nyala lagi sendiri (jeda 10 detik, naik sampai maks 5 menit)
# - log ke logs\tunnel.log, dirotasi tiap start kalau > 5 MB
param([int]$Port = 3999)

$ErrorActionPreference = "Stop"
$app = Split-Path -Parent $PSScriptRoot
Set-Location $app

$logDir = Join-Path $app "logs"
$log = Join-Path $logDir "tunnel.log"
New-Item -ItemType Directory -Force $logDir | Out-Null
if ((Test-Path $log) -and (Get-Item $log).Length -gt 5MB) {
  for ($i = 3; $i -ge 1; $i--) {
    $src = if ($i -eq 1) { $log } else { "$log.$($i - 1)" }
    if (Test-Path $src) { Move-Item -Force $src "$log.$i" }
  }
}
function Write-Log([string]$msg) {
  $line = "[{0}] [tunnel] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $log -Value $line -Encoding utf8
}

# baca .env (cuma key yang dibutuhin)
$envFile = Join-Path $app ".env"
$conf = @{}
if (Test-Path $envFile) {
  foreach ($l in Get-Content $envFile) {
    if ($l -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $conf[$Matches[1]] = $Matches[2] }
  }
}
if ($conf["TUNNEL_AUTOSTART"] -eq "0") { Write-Log "TUNNEL_AUTOSTART=0, tunnel tidak dijalankan"; exit 0 }
if (-not $conf["CLOUDFLARE_TUNNEL_TOKEN"]) { Write-Log "CLOUDFLARE_TUNNEL_TOKEN kosong, tunnel tidak dijalankan"; exit 0 }

# cloudflared: exe standalone di .tools\ (di-gitignore, tanpa admin), cadangan dari PATH.
# Sengaja di folder app, bukan %LOCALAPPDATA%: tulisan ke AppData dari app terpaket (MSIX) dialihkan ke folder virtual
$cf = Join-Path $app ".tools\cloudflared.exe"
if (-not (Test-Path $cf)) { $cf = (Get-Command cloudflared.exe -ErrorAction SilentlyContinue).Source }
if (-not $cf) { Write-Log "cloudflared.exe tidak ketemu di .tools\ maupun PATH (lihat docs/cloudflare-tunnel.md)"; exit 1 }

$env:TUNNEL_TOKEN = $conf["CLOUDFLARE_TUNNEL_TOKEN"]

# tunggu app siap (maks ~10 menit, build pertama bisa lama)
for ($i = 0; $i -lt 120; $i++) {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { break }
  Start-Sleep -Seconds 5
}

$wait = 10
while ($true) {
  Write-Log "start cloudflared -> http://127.0.0.1:$Port"
  $started = Get-Date
  # lewat cmd biar stdout+stderr masuk log tanpa dibungkus PowerShell 5.1
  cmd.exe /d /c "`"$cf`" tunnel --no-autoupdate run >> `"$log`" 2>&1"
  Write-Log "cloudflared berhenti (exit $LASTEXITCODE)"
  # sempat jalan lama = gangguan baru, jeda direset
  if (((Get-Date) - $started).TotalMinutes -ge 10) { $wait = 10 }
  Write-Log "nyala lagi $wait detik lagi"
  Start-Sleep -Seconds $wait
  $wait = [Math]::Min($wait * 2, 300)
}
