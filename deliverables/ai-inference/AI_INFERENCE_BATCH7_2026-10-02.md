# AI Inference — Batch 7 (2026-10-02)

Lanjutan batch 4–6. Tema batch ini: **permukaan AI chat admin — nilai yang tidak
pernah dikirim, nilai yang tidak pernah disanitasi, dan janji kontrak yang tidak
pernah diproduksi.**

Semua perubahan dibuktikan merah-dulu + mutasi, lalu direstore byte-identik
(`cmp`). Tidak ada yang di-push (R19).

---

## Ringkasan perubahan

| # | Berkas | Temuan | Perbaikan |
|---|--------|--------|-----------|
| 1 | `src/components/admin/AdminAiCopilot.tsx` | `candidateWa` ada di props tapi **tidak pernah dikirim** ke `processAdminAIChat` | kirim `wa: candidateWa` |
| 2 | `netlify/functions/_lib/ai/chat.ts` | pesan terakhir terkirim **DUA KALI** ke prompt | cap riwayat sebelum giliran baru + dedup |
| 3 | `netlify/functions/_lib/ai/chat.ts` | `adminName` & `candidateId` masuk prompt **tanpa sanitasi** | `sanitizePromptField` |
| 4 | `netlify/functions/_lib/ai/chat.ts` | `suggestedActions: []` + `analysis: null` **hardcoded** | field dihapus dari kontrak |
| 5 | `netlify/functions/_lib/ai/chat.ts` | blok DATA tanpa batas eksplisit | delimiter `<<<DATA` / `DATA>>>` |
| 6 | `src/components/admin/AdminAiCopilot.tsx` | `handleGenModel`/`handleResults`/`handleUpdateBio` tanpa guard kesibukan | satu flag `busy` |

---

## 1. `wa` — kode mati yang memisahkan "terbaca" dari "tidak terbaca"

`AdminAiCopilot` menerima prop `candidateWa` sejak lama, tapi
`handleSend` hanya mengirim `{adminName, message, history, candidateId}`.
Sisi server **sudah siap** menerimanya:

```ts
// chat.ts — sebelum batch ini
if (d.candidateId || d.wa) {
  const ctx = await findAdminAiCandidateContext(d);
  if (ctx) ringkasKandidat = buildRingkasData(ctx);
}
```

Artinya jalur `wa` adalah kode mati **dari klien ini**. Akibat nyata: kandidat
yang punya WA tetapi tidak punya `candidateId` di scope (mis. hanya ada di
master, bukan di daftar pelamar) **kehilangan seluruh blok konteksnya** — persis
kelas cacat yang `ccc20df` tutup, tersisa di satu jalur masuk.

Perbaikan: satu baris — `wa: candidateWa || undefined`.

**Mutasi M5** (hapus baris itu) → KILLED oleh 2 tes.

---

## 2. Pesan terakhir muncul dua kali di prompt

`handleSend` menambahkan bubble admin ke state **lebih dulu**, lalu mengirim
`history: messages.slice(-20)` — state yang sudah memuatnya — **dan** `message`
terpisah. Handler lama selalu menambahkan `d.message` ke ujung:

```ts
const history = lastHistory(d.history).concat([{ role: 'user', content: d.message || '' }]);
```

Hasilnya dua entri `role: 'user'` berurutan dengan isi yang sama.
`trimTrailingModelTurn` **tidak menolong** — ia hanya membuang giliran `model`
di ujung, bukan duplikat `user`. Prompt menggelembung tiap giliran.

Perbaikan dua sisi:
- **klien**: ambil `history` SEBELUM bubble disisipkan (perbaikan sebenarnya);
- **server**: sisipkan pesan hanya kalau ujung riwayat bukan pesan yang sama
  (jaring untuk pemanggil lain).

**Mutasi M2/M6** (kembalikan `concat` tanpa dedup; kembalikan urutan klien) →
KILLED oleh 3 tes, termasuk kasus "teks sama di posisi bukan-ujung tetap
dianggap dua giliran sah" dan "cap 20 tetap berlaku".

---

## 3. `adminName` & `candidateId` — dua nilai klien terakhir tanpa gerbang

`buildRingkasData` memakai `sanitizePromptField` sejak `ccc20df`, dan alur siswa
membersihkan **setiap** fieldnya. Tapi dua nilai ini ditempel apa adanya:

```ts
'Admin: ' + String(d.adminName || '') + '. ' +
'Kandidat yang sedang dibahas ID: ' + String(d.candidateId || '-') + '. '
```

`adminName` berasal dari `user.name` di `authStore`, `candidateId` dari props.
Keduanya bisa memuat `\n` — jadi keduanya bisa **memalsukan baris instruksi**,
tepat yang sudah dicegah di jalur siswa.

Perbaikan: `sanitizePromptField(d.adminName)` dan
`(sanitizePromptField(d.candidateId) || '-')`. Placeholder `-` dipertahankan
(diuji eksplisit supaya sanitasi tidak menghapusnya).

**Mutasi M3** (kembalikan keduanya ke `String(...)`) → KILLED oleh 2 tes.
Payload uji memakai **satu** `\n` — lihat pelajaran batch 6: `\n\n` dirapatkan
`.replace(/\s{2,}/g)` sehingga tesnya akan hijau secara vakum.

---

## 4. Field mati di kontrak balasan

```ts
// SEBELUM
return { success: true, reply: r.reply, suggestedActions: [], analysis: null };
```

Tidak ada satu pun jalur yang mengisi keduanya. Sementara klien membacanya dan
merender **chip tombol** dari `suggestedActions`:

```tsx
const acts = data?.suggestedActions;
if (Array.isArray(acts) && acts.length) setSuggestions(acts.map(String));
```

Jadi ini janji dua sisi yang tidak pernah diproduksi di sisi mana pun. Field +
seluruh jalur chip-nya dihapus (state, mount effect, blok JSX) — sesuai
rekomendasi: **hapus yang tidak pernah ada, jangan tambah panggilan model baru
untuk mengisinya.**

**Mutasi M1** (kembalikan kedua field) → KILLED.

---

## 5. Blok DATA diberi batas eksplisit

Konteks kandidat disuntikkan sebagai teks polos. Tanpa delimiter, field yang
berakhir dengan instruksi menyatu dengan kalimat berikutnya dan terbaca sebagai
lanjutan **perintah**, bukan sebagai **data**. Sekarang dibungkus
`<<<DATA` … `DATA>>>`. Yang dijamin tetap **strukturnya**, bukan isi field.

**Mutasi M4** (hapus kedua token) → KILLED.

---

## 6. Guard kesibukan pada aksi panel parse

`handleParse` punya `parsing`, tapi `handleGenModel` dan `handleResults` tidak
punya penjaga apa pun — dua klik cepat = **dua permintaan AI** = dua kali kuota
provider untuk satu niat pengguna. Satu flag `busy` dipakai bersama
(parse/model/hasil/updateBio), dan tombol-tombolnya `disabled`.

**Mutasi M7** (hapus guard `handleGenModel`) → KILLED.

---

## Verifikasi

| Gerbang | Hasil |
|---|---|
| `tsc --noEmit` | 0 error |
| `lint-ratchet --base=HEAD` | **PASSED — debt reduced by 21** |
| `review:gate --base=HEAD` | **7/7 PASS** |
| Mutasi | M1, M2, M3, M4, M5, M6, M7 — **semuanya KILLED**, restore byte-identik (`cmp`) |
| Suite tersentuh | 41/41 hijau (`AdminAiCopilot` 17, `ai-chat-context` 21, `candidates-lookup-stub` 3) |
| Suite penuh | `4 failed | 177 passed (181)` — **sama persis dengan baseline** |

Baseline merah yang tersisa **bukan milik batch ini**, diatribusi satu per satu:
- `discover`/`build`/`boundary` — counter beku `indexer` (`293 vs 287`,
  `535 vs 529`) + `spawnSync EBUSY` (sandbox). Direproduksi identik di HEAD.
  **team-lead saja** yang boleh re-baseline.
- `fcm-server` — `check-ignore` in-process `exit null` (spawn diblokir sandbox);
  dijalankan tangan → 0/1 BENAR.
- `document` — probe `fetch failed` / HTTP 500 tanpa server (lingkungan).

## Catatan pembersihan

`indexer/validate-report.json` (artefak yang di-track) ditulis ulang oleh suite
counter beku saat pengukuran. Direstore (`git checkout --`) agar commit tetap
scoped — perubahannya identik dengan drift yang sudah diatribusi di HEAD.
