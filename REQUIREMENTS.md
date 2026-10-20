# Life Dashboard App — Requirements (draft v0.4)

> Dibuat 2026-10-15 · v0.2: + Watchlist, auto-start, aturan semua file `.md` · v0.3: tampilan final = mockup (§6.9), atur posisi cover, menu samping bisa ditutup · v0.4: quest selesai tercatat di jurnal, quest aktif cuma dari README proyek, jurnal kosong = belum nulis. Vault: `E:\claude-project\life-dashboard` · App: `E:\code-project-v2\solo-project\life-dashboard-app`

## 1. Tujuan

Dashboard pribadi buat **nampilin dan ngelola hidup** (jurnal, goal, proyek, quest, konten, habit) yang kerasa kayak aplikasi dashboard beneran — bukan text editor yang buka file. Pengganti buka vault lewat Obsidian / VS Code.

## 2. Prinsip

1. **File = sumber kebenaran.** Semua data tetap di vault sebagai `.md` (+ frontmatter YAML). Tidak ada database.
2. **UI kerja dengan JSON.** Server parse semua file → objek JSON terstruktur. UI tidak pernah nampilin markdown mentah, kecuali field teks bebas (catatan, thought).
3. **Tulis balik minimal.** Aksi dari UI cuma ngubah bagian yang perlu (1 baris quest, 1 baris jurnal, 1 field frontmatter). Tidak pernah rewrite seluruh file.
4. **Claude-friendly.** Claude Code tetap baca/edit vault langsung pakai Grep/Read/Edit. Konvensi format di dokumen ini juga ditulis ke `CLAUDE.md` vault, jadi app, Claude, dan user pakai aturan yang sama.
5. **Satu app, satu proses.** UI + API dalam satu project full-stack, jalan lokal di laptop.

## 3. Arsitektur & Stack

```
Browser (laptop / HP)  ──HTTP──►  Next.js (1 proses, localhost:3000)
                                   ├─ UI (React)
                                   ├─ API routes  /api/*
                                   └─ lib/vault: parser md→JSON · writer · file watcher
                                                  │
                                                  ▼
                                   E:\claude-project\life-dashboard\**.md
```

| Bagian | Pilihan |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui, Recharts (grafik/heatmap), dnd-kit (kanban). Tampilan wajib persis mockup (§6.9), bukan gaya bawaan shadcn |
| Parsing | `gray-matter` (frontmatter), parser quest & jurnal custom (regex per baris) |
| File watcher | `chokidar` → invalidasi index in-memory → push ke UI via Server-Sent Events |
| Editor teks bebas | Textarea / editor markdown ringan (bukan editor utama) |
| Config | `.env`: `VAULT_PATH`, `TOTP_SECRET`, `SESSION_SECRET` |
| Runtime | Node 24 (sudah terpasang) |

Index vault disimpan **di memori** (±200 file → parse ulang dalam milidetik). Kalau nanti data membengkak, boleh tambah SQLite sebagai **cache turunan** yang bisa dibangun ulang dari file — tidak pernah jadi sumber kebenaran.

## 4. Struktur Vault Baru

```
Uncategorize.md                  ← quest lepas (Life/Work quest tanpa proyek)
Habits.md                        ← definisi habit
Goals/<slug>.md                  ← 1 file per goal (vision / medium / tahunan)
Journal/<YYYY>/<MM>/<YYYY-MM-DD>.md
Projects/<slug>/README.md        ← metadata + quest proyek
Projects/<slug>/*                ← catatan, aset, dll (bebas)
Content/<slug>.md                ← 1 file per konten (ide s/d done)
Content/Pipeline Short Video.md  ← panduan (tetap)
Watchlist/<slug>.md              ← 1 file per judul (anime, film, series, buku)
Watchlist/_covers/<slug>.webp    ← gambar cover (hasil upload)
Knowledge/                       ← dulu Database/ (Code, Learning, prompt, tools, ...)
Archive/                         ← dulu _Archive/, Dashboard Archieve, */archieve/
_private/                        ← credential & data asli → TIDAK PERNAH dibaca/dikirim app
_Templates/
```

**Aturan ekstensi:** semua file teks wajib `.md` — tidak ada lagi `.todo`, `.txt`, atau file tanpa ekstensi. App cuma meng-index `.md`. File non-teks (gambar, `.svg`, `.py`, `.html`, `.xlsx`) tetap apa adanya dan diperlakukan sebagai **aset** (gambar bisa dilihat di halaman Catatan, sisanya cuma tampil di file tree).

### Migrasi (sekali jalan, dikerjain Claude, isi tidak ada yang dibuang)

| Dari | Ke |
|---|---|
| `Dashboard.todo` | `Uncategorize.md` (quest + Thought) + `Goals/*.md` (vision, medium goals) + `Watchlist/re-zero.md` (status anime) |
| `Dashboard Archieve.todo` | `Archive/Dashboard Archive.md` |
| `Database/tools/plaintask example.todo` | `Knowledge/tools/plaintask example.md` |
| File tanpa ekstensi (`Content/draft/*`, `Content/done/jualan kopi/script`, `Database/prompt/crypto-summary`, `Pemadanan Data ERI/concept`) | ditambah `.md` |
| `BIRO Tanpa Jasa/deploy.md`, `Pustaka Yudistira/Metadata.md` | tetap proyek: `Projects/<slug>/` + `README.md` baru (`type: work`), file lama ikut di folder |
| `Life Journal/2026/7 - Juli/...` | `Journal/2026/07/...` (cuma ditambah frontmatter `date`, isi tidak diubah) |
| `_Templates/{{date}}.md` | template ringkasan baru (frontmatter `date`, `highlight`, `habits` + body kosong) |
| `Projects/*`, `Works/Projects/*` | `Projects/<slug>/` dengan `type: personal \| work` |
| `Works/target triwulan 4.md` | `Goals/target-triwulan-4.md` (horizon: quarter) |
| `Content/draft/*`, `done/*`, `archieve/*` | `Content/<slug>.md` dengan `stage` yang sesuai |
| `Database/` | `Knowledge/` |
| `Credential.md`, `HASIL Kota Banjar R4.xlsx` | `_private/` |
| Sintaks PlainTasks `☐ / ✓` | `- [ ] / - [x]` |

## 5. Skema Data (Konvensi Format)

### 5.1 Quest (berlaku di semua file)

Semua checkbox `- [ ]` di vault disebut **quest** (dulu "task").

```markdown
- [ ] Buat DB transaksi @dev
- [x] Halaman list transaksi done:2026-10-14
```

| Elemen | Arti |
|---|---|
| `- [ ]` / `- [x]` | belum / selesai |
| `@tag` | tag bebas (`@work`, `@konten`, ...) |
| `done:YYYY-MM-DD` | otomatis ditambah app saat dicentang, dihapus saat batal centang |
| indentasi 2 spasi | subquest |

**Tidak ada deadline** (keputusan 2026-10-15). Urutan quest = urutan baris di file; pindahin baris buat ngatur prioritas.

JSON:
```json
{ "id": "Projects/ai-maneh/README.md:12", "file": "...", "line": 12, "text": "Buat DB transaksi",
  "done": false, "tags": ["dev"], "project": "ai-maneh" }
```

**Quest selesai tercatat di jurnal** (keputusan 2026-10-15). Mencentang quest = dua perubahan dalam satu aksi:

1. Baris quest: `- [ ]` → `- [x]` + ` done:YYYY-MM-DD`
2. Jurnal tanggal itu: satu bullet ditambah ke seksi `## Quest selesai` (jurnal dibuat dari template kalau belum ada)

| Aksi | File quest | Jurnal |
|---|---|---|
| Centang | `- [x] Ganti password DB done:2026-10-15` | `- Ganti password DB · JIP` ditambah (tidak dobel kalau sudah ada) |
| Batal centang | balik ke `- [ ] Ganti password DB` | baris itu dihapus dari jurnal tanggal `done:`-nya; seksi dihapus kalau kosong |
| Centang lagi di hari lain | `done:` = tanggal baru | baris masuk ke jurnal hari itu |

- Bolak-balik centang: hasil akhir selalu ikut klik terakhir. Server mengantrekan tulis per file, UI mengirim posisi terakhir saja
- Baris jurnal yang sudah diedit user (tidak cocok persis) **tidak dihapus** saat batal centang; UI kasih tahu lewat toast
- Quest `[x]` lama tanpa `done:` tidak dicatat (tanggalnya tidak diketahui)
- Claude Code yang mencentang quest wajib ikut aturan yang sama (ditulis di `CLAUDE.md` vault)

**Stabilitas ID:** ID = `file:line`. Saat menulis balik, client kirim juga teks quest-nya; server cek baris itu masih sama, kalau sudah geser (karena diedit Claude/user) server cari ulang berdasarkan teks. Kalau tidak ketemu → tolak + minta UI refresh. Markdown tidak dikotori ID.

### 5.2 Jurnal — `Journal/YYYY/MM/YYYY-MM-DD.md`

Jurnal = **ringkasan harian**, bukan log per jam (keputusan 2026-10-15).

```markdown
---
date: 2026-10-15
highlight: Mulai bikin Life Dashboard
habits: { subuh: done, quran: done, olahraga: missed }
---
Ringkasan bebas hari ini: 1–3 paragraf atau beberapa bullet. Boleh ada @tag.

## Quest selesai
- Ganti password DB · JIP
- Buat DB transaksi · AI Maneh
```

- Body = `summary` (teks bebas, dirender sebagai markdown), **kecuali** seksi `## Quest selesai`
- `## Quest selesai` dikelola app (lihat §5.1): bullet biasa `- <teks quest> · <proyek>` (bukan checkbox, biar tidak dobel jadi quest), selalu di akhir file. Tidak ikut textarea ringkasan dan tidak dihitung jumlah kata
- **Jurnal kosong** (tanpa ringkasan, highlight, habit, dan quest selesai) dianggap belum nulis di heatmap, streak, dan peringatan bolong. File tidak pernah dihapus otomatis
- Tidak ada mood dan tidak ada Rencana Besok (keputusan 2026-10-15)
- Jurnal lama (header waktu, Habit Tracker, Rock/Sand, Insights) **tidak diubah isinya**. Cukup ditambah frontmatter `date`, dan seluruh body dianggap `summary`

```json
{ "date": "2026-10-15", "highlight": "...", "habits": { "subuh": "done", "quran": "done", "olahraga": "missed" },
  "summary": "Ringkasan bebas...", "questsDone": ["Ganti password DB · JIP"], "tags": ["work"] }
```

### 5.3 Habit — `Habits.md`

```markdown
---
habits:
  - { id: subuh,    label: Sholat subuh on time }
  - { id: quran,    label: Baca Al-Qur'an min 5 ayat }
  - { id: olahraga, label: Lari pagi / kalistenik }
  - { id: tidur,    label: Tidur sebelum jam 10 }
  - { id: deepwork, label: Deep work 1 jam project utama }
---
```
Status harian disimpan di frontmatter jurnal sebagai map, dengan 3 kemungkinan per habit:

```yaml
habits: { subuh: missed, deepwork: done }   # habit yang tidak disebut = belum
```

| State | Arti | Tampilan |
|---|---|---|
| (tidak ada) | belum | lingkaran kosong + tombol **Terlewat** |
| `done` | selesai | centang hijau + streak |
| `missed` | **Terlewat** (udah lewat waktunya, ditutup buat hari ini) | strip redup, "terlewat · besok lagi", tidak merah |

- `missed` reset streak, tapi tidak pernah ditampilkan sebagai error/merah
- Progress ring dianggap penuh kalau semua habit **selesai atau terlewat**

Kalau jurnal hari itu belum ada, app bikin dari template saat habit pertama dicentang.

### 5.4 Goal — `Goals/<slug>.md`

```markdown
---
title: Punya satu sumber income USD yang jalan sendiri
horizon: medium          # vision | medium | year | quarter
status: active           # active | done | dropped
target: 2027-12-31
metric: { label: "Income USD / bulan", current: 15.67, target: 300 }   # opsional
---
(deskripsi / alasan)

- [ ] milestone-milestone (quest biasa)
```
Proyek nyambung ke goal lewat field `goal: <slug>`.

### 5.5 Proyek — `Projects/<slug>/README.md`

```markdown
---
title: AI Maneh
type: personal           # personal | work
status: active           # idea | active | paused | done | archived
goal: income-usd
tags: [flutter, ai]
updated: 2026-10-15      # diupdate otomatis tiap ada perubahan dari app
---
(ringkasan 1–3 kalimat)

## Quest
- [ ] ...
```
File lain di folder proyek tetap catatan bebas; quest di file-file itu juga ikut di-index ke proyeknya.

### 5.6 Konten — `Content/<slug>.md`

```markdown
---
title: 19 Dollar
stage: done      # idea | script | storyboard | shotlist | rekaman | edit | upload | review | done
platform: [tiktok, ig]
project: chat-overlay
published: 2026-07-20
stats: { views: 1200, retention: "40% @3s" }   # diisi di tahap review
---
(script / storyboard / catatan)
```

### 5.7 Watchlist — `Watchlist/<slug>.md`

```markdown
---
title: Re:Zero Season 4
type: anime          # anime | series | movie | book
status: watching     # plan | watching | done | dropped
progress: 16         # episode / chapter terakhir
total: 25            # opsional
rating:              # 1–10, diisi kalau done
cover: _covers/re-zero-s4.webp  # opsional, relatif ke folder Watchlist/
cover_pos: 50 26 1.60           # opsional: posisi x% y% dan zoom (1–3). Default 50 50 1
updated: 2026-10-15
---
(catatan / kesan)
```

### 5.8 Aset

- Gambar (`.png .jpg .jpeg .webp .gif .svg`) di folder mana pun = aset. Tidak ada modul galeri (dihapus 2026-10-15)
- Gambar tampil di halaman Catatan: inline kalau di-embed di markdown (`![[gambar.png]]` / `![](path)`), atau dibuka langsung dari file tree
- Cover Watchlist disimpan di `Watchlist/_covers/`

## 6. Fitur v1

### 6.1 Today (halaman utama)
- Tanggal, highlight hari ini
- **Jurnal hari ini**: highlight + textarea ringkasan + daftar quest selesai hari ini. Kalau file hari ini belum ada, dibuat dari template saat pertama disimpan
  - Panel **collapse secara default** (user nulis jurnal malam). Header nampilin status: "Belum ditulis" atau highlight + jumlah kata
  - Mulai jam 18.00, kalau belum ditulis, muncul penanda "waktunya nulis" (panel tetap tidak kebuka otomatis)
- **Habit hari ini**: checklist dari `Habits.md`, tiap habit bisa dicentang atau ditandai **Terlewat**
- **Quest**: satu list gabungan quest terbuka (tanpa deadline), dikelompokkan per sumber: Uncategorize dulu, lalu per proyek (bisa di-collapse), filter Personal/Work. Quest yang dicentang pindah ke "Selesai hari ini" (berdasarkan `done:`) dan tercatat di jurnal (§5.1). Quest dari proyek yang diarsip tidak ikut
  - Sumber quest aktif (keputusan 2026-10-15): `Uncategorize.md`, `Projects/<slug>/README.md`, dan `Goals/*.md`. Checkbox di catatan lain proyek (diskusi, roadmap, dll) tetap di-index dan tampil di drawer proyek, tapi tidak masuk Hari ini. Checkbox di `Content/`, `Knowledge/`, `Journal/`, `Archive/` bukan quest aktif
  - Tombol **Tutup semua / Buka semua** di header card Quest (berlaku untuk grup yang lagi tampil sesuai filter; tidak mempengaruhi "Selesai hari ini"; disembunyikan kalau grup < 2). Status buka/tutup tiap grup diingat
- Quick add quest (ke `Uncategorize.md` atau pilih proyek)
- Peringatan kalau jurnal bolong (contoh: "terakhir nulis jurnal 13 Juli")

### 6.2 Goals
- Kartu per horizon: Vision → Medium → Tahun ini → Kuartal
- Progress (dari quest selesai / metric), proyek yang terhubung
- Ubah status goal

### 6.3 Projects
- Grid/list, filter `personal` / `work` / status / tag
- Kartu: progress bar, jumlah quest terbuka, quest berikutnya (urutan di file), terakhir update
- **Arsip proyek**:
  - Tombol "Arsipkan" di detail proyek, dengan konfirmasi di dalam halaman yang nyebut jumlah quest terbuka yang ikut diarsip
  - Aksi: set `status: archived` + `archived: YYYY-MM-DD`, lalu pindahin folder `Projects/<slug>/` → `Archive/Projects/<slug>/`. Notifikasi punya tombol **Urungkan**
  - Proyek yang diarsip hilang dari grid, halaman Today, hitungan, pilihan proyek waktu tambah quest, dan quest "Minggu ini". Link dari goal/konten tetap ada, dengan label "arsip"
  - Filter **Arsip** di halaman Proyek: list proyek yang diarsip, tanggal arsip, tombol **Pulihkan** (folder balik ke `Projects/`, status jadi `paused`)
  - Proyek yang diarsip read-only sampai dipulihkan
  - Index tetap baca `Archive/Projects/*/README.md` biar arsip bisa dicari
- Detail proyek: tab **Quest** (centang, tambah, edit teks, ubah urutan), **Catatan** (daftar file, buka di reader), ubah status

### 6.4 Content Pipeline
- Kanban per `stage`, drag-drop pindah stage (ubah frontmatter)
- Tambah ide cepat (bikin file `stage: idea`)
- Detail: edit script/catatan, isi stats saat review

### 6.5 Journal & Habit
- Kalender/heatmap: hari ada jurnal, intensitas = panjang ringkasan
- Streak per habit + streak jurnal
- Timeline: per hari tampil highlight + ringkasan (bisa di-expand), filter tag
- Timeline juga nampilin quest selesai per hari (dari seksi `## Quest selesai`)
- Buka & edit jurnal hari mana pun (form highlight/ringkasan/habit, bukan text editor mentah)

### 6.6 Notes (Knowledge & semua file)
- File tree + pencarian full-text di seluruh vault (kecuali `_private/`)
- Reader markdown (render wikilink `[[...]]` jadi link internal, gambar dari vault)
- Edit mode sederhana untuk file catatan bebas

### 6.7 Watchlist
- Grid kartu (cover, judul, progress bar episode), filter status/type
- Tombol **+1 episode** langsung di kartu (update `progress` + `updated`)
- Tambah judul baru, ubah status, kasih rating
- **Upload cover**: klik tombol "Upload cover" di kartu atau drag-drop gambar ke area cover
  - Validasi: harus gambar, maks 5 MB
  - Server re-encode ke webp (lebar maks 800px), simpan ke `Watchlist/_covers/<slug>.webp`, isi frontmatter `cover`
  - Bisa **Ganti** / **Hapus** (hapus file + kosongkan `cover` dan `cover_pos`)
  - **Atur** posisi cover: geser gambar, slider zoom 1–3×, Reset, Simpan/Batal (panah = geser, Enter = simpan, Esc = batal). Disimpan ke `cover_pos`; upload gambar baru me-reset posisi
  - Tombol cover (Atur/Ganti/Hapus/Upload) baru muncul saat kartu di-hover atau difokus keyboard; di layar sentuh selalu tampil
  - Tanpa cover → kartu pakai gradient + judul
- Widget kecil "Lagi ditonton" di halaman Today


### 6.8 Umum
- Live update: edit dari Claude Code / Obsidian langsung muncul di UI (SSE dari file watcher)
- Responsive (dibuka dari HP). Tema **terang default** (tidak ikut setting sistem); gelap lewat tombol "Ganti tema"
- Menu samping bisa ditutup/dibuka dengan animasi, statusnya diingat. Di HP, menutup = melipat baris cari + menu di bawah header
- Command palette (`Ctrl+K`): cari & lompat ke proyek/goal/catatan, quick add

### 6.9 Tampilan (acuan final)
- UI dibuat **persis `mockup/index.html`** (sumber yang bisa dibaca: `mockup/mockup.src.html`): layout, warna, kaca translucent, ukuran, animasi, perilaku interaksi
- Nilai token (warna terang & gelap, radius, font, tingkat transparansi) diambil dari blok `:root` dan `:root[data-theme="dark"]` di mockup, lalu dipindah ke config Tailwind / CSS variables
- Font: Montserrat (tampilan & teks), JetBrains Mono (path file & angka kecil)
- Background = gambar Super Cub yang sudah di-blur (ada sebagai data URI di mockup). Itu artwork resmi: cukup buat pemakaian pribadi, **jangan ikut** kalau app/screenshot dibagikan atau dipublish
- Folder `design-system/` = versi awal sebelum translucent, **tidak dipakai** sebagai acuan

## 7. API (garis besar)

| Method | Endpoint | Fungsi |
|---|---|---|
| GET | `/api/today` | data halaman Today |
| GET | `/api/goals`, `/api/projects`, `/api/projects/:slug` | list/detail |
| GET | `/api/content` | kartu konten |
| GET | `/api/journal?from&to`, `/api/journal/:date` | jurnal |
| GET | `/api/habits?from&to` | definisi + status harian |
| GET | `/api/notes/tree`, `/api/notes?path=`, `/api/search?q=` | catatan & pencarian |
| POST | `/api/quests` | tambah quest ke `Uncategorize.md`, README proyek (`project`), atau file goal (`goal`) |
| PATCH | `/api/quests/:id` | toggle (`done`) / edit teks (`newText`) / ubah urutan (`move: up\|down`, ikut subquest). Body sertakan teks lama untuk validasi. Toggle sekalian update `## Quest selesai` di jurnal |
| DELETE | `/api/quests/:id` | hapus quest beserta subquest-nya (body: teks lama) |
| POST / PATCH | `/api/projects`, `/api/projects/:slug` | bikin proyek baru / ubah status |
| POST / PATCH | `/api/goals`, `/api/goals/:slug` | bikin goal baru / ubah status |
| PUT | `/api/journal/:date` | simpan jurnal (highlight, habits, summary) |
| POST | `/api/projects/:slug/archive`, `/api/projects/:slug/restore` | arsip / pulihkan (update frontmatter + pindah folder) |
| PATCH | `/api/frontmatter` | ubah field frontmatter file mana pun (stage konten, ...). Status proyek & goal pakai endpoint masing-masing |
| POST | `/api/content` | ide cepat: bikin `Content/<slug>.md` dengan `stage: idea` |
| PATCH | `/api/content/:slug` | ubah stage (drag-drop), platform, project, published, stats. Masuk `review`/`done` & `published` kosong → diisi hari ini |
| GET | `/api/watchlist` | daftar judul |
| POST / PATCH | `/api/watchlist`, `/api/watchlist/:slug` | tambah judul / update progress, status, rating |
| PUT / DELETE | `/api/watchlist/:slug/cover` | upload (multipart) / hapus cover |
| GET | `/api/assets?path=&w=` | serve gambar dari vault (Catatan & cover Watchlist) |
| GET | `/api/notes?path=&raw=1` | isi mentah + `mtime` dari disk (buat editor) |
| PUT | `/api/notes?path=` | simpan catatan (body `content`, `baseMtime`; beda `mtime` → 409 + isi terbaru, `force` buat nimpa) |
| POST | `/api/login`, `/api/logout` | login kode authenticator / cadangan (cookie sesi 30 hari) / keluar |
| GET | `/api/events` | SSE: notifikasi file berubah |

## 8. Aturan Tulis Balik

- Semua write lewat satu modul `lib/vault/writer.ts`
- Edit per baris / per field frontmatter; isi lain file tidak disentuh (urutan, spasi, komentar tetap)
- Cek konflik: bandingkan `mtime`/isi baris sebelum tulis; kalau berubah → tolak, UI refresh
- Tulis atomik (tulis ke file sementara → rename)
- Path selalu divalidasi berada di dalam `VAULT_PATH`, `_private/` dan `.obsidian/` ditolak
- Endpoint tulis cuma terima `Content-Type: application/json` dan menolak `Origin` dari situs lain (biar halaman web lain tidak bisa nulis ke vault lewat browser)
- Tulis ke file yang sama diantrekan (tidak ada dua tulis bersamaan); aksi yang nyentuh dua file (quest + jurnal) mengunci keduanya

## 9. Keamanan

- Default bind `localhost`. **Semua device wajib login**, termasuk localhost (keputusan 2026-10-15: Host header bisa dipalsuin dari LAN, jadi "lokal" ga bisa dipercaya)
- Login = **kode authenticator (TOTP) saja** (keputusan 2026-10-17, metode PIN dihapus): RFC 6238, SHA-1, 6 digit, 30 detik, toleransi ±1 langkah, diverifikasi pakai Web Crypto tanpa library (`lib/totp.ts`). Kode yang sudah dipakai (atau yang lebih lama darinya) ditolak (anti replay)
- `TOTP_SECRET` + `SESSION_SECRET` di `.env`, diisi `node scripts/setup-totp.mjs` yang dijalanin sendiri di terminal PC (QR `otpauth://` cuma tampil di terminal, tidak pernah lewat app web). Salah satu kosong = app terkunci total
- Sesi = cookie httpOnly 30 hari, HMAC dari `SESSION_SECRET` + `TOTP_SECRET`: ganti salah satunya = semua sesi batal
- 8 kode cadangan sekali pakai (10 karakter) buat kalau HP hilang; yang disimpan cuma hash-nya di `.auth/state.json` (bareng langkah TOTP terakhir buat anti replay). Bikin ulang: `node scripts/setup-totp.mjs --backup-codes`
- Batas salah **per IP** 5x / 10 menit (`CF-Connecting-IP` lewat tunnel; aman dipercaya karena server cuma bind 127.0.0.1) + batas global 50x / jam, biar penyerang dari satu IP tidak bisa ngunci login pemilik
- `_private/` tidak pernah di-index, dicari, atau dikirim lewat API
- Vault tidak di-deploy ke cloud. App tetap jalan di PC, dibuka dari internet lewat **Cloudflare Tunnel** di `https://life-dashboard.ksatria.click` (keputusan 2026-10-17; ngrok cuma buat tes dev). Tidak ada port yang dibuka di router
- Di depan app ada **Cloudflare Access** (policy: email pemilik saja, sesi 24 jam): request tanpa login Access ditolak di Cloudflare, tidak pernah sampai ke PC. Login TOTP app tetap wajib di belakangnya
- `/api/assets` cuma melayani ekstensi gambar, path divalidasi di dalam vault, `_private/` ditolak

## 9b. Jalan Otomatis (Auto-start)

- App jalan dalam mode production (`next build` → `next start`), bukan dev server
- Script `scripts/install-autostart.ps1` mendaftarkan **Windows Task Scheduler** task "Life Dashboard":
  - trigger: saat user login · jalan tersembunyi (tanpa jendela terminal) · restart otomatis kalau crash (retry tiap 1 menit, maks 3x)
- Script `scripts/uninstall-autostart.ps1` untuk menghapusnya
- Log ke `logs/app.log` di folder app (rotasi sederhana)
- Port production **3999** (dev tetap 3000; port app yang jalan terus diambil dari 3000-an paling belakang, keputusan 2026-10-17). Bind `127.0.0.1`, akses HP/internet lewat Cloudflare Tunnel (`scripts/run-tunnel.ps1`, dijalankan `run-prod.ps1`, restart sendiri, log `logs/tunnel.log`)
- Shortcut opsional: buka `http://localhost:3999` di browser setelah login (belum dibuat)

## 10. Di luar scope v1

- Multi-user, sinkronisasi cloud, aplikasi mobile native
- Database sebagai sumber data
- Fitur AI / Claude API di dalam app (quest dari Rem, ringkasan otomatis): dihapus 2026-10-15
- Tracking keuangan detail (itu ranah AI Maneh)
- Graph view ala Obsidian

## 11. Tahapan Pengerjaan

| Fase | Isi | Selesai kalau |
|---|---|---|
| 0. Migrasi vault | Rombak struktur sesuai §4–5, update `CLAUDE.md` vault, `.gitignore`, fix git safe.directory | Semua file sesuai skema, tidak ada konten hilang (dicek via diff) |
| 1. Fondasi | Scaffold Next.js, parser + index + watcher, API read-only, layout + navigasi | Semua halaman tampil data asli (read-only) |
| 2. Today + Journal + Habit | Form ringkasan jurnal, habit, centang & tambah quest (+ catat ke jurnal), edit jurnal hari mana pun | Bisa nulis jurnal harian tanpa buka editor |
| 3. Projects + Goals | Quest CRUD, status, progress | Kelola quest proyek dari UI |
| 4. Content kanban | Drag-drop stage, quick idea | Pipeline konten jalan dari UI |
| 5. Notes + search + PIN | Reader, editor, pencarian, login | Bisa dibuka aman dari HP |
| 6. Watchlist | Kartu watchlist, +1 episode, upload cover | Status tontonan dikelola dari UI |
| 7. Auto-start | Build production + Task Scheduler | App nyala sendiri setelah login Windows |

> Sebelum Fase 1: **mockup UI** (HTML statis, data contoh) untuk menyepakati tampilan. ✅ Disepakati 2026-10-15 → `mockup/index.html` (lihat §6.9).

## 12. Keputusan & Pertanyaan Terbuka

- [x] Status nonton anime → modul **Watchlist** (2026-10-15)
- [x] BIRO Tanpa Jasa & Pustaka Yudistira → tetap proyek `type: work` (2026-10-15)
- [x] Jurnal di halaman Today collapse default (2026-10-15)
- [x] Jurnal tanpa mood & tanpa Rencana Besok (2026-10-15)
- [x] Watchlist punya upload cover, disimpan di `Watchlist/_covers/` (2026-10-15)
- [x] **Tanpa modul Galeri** (tab di proyek & halaman di menu dihapus, 2026-10-15). Gambar dilihat lewat halaman Catatan
- [x] Auto-start saat Windows nyala → Task Scheduler (2026-10-15)
- [x] Semua file teks → `.md` (2026-10-15)
- [x] Jurnal = ringkasan harian, bukan log per waktu (2026-10-15)
- [x] **Tanpa AI**: quest dari Rem + halaman Rem dihapus, quest tidak punya tier/reward (2026-10-15)
- [x] Istilah "task" diganti **quest**; `Inbox.md` diganti **`Uncategorize.md`** (2026-10-15)
- [x] **Quest tanpa deadline**: tidak ada `due:`, semua quest terbuka jadi satu list (2026-10-15)
- [x] Habit punya status **Terlewat** (`missed`) selain selesai (2026-10-15)
- [x] Arsip proyek = status `archived` + pindah folder ke `Archive/Projects/` (2026-10-15)
- [x] Tampilan final = mockup Super Cub (kaca translucent, tema terang default); `design-system/` tidak dipakai (2026-10-15)
- [x] Posisi & zoom cover Watchlist bisa diatur, disimpan di `cover_pos` (2026-10-15)
- [x] **Quest selesai tercatat di jurnal** hari itu, seksi `## Quest selesai` (2026-10-15)
- [x] Quest aktif di Hari ini cuma dari `Uncategorize.md`, README proyek, dan Goals (2026-10-15)
- [x] Jurnal kosong = belum nulis (heatmap, streak, peringatan bolong); file tidak dihapus otomatis (2026-10-15)
- [ ] Daftar habit final (default diambil dari habit tracker Mei)
- [ ] Link random di Dashboard (`x.com/CDPRED_Support/...`) → `Uncategorize.md` sebagai catatan, atau bikin modul bookmark?
