# Life Dashboard

Dashboard pribadi di atas vault markdown (`VAULT_PATH`). Spesifikasi lengkap: [REQUIREMENTS.md](REQUIREMENTS.md).

## Jalanin

```bash
npm install
npm run dev        # http://localhost:3000
```

## Auto-start (production, port 3999)

Task Scheduler "Life Dashboard" nyalain `scripts/run-prod.ps1` tiap login Windows, tanpa jendela. Dev server tetap di 3000, jadi dua-duanya bisa jalan barengan. Port app yang jalan terus diambil dari 3000-an paling belakang (3999, 3998, …).

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-autostart.ps1            # daftar + jalanin sekarang
powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1 -KeepTask  # matiin server, task tetap ada
powershell -ExecutionPolicy Bypass -File scripts\uninstall-autostart.ps1            # matiin server + hapus task
schtasks /Change /TN "Life Dashboard" /Disable                                      # jangan nyala pas login (/Enable buat balikin)
```

- `schtasks /End` **tidak** cukup buat matiin server (cuma jendela tersembunyinya yang mati); pakai `uninstall-autostart.ps1 -KeepTask`
- Build ulang otomatis saat start kalau commit `HEAD` beda dari build terakhir (perubahan yang belum di-commit tidak ikut ke-detect). Biar update kepakai: `uninstall-autostart.ps1 -KeepTask` lalu `Start-ScheduledTask "Life Dashboard"`
- Server mati sendiri → dicoba lagi tiap 1 menit, maks 3x
- Bind `127.0.0.1` (tidak kebuka ke LAN). Dari HP/internet: **https://life-dashboard.ksatria.click** lewat Cloudflare Tunnel + Cloudflare Access (setup: [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md))
- Tunnel dijalankan `run-prod.ps1` lewat `scripts/run-tunnel.ps1` (`.tools\cloudflared.exe`, token `CLOUDFLARE_TUNNEL_TOKEN` di `.env`, log `logs/tunnel.log`). Matikan: `TUNNEL_AUTOSTART=0` di `.env` lalu restart
- ngrok cuma buat tes dev: `bash scripts/ngrok.sh 3000`
- Log: `logs/app.log`, dirotasi tiap start kalau > 5 MB (simpan 3 file lama)

`.env`:

```
VAULT_PATH=E:\claude-project\life-dashboard
TOTP_SECRET=       # login authenticator, diisi scripts/setup-totp.mjs
CLOUDFLARE_TUNNEL_TOKEN=  # token tunnel dari dashboard Cloudflare (docs/cloudflare-tunnel.md)
SESSION_SECRET=    # kunci cookie sesi (acak 32 byte), diisi scripts/setup-totp.mjs
USER_NAME=Satria   # buat sapaan di Hari ini
```

## Struktur

| Path | Isi |
|---|---|
| `lib/vault/index.ts` | index vault di memori + file watcher (chokidar). `getVault()` selalu jalan saat request |
| `lib/vault/parse.ts` | frontmatter (YAML core schema: tanggal tetap string), quest per baris, teks polos |
| `lib/vault/views.ts` | data per halaman (Hari ini, Goals, Proyek, Konten, Jurnal, Watchlist) |
| `lib/vault/notes.ts` | file tree, wikilink Obsidian, pencarian |
| `lib/vault/paths.ts` | validasi path: harus di dalam vault, `_private/` & `.obsidian/` ditolak |
| `app/api/*` | API read-only (§7) + `GET /api/events` (SSE perubahan file) |
| `app/globals.css` | CSS dari `mockup/mockup.src.html` (acuan tampilan final, §6.9). Tailwind dipasang tanpa preflight |

## Catatan

- **Fase 1 = read-only.** Tombol yang nulis ke vault (centang quest, habit, simpan jurnal, +1 episode, dll) tampil tapi belum aktif.
- Quest di halaman Hari ini diambil dari `Uncategorize.md`, `Projects/**` (yang tidak diarsip), dan `Goals/**`. Checkbox di `Content/`, `Knowledge/`, `Journal/`, `Archive/` tetap di-index tapi tidak masuk daftar aktif.
- `public/super-cub-bg.jpg` itu artwork resmi Super Cub buat pemakaian pribadi. Jangan ikut kalau app atau screenshot-nya dibagikan.
