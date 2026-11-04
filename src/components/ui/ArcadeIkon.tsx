/**
 * ArcadeIkon.tsx — merender satu ikon Genba sebagai SVG sebaris.
 *
 * Kenapa komponen terpisah, bukan `<svg>` yang ditulis di dalam `ArcadeGame`:
 * ada 27 ikon (16 benda + 11 lokasi) dan dua tempat pemakaian; menulis jalur
 * SVG-nya langsung di JSX membuat berkas game itu penuh angka dan sulit dibaca.
 * Data jalurnya ada di `src/lib/arcadeIkon.ts` supaya bisa diuji tanpa render.
 *
 * `aria-hidden` SELALU true: setiap ikon di game ini berdampingan dengan teks
 * (nama benda / nama rak). Membacakan "kotak" dua kali — sekali dari ikon,
 * sekali dari teks — hanya memperpanjang pembaca layar tanpa menambah info.
 */
import { IKON_BARANG, IKON_ZONA } from '../../lib/arcadeIkon';

interface Props {
  /** `barang` atau `zona`. */
  jenis: 'barang' | 'zona';
  /** `id` dari `GENBA_BARANG` / `GENBA_ZONA`. */
  nama: string;
  /** Sisi kotak dalam px. */
  ukuran?: number;
  kelas?: string;
}

export default function ArcadeIkon({ jenis, nama, ukuran = 24, kelas = '' }: Props) {
  const peta = jenis === 'barang' ? IKON_BARANG : IKON_ZONA;
  const jalur = peta[nama];
  /* Id tanpa ikon menghasilkan `null`, BUKAN kotak kosong: elemen kosong dengan
     ukuran tetap membuat kartunya tampak "ada tapi rusak". `arcade-ikon.test.ts`
     menjaga agar keadaan itu tidak pernah terjadi. */
  if (!jalur) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width={ukuran}
      height={ukuran}
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={kelas}
      aria-hidden="true"
      focusable="false"
    >
      {jalur.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
