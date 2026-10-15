# Life Dashboard

Dashboard pribadi di atas vault markdown (`VAULT_PATH`). Spesifikasi lengkap: [REQUIREMENTS.md](REQUIREMENTS.md).

## Jalanin

```bash
npm install
npm run dev        # http://localhost:3000
```

`.env`:

```
VAULT_PATH=E:\claude-project\life-dashboard
APP_PIN=           # dipakai mulai Fase 5
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
