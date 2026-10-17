# TODO: Life Dashboard online

> Dibuat 2026-10-17. Goal akhir: app bisa diakses aman di **https://life-dashboard.ksatria.click**.

## Kondisi sekarang

- Fase 7 (auto-start) selesai & dites di branch `fase-7-autostart` (cek `git status`, mungkin belum di-commit). Task Scheduler "Life Dashboard" sudah terpasang, app production jalan di `http://127.0.0.1:3999` (bind localhost saja). Lihat README bagian Auto-start
- Dev server tetap di 3000. Prinsip port: app yang jalan terus diambil dari 3000-an paling belakang (3999, 3998, …)
- Login sekarang: PIN 6 angka (`APP_PIN`), sesi cookie 30 hari, kunci 5 salah / 10 menit **global** (`app/api/login/route.ts`), kunci HMAC sesi diturunin dari PIN (`lib/auth.ts`)

## Keputusan (2026-10-17)

- Tunnel: **Cloudflare Tunnel** (bukan ngrok); ngrok cuma buat tes dev (`bash scripts/ngrok.sh 3000`)
- Login: **authenticator (TOTP) saja, metode PIN dihapus**
- Cloudflare Access di depan app: disarankan (lapis tambahan, gratis), opsional

## 1. Login authenticator (ganti PIN)

- [x] `TOTP_SECRET` (base32) + `SESSION_SECRET` (acak 32 byte) di `.env`; hapus `APP_PIN` dari kode, `.env`, README, REQUIREMENTS §9
- [x] Kunci HMAC sesi dari `SESSION_SECRET` (bukan dari PIN lagi). Ganti `TOTP_SECRET`/`SESSION_SECRET` = semua sesi batal
- [x] Verifikasi TOTP (RFC 6238: SHA-1, 6 digit, 30 detik, toleransi ±1 langkah) pakai Web Crypto, tanpa library kalau bisa; kode yang sudah dipakai ditolak (anti replay)
- [x] Batas salah **per IP** (`CF-Connecting-IP` lewat tunnel; aman dipercaya karena server cuma bind 127.0.0.1) + batas global longgar (mis. 50/jam), biar penyerang ga bisa ngunci login pemilik
- [x] Script setup `scripts/setup-totp.mjs`: bikin secret, tulis ke `.env` tanpa nampilin di chat, tampilkan QR `otpauth://` di terminal buat di-scan HP. QR tidak pernah lewat app web
- [x] Kode cadangan sekali pakai (mis. 8 kode, disimpan hash-nya) buat kalau HP hilang
- [x] Halaman `/login`: satu field 6 digit (inputmode numeric, autocomplete `one-time-code`)
- [x] Tes: kode benar/salah, kode lama, replay, kunci per IP, sesi lama batal setelah ganti secret (`npm test` + tes HTTP manual di salinan app)
- [x] **User**: jalanin `node scripts/setup-totp.mjs` sendiri di terminal, scan QR, catat kode cadangan (`APP_PIN` otomatis dihapus dari `.env`)
- [x] Rebuild prod: `scripts\uninstall-autostart.ps1 -KeepTask` lalu `Start-ScheduledTask "Life Dashboard"`

## 2. Cloudflare Tunnel ke life-dashboard.ksatria.click

Bagian user (butuh akun Cloudflare):
- [ ] Pastikan `ksatria.click` pakai nameserver Cloudflare (cek record DNS lama ikut kesalin)
- [ ] Zero Trust → Networks → Tunnels: bikin tunnel `life-dashboard`, public hostname `life-dashboard.ksatria.click` → `http://127.0.0.1:3999`
- [ ] Simpan token ke `.env` sebagai `CLOUDFLARE_TUNNEL_TOKEN=` (jangan di-commit)
- [ ] (Opsional, disarankan) Access application buat hostname itu, policy email sendiri; email pakai 2FA

Bagian Claude:
- [ ] Install `cloudflared` (`winget install Cloudflare.cloudflared`; user bukan admin, jadi tidak pakai mode Windows service)
- [ ] `run-prod.ps1` ikut jalanin `cloudflared tunnel run --token ...` setelah server siap, dengan penjaga restart sendiri + log `logs/tunnel.log`; dilewati kalau token kosong atau `TUNNEL_AUTOSTART=0`
- [ ] `uninstall-autostart.ps1` ikut matiin cloudflared
- [ ] Cek: halaman lewat domain, login TOTP, cookie `secure` (header `x-forwarded-proto`), SSE `/api/events` tetap nyambung (ping 25 detik < batas idle 100 detik Cloudflare), cek Origin di endpoint tulis (`lib/api.ts`)
- [ ] Update README + REQUIREMENTS §9/§9b

## 3. Pengerasan tambahan (opsional)

- [ ] Route GET `/api/*` ikut cek sesi sendiri (sekarang cuma dijaga `proxy.ts`; bug bypass proxy = vault kebaca)
- [ ] Dev server bind `127.0.0.1` (`next dev -H 127.0.0.1`): sekarang 0.0.0.0 + firewall Windows ngizinin node.exe di profil Public
- [ ] Rate limit Cloudflare gratis untuk `/api/login`
- [ ] Update Next/React rutin (app terbuka ke internet = bug sebelum login berbahaya)
- [ ] Merge `fase-7-autostart` ke main
