#!/usr/bin/env bash
# test-profile-progress.mutations.sh — baterai mutasi untuk profileProgress.
#
# TUJUAN: membuktikan tes di profileProgress.test.ts benar-benar BISA GAGAL.
# Tes yang tidak pernah terlihat merah hanyalah hipotesis, bukan bukti.
#
# Aturan yang dipatuhi (lihat memori proyek):
#   - backup di direktori temp OS, bukan di pohon kerja — supaya kuota hapus
#     shim sandbox tidak meninggalkan sampah yang terbaca sebagai leftover;
#   - cleanup dibungkus supaya TIDAK PERNAH menutupi verdict;
#   - setiap mutasi menuntut hasil KILLED (tes merah). Mutasi yang lolos
#     berarti tesnya buta terhadap perubahan itu.
#
# Jalankan: bash e2e/test-profile-progress.mutations.sh
set -u

TARGET="src/lib/profileProgress.ts"
TEST="src/lib/profileProgress.test.ts"
BAK="$(mktemp -d 2>/dev/null || echo "${TEMP:-/tmp}/asj-pp-$$")"
cp "$TARGET" "$BAK/profileProgress.ts" 2>/dev/null || true

if [ ! -f "$BAK/profileProgress.ts" ]; then
  echo "FATAL: backup gagal dibuat — tidak ada berkas untuk dipulihkan. Batal."
  exit 1
fi

killed=0
survived=0
total=0

run_mutation() {
  local name="$1" old="$2" new="$3"
  total=$((total + 1))
  cp "$BAK/profileProgress.ts" "$TARGET"
  if ! OLD="$old" NEW="$new" node -e '
    const fs = require("fs");
    const p = "src/lib/profileProgress.ts";
    const s = fs.readFileSync(p, "utf8");
    const old = process.env.OLD, neu = process.env.NEW;
    const n = s.split(old).length - 1;
    if (n !== 1) { console.error("  anchor cocok " + n + "x, harus tepat 1"); process.exit(2); }
    fs.writeFileSync(p, s.replace(old, neu));
  '; then
    echo "SKIP  $name — anchor tidak unik/tidak ada"
    return
  fi
  if npx vitest run "$TEST" >/dev/null 2>&1; then
    echo "LOLOS $name  <-- tes BUTA terhadap mutasi ini"
    survived=$((survived + 1))
  else
    echo "KILLED $name"
    killed=$((killed + 1))
  fi
}

echo "== baterai mutasi: profileProgress =="

# M1: '-' ikut dihitung sebagai terisi → kandidat kosong dapat progres palsu.
run_mutation "M1 kosong literal dianggap terisi" \
  "const EMPTY = new Set(['', '-', 'null', 'undefined', 'n/a', 'na', '0']);" \
  "const EMPTY = new Set(['\u0000never']);"

# M2: persentase dibulatkan salah (selalu 0).
run_mutation "M2 filledPercent selalu 0" \
  "  return Math.round((n / values.length) * 100);" \
  "  return 0;"

# M3: baris tidak ada diperlakukan 100% (kebalikannya).
run_mutation "M3 baris null dianggap 100" \
  "  if (!row) return 0;" \
  "  if (!row) return 100;"

# M4: bio kosong dianggap 100.
run_mutation "M4 bio kosong dianggap 100" \
  "  if (!bio || typeof bio !== 'object') return 0;" \
  "  if (!bio || typeof bio !== 'object') return 100;"

# M5: field tanpa kolom DB dimasukkan ke penilaian → 100 mustahil.
run_mutation "M5 field hantu ttl_ayah masuk penilaian" \
  "  'kotapasport', 'tglpasport', 'exppasport', 'pt',
] as const;" \
  "  'kotapasport', 'tglpasport', 'exppasport', 'pt', 'ttlayah',
] as const;"

# M6: rata-rata diganti jadi penjumlahan.
run_mutation "M6 overall jadi penjumlahan bukan rata-rata" \
  "  return Math.round((mini + master) / 2);" \
  "  return Math.round(mini + master);"

# M7: daftar kosong → NaN (bukan 0).
run_mutation "M7 daftar kosong tidak dijaga" \
  "  if (!values.length) return 0;" \
  "  if (!values.length) return NaN;"

# --- pulihkan -------------------------------------------------------------
cp "$BAK/profileProgress.ts" "$TARGET" 2>/dev/null || true

echo "-------------------------------------------"
echo "KILLED=$killed  LOLOS=$survived  TOTAL=$total"

# Bersihkan backup. Dibungkus try/catch supaya kegagalan hapus TIDAK PERNAH
# bisa menutupi verdict di atas (pernah terjadi: kuota shim membuat skrip
# baterai crash SETELAH mencetak verdict, sehingga exit code menyesatkan).
rm -rf "$BAK" 2>/dev/null || true

if [ "$survived" -gt 0 ]; then
  echo "VERDICT: ADA MUTASI YANG LOLOS — tes perlu diperkuat."
  exit 1
fi
echo "VERDICT: semua mutasi terbunuh."
exit 0
