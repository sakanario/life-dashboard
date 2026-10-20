# Guide: Life Dashboard live lewat Cloudflare Tunnel

> Dibuat 2026-10-20. Target: app bisa dibuka aman di **https://life-dashboard.ksatria.click**.
> Terkait: `TODO.md` §2, REQUIREMENTS §9/§9b.

## Gambaran

```
HP / browser
   │  https://life-dashboard.ksatria.click
   ▼
Cloudflare ── Access: login email + kode OTP (cuma email pemilik)
   │
   ▼  Tunnel (koneksi keluar dari PC, tanpa buka port router)
cloudflared di PC
   │
   ▼
Next.js prod  http://127.0.0.1:3999  ── login TOTP (authenticator)
```

- PC tidak membuka port apa pun ke internet. `cloudflared` yang menyambung **keluar** ke Cloudflare.
- Server tetap bind `127.0.0.1`, jadi dari LAN pun tidak bisa diakses langsung.
- Dua kunci: email (Cloudflare Access) + HP (TOTP).
- App cuma bisa diakses selama PC nyala dan tidak sleep.

Pembagian kerja: **langkah 1–4 dikerjakan user** (butuh login akun Cloudflare), **langkah 5 dikerjakan Claude** di PC.

---

## 1. Pindahkan DNS `ksatria.click` ke Cloudflare

Lewati kalau domain sudah berstatus **Active** di dashboard Cloudflare.

1. Buka https://dash.cloudflare.com → **Add a domain** → isi `ksatria.click` → pilih plan **Free**.
2. Cloudflare memindai record DNS lama. **Cek daftarnya dengan teliti**, terutama kalau domain dipakai untuk email (`MX`, `TXT` SPF/DKIM/DMARC) atau situs lain. Record yang tidak ikut tersalin = layanan itu mati setelah pindah.
3. Cloudflare memberi 2 nameserver (contoh: `xxx.ns.cloudflare.com`). Ganti nameserver domain di **registrar** (tempat beli domain) dengan dua alamat itu.
4. Tunggu status domain jadi **Active** (beberapa menit sampai beberapa jam). Cloudflare biasanya kirim email kalau sudah aktif.

## 2. Pasang Cloudflare Access (sebelum tunnel)

Gerbang dipasang dulu, baru pintu dibuka, supaya tidak ada momen app terbuka tanpa penjaga.

1. Buka dashboard **Zero Trust**: https://one.dash.cloudflare.com
   - Pertama kali: buat *team name* (bebas, misal `ksatria`) dan pilih plan **Free** (sampai 50 user). Mungkin diminta data kartu, tapi plan Free tidak ditagih.
2. **Access → Applications → Add an application → Self-hosted**
   - Application name: `Life Dashboard`
   - Session duration: `24 hours`
   - Public hostname / domain: subdomain `life-dashboard`, domain `ksatria.click`
3. Policy:
   - Policy name: `Owner`
   - Action: **Allow**
   - Include → **Emails** → email pribadimu (hanya satu)
4. Login method: **One-time PIN** (kode dikirim ke email). Boleh tambah Google/GitHub kalau mau.
5. Simpan.

Wajib: akun email itu sudah pakai **2FA**, karena email sekarang jadi salah satu kunci masuk.

## 3. Bikin tunnel

1. Zero Trust → **Networks → Tunnels → Create a tunnel** → pilih **Cloudflared**.
2. Nama tunnel: `life-dashboard`.
3. Di halaman instalasi pilih **Windows**. Muncul perintah berisi token panjang (diawali `eyJ...`).
   - **Jangan jalankan perintah `cloudflared service install`.** Itu butuh admin, sedangkan user Windows ini bukan admin. Tunnel nanti dijalankan oleh `scripts/run-prod.ps1`.
   - Cukup **salin tokennya** (bagian setelah `--token` / `install`).
4. Lanjut ke tab **Public hostname** (di UI baru bisa bernama *Published application routes*):
   - Subdomain: `life-dashboard`
   - Domain: `ksatria.click`
   - Path: kosong
   - Service type: **HTTP**
   - URL: `127.0.0.1:3999`
5. Simpan. Cloudflare otomatis membuat record DNS `CNAME life-dashboard → <id>.cfargotunnel.com`.

## 4. Simpan token di `.env`

Tambahkan satu baris di `.env` folder app:

```
CLOUDFLARE_TUNNEL_TOKEN=eyJ...
```

- **Jangan tempel token di chat / Claude / tempat lain.** Siapa pun yang memegang token bisa menyambungkan server mereka ke domainmu.
- `.env` sudah di-gitignore, jadi tidak ikut ter-commit.
- Token bocor? Zero Trust → Networks → Tunnels → `life-dashboard` → **Refresh token** / rotate, lalu ganti di `.env`.

Setelah ini, kabari Claude.

## 5. Bagian Claude (di PC)

1. Install `cloudflared` per user: `winget install Cloudflare.cloudflared` (tanpa admin, tanpa Windows service).
2. `scripts/run-prod.ps1` ikut menjalankan `cloudflared tunnel run --token ...` setelah server siap:
   - restart otomatis kalau tunnel mati,
   - log ke `logs/tunnel.log`,
   - dilewati kalau token kosong atau `TUNNEL_AUTOSTART=0`.
3. `scripts/uninstall-autostart.ps1` ikut mematikan `cloudflared`.
4. Restart prod, lalu cek:
   - halaman lewat domain: muncul login Access dulu, lalu login TOTP,
   - cookie `ld_session` berflag `secure` (Cloudflare mengirim `x-forwarded-proto: https`),
   - live update `/api/events` (SSE) tetap nyambung (ping 25 detik < batas idle 100 detik Cloudflare),
   - cek `Origin` di endpoint tulis (`lib/api.ts`) lolos untuk domain baru,
   - batas salah login per IP pakai `CF-Connecting-IP`.
5. Update README + REQUIREMENTS §9/§9b, commit.

## 6. Tes setelah live

- Dari HP pakai **data seluler** (bukan wifi rumah): buka `https://life-dashboard.ksatria.click` → login Access (kode email) → login TOTP → dashboard tampil.
- Coba dari browser lain / mode incognito dengan email lain di Access → harus ditolak.
- Zero Trust → **Logs → Access**: login barusan tercatat.

## Troubleshooting

| Gejala | Kemungkinan penyebab |
|---|---|
| `Error 1033` / *Argo Tunnel error* | `cloudflared` tidak jalan. Cek `logs/tunnel.log`, pastikan PC nyala dan task "Life Dashboard" aktif |
| `502 Bad Gateway` | Tunnel jalan tapi app di 3999 mati. Cek `logs/app.log` |
| Domain tidak bisa dibuka sama sekali | Nameserver belum aktif (langkah 1) atau record DNS tunnel belum dibuat (langkah 3.4) |
| Langsung masuk login TOTP tanpa login Access | Access application belum dibuat / hostname-nya salah ketik. **Perbaiki dulu sebelum dipakai** |
| Login TOTP sukses tapi terlempar balik ke `/login` | Cookie tidak tersimpan. Cek header `x-forwarded-proto` dan jam PC |
| Live update putus-putus | Cek ping SSE `/api/events` dan log tunnel |

## Darurat

- **Matikan akses dari internet seketika**: Zero Trust → Networks → Tunnels → `life-dashboard` → hapus public hostname (atau hapus tunnelnya). App lokal tetap jalan.
- **Logout semua device Access**: Zero Trust → Access → Users / Logs → **Revoke**.
- **Logout semua sesi app**: `node scripts/setup-totp.mjs --force` (scan QR ulang), lalu restart prod.
- **Matikan tunnel otomatis**: isi `TUNNEL_AUTOSTART=0` di `.env`, restart prod.

> Catatan: nama menu dashboard Cloudflare sering berubah. Kalau ada layar yang beda dari guide ini, cari menu dengan fungsi yang sama (Tunnels, Access applications, Public hostname).
