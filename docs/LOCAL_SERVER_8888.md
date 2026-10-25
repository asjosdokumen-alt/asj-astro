# Server lokal — http://localhost:8888

Cara menjalankan ASJ Portal di komputer sendiri, dengan **kode terbaru** dan
**fungsi Netlify hidup**. Satu klik, tidak perlu diingat-ingat lagi.

## Ringkasnya

Klik dua kali **`dev.cmd`** di akar repo. Browser dibuka ke
<http://localhost:8888>. Tutup jendela hitamnya kalau sudah selesai.

Itu saja. Sisa dokumen ini menjelaskan kenapa caranya begitu, supaya kalau
suatu hari gagal, penyebabnya bisa dikenali dalam satu menit.

## Dua port, satu situs

| Port | Siapa yang duduk di sana | Perlu dibuka? |
| --- | --- | --- |
| 8888 | `netlify dev` — proxy + fungsi Netlify | **Ya**, ini alamat yang dipakai |
| 4321 | `astro dev` — sumber `src/`, hot reload | Tidak, hanya mesin di baliknya |

Membuka 4321 juga bisa, tapi halaman admin akan kosong: `astro dev` sendirian
tidak menjalankan fungsi, jadi `get-app-data`, `candidates`, `ai-chat` dan
kawan-kawan menjawab 404. Selalu pakai 8888.

## Tiga cara menjalankan

| Cara | Perintah | Kapan dipakai |
| --- | --- | --- |
| Klik | `dev.cmd` | Sehari-hari. Sudah termasuk pembersihan port |
| npm | `npm run dev:8888` | Dari terminal yang sudah di folder repo |
| Manual | `netlify dev --offline --port 8888` | Kalau mau melihat keluaran apa adanya |

Ketiganya menjalankan hal yang sama. `dev.cmd` menambah dua hal yang tidak ada
di dua cara lainnya: membersihkan `NODE_OPTIONS` dan mematikan sisa proses di
port 4321/8888 sebelum mulai.

## Database: lokal memakai Neon (data produksi)

Sejak **2026-10-25** `.env.local` menunjuk database yang sama dengan produksi.
Sebelumnya ia masih menunjuk proyek Supabase lama, dan akibatnya fitur yang
tabelnya baru ada di Neon (mis. `wawancara_soal`, migrasi 021) **tidak akan
pernah muncul di lokal** — seberapa pun kali schema cache di Neon di-refresh,
karena permintaannya tidak pernah sampai ke Neon.

| Variabel | Menunjuk ke | Kenapa |
| --- | --- | --- |
| `SUPABASE_URL` + kunci | Neon | Database utama, sama dengan produksi |
| `SUPABASE_JWT_ALG` / `_KID` / `_PRIVATE_KEY` | Neon | Neon memverifikasi lewat JWKS, bukan shared secret |
| `STORAGE_SUPABASE_URL` / `_KEY` | Supabase | **Storage tetap di Supabase**, hanya DB yang pindah |
| `SUPABASE_JWT_SECRET` | mati | Kalau dihidupkan, kode jatuh ke HS256 dan Neon menolak semua token |

> **Peringatan.** Karena lokal memakai database produksi, jawaban yang Anda
> simpan saat menguji masuk ke data siswa sungguhan. Kalau perlu menguji sesuatu
> yang berbahaya, pakai kandidat uji — bukan kandidat asli.

Cadangan `.env.local` sebelum perubahan ada di
`env-kunci/.env.local.backup-2026-10-25`. Kalau panel admin tiba-tiba
menampilkan `PGRST205 ... in the schema cache` lagi, periksa dulu host di
`SUPABASE_URL` — kemungkinan berkas itu kembali ke nilai lama.

## Dua jebakan yang membuat "kode terbaru" jadi bohong

Keduanya sudah ditangani `dev.cmd`. Kalau menjalankan perintah manual, keduanya
harus diingat sendiri.

### 1. `NODE_OPTIONS` dari WorkBuddy

Saat perintah dijalankan dari dalam WorkBuddy, `NODE_OPTIONS` berisi
`--require .../safe-delete`. Shim itu gagal menghapus `.netlify/functions-serve`
dan `netlify dev` mati dengan pesan:

```
Failed to load function get-app-data: [safe-delete] ... trash operation
Error: Netlify CLI has terminated unexpectedly
```

Obatnya satu baris: kosongkan variabelnya sebelum memanggil netlify.

```
NODE_OPTIONS= netlify dev --offline --port 8888      (bash)
set "NODE_OPTIONS="                                  (cmd)
```

Dari terminal biasa (bukan dari dalam WorkBuddy) variabel ini memang kosong,
jadi tidak perlu apa-apa.

### 2. Port 4321 yang masih dipegang `astro dev` lama

Ini yang paling berbahaya karena **tidak menimbulkan error sama sekali**.
`netlify dev` melihat ada yang menjawab di 4321, lalu mem-proxy 8888 ke sana.
Kalau yang menjawab adalah `astro dev` sisa sesi sebelumnya, yang terbuka di
browser adalah **kode lama**, padahal `src/` sudah berubah. Gejalanya: edit tidak
kelihatan, atau malah balik ke perilaku lama.

Ciri khasnya ada di log: `astro dev` menulis `Port 4321 is in use, trying
another one...` lalu pindah ke 4322, sementara `netlify dev` tetap menunggu 4321.

`dev.cmd` mematikan dulu apa pun yang LISTENING di 4321 dan 8888, dan mencetak
PID yang dimatikannya.

## Kenapa `--offline`

Tanpa `--offline`, `netlify dev` memanggil API Netlify untuk daftar add-on
situs lalu mati:

```
Failed retrieving addons for site 8e6e8ed4-...: Not Found
```

Sebabnya bukan kode: token CLI yang terpasang di mesin ini milik akun lain,
sedangkan situsnya milik akun `kawaisonamai`. `--offline` melewati panggilan itu
dan membaca `.env` + `.env.local` — yang justru sudah lengkap (`SUPABASE_URL`,
`GEMINI_API_KEY`, `FONNTE_TOKEN`, `HEALTH_TOKEN`, dan seterusnya).

## Memastikan yang terbuka memang kode terbaru

Jalankan tiga perintah ini; semuanya harus `200`.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/admin
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8888/wawancara
```

Lalu pastikan fungsinya hidup — harus keluar JSON, bukan 404:

```bash
curl -s http://127.0.0.1:8888/.netlify/functions/health
```

`{"status":"ok", ...}` berarti proxy, fungsi, dan env semuanya siap.

`astro dev` membaca `src/` langsung, jadi setiap simpan file langsung terlihat
di 8888 tanpa build. `dist/` **tidak** dipakai di sini — hasil `npm run build`
hanya dipakai gate e2e dan preview statis.

## Kalau gagal

| Gejala | Sebab | Tindakan |
| --- | --- | --- |
| `Failed to load function ... trash operation` | `NODE_OPTIONS` masih berisi shim | Kosongkan, atau pakai `dev.cmd` |
| `Failed retrieving addons for site ...` | Tidak memakai `--offline` | Tambahkan `--offline` |
| Port 4321 pindah ke 4322 di log | Ada `astro dev` lama | Tutup, atau jalankan `dev.cmd` |
| Edit tidak kelihatan di browser | Proxy menunjuk server basi | Hentikan semua, mulai ulang lewat `dev.cmd` |
| Halaman admin kosong, fungsi 404 | Membuka 4321, bukan 8888 | Pakai 8888 |
| `netlify: command not found` | CLI belum terpasang | `npm install -g netlify-cli` |

## Berkas yang terkait

| Berkas | Isi |
| --- | --- |
| `dev.cmd` | Peluncur satu klik, termasuk pembersihan port |
| `netlify.toml` | Konfigurasi build, redirect, dan header |
| `.env.local` | Variabel yang dipakai `--offline` |
| `server.cjs` | Server statis untuk `dist/` (dipakai gate e2e, bukan untuk coding) |
