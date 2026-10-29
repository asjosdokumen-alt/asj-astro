import { h } from "preact";
import { useState, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { authStore } from "../../store/authReactive";
import { t } from "../../store/i18n";
import apiClient from "../../lib/apiClient";
import { getPath, isGood, makeV, fmtMonthYearJp, mergeArrRiwayat, esc, normalizeRiwayatFor, getTingkatVal, sortRiwayatKronologis, riwayatKeyOf } from "../../lib/helpers_cv";
import { golonganDarahDisplay, statusNikahDisplay, HUBUNGAN_KELUARGA } from "../../lib/opsi-form";
import { useOverlay } from "../ui/useOverlay";

interface Props {
  waTarget: string;
  isOpen: boolean;
  onClose: () => void;
  /** Exit window (2026-09-28) — see `useOverlayPresence` + `motion.css` §5b. */
  closing?: boolean;
  /** A10 parity: fallback pas_photo baris kandidat saat uploads.photo master kosong
   *  (legacy renderCVAjaib: master uploads.photo dulu, lalu pasPhoto dari
   *  ALL_CANDIDATES). TabPelamar & CandidateDash meneruskan row.pasPhoto. */
  fotoFallback?: string;
}

// ============================================================================
// SINK-SIDE ESCAPING (playbook §3.2.3)
//
// Semua builder di file ini menghasilkan HTML yang dirender via
// dangerouslySetInnerHTML. Escaping adalah DEFAULT di sink: escHtml /
// escVal me-escape SETIAP nilai yang diinterpolasi, jadi esc() yang lupa di
// satu titik tidak bisa lagi membawa data kandidat (getDrafCvMaster +
// AIDATAJSON) ke DOM sesi admin sebagai markup.
//
// Satu-satunya jalur mentah adalah opt-in bernama, greppable: raw(...).
// raw() HANYA untuk markup internal tepercaya (literal template, chrome
// admin dari sesi, URL foto yang sudah di-esc() + whitelist skema, fragmen
// hasil escHtml). Jangan pernah membungkus nilai kandidat dalam raw().
//
// Perilaku dijaga dua test: RirekishoBuilder.test.tsx (A10 parity — output
// untuk data sah tidak boleh berubah) dan rirekishoEscape.test.ts (payload
// XSS keluar sebagai &lt;img, tidak pernah tag mentah).
// ============================================================================

const RAW_FLAG = new WeakSet<object>();

/** Opt-in eksplisit: markup tepercaya lewat sink tanpa di-escape. */
function raw(s: string): string {
  const marked = new String(s) as unknown as string;
  RAW_FLAG.add(marked as unknown as object);
  return marked;
}

/** Escape satu nilai di sink; fragmen raw() lolos apa adanya. */
function escVal(x: unknown): string {
  if (typeof x === "object" && x !== null && RAW_FLAG.has(x as object)) return String(x);
  return esc(String(x));
}

/** Sink default untuk interpolasi: setiap ${...} di-escape kecuali raw(). */
function escHtml(strings: TemplateStringsArray, ...vals: unknown[]): string {
  let out = "";
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < vals.length) out += escVal(vals[i]);
  }
  // Hasil ditandai raw agar bisa ditenun ke sink lain tanpa esc ganda.
  return raw(out);
}

const CSS = `
.cv-excel{width:100%;border-collapse:collapse;border:1.5px solid black;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;color:black;line-height:1.2}
.cv-excel th,.cv-excel td{border:1px solid black;padding:3.5px 4px;vertical-align:middle}
.bg-amber{background-color:#faeec8!important}.val-center{text-align:center!important}
.val-left{text-align:left!important;padding-left:8px!important}.val-right{text-align:right!important}
.border-r-none{border-right:none!important}.border-l-none{border-left:none!important}
.border-lr-none{border-left:none!important;border-right:none!important}
.col-1{width:13%}.col-2{width:2%}.col-3{width:11%}
.col-4{width:19%}.col-5{width:21%}.col-6{width:18%}.col-7{width:16%}
@media print{@page{size:A4 portrait;margin:6mm}
body *{visibility:hidden!important}
#rirek-modal,#rirek-modal *{visibility:visible!important;color:black!important}
#rirek-modal{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:auto!important;background:white!important;padding:0!important;margin:0!important;overflow:visible!important;display:block!important}
.print:hidden{display:none!important}
*{-webkit-print-color-adjust:exact!important;color-adjust:exact!important}
.cv-excel tr{page-break-inside:avoid}}
`;
const keyOf = {
  pendidikan: (e: Record<string, string>) => riwayatKeyOf('pendidikan', e),
  pekerjaan: (e: Record<string, string>) => riwayatKeyOf('pekerjaan', e),
  keluarga: (e: Record<string, string>) => riwayatKeyOf('keluarga', e),
};
export function buildEduRows(eduList: Record<string, any>[], v: (...keys: string[]) => string) {
  let html = "";
  // KRONOLOGIS (paling lama dulu), seperti 学歴 di rirekisho Jepang.
  //
  // Sampai 2026-10-29 di sini dipakai `sortEdu` — urutan JENJANG (SD → SMA).
  // Untuk data yang konsisten hasilnya sama, tetapi rirekisho membaca TAHUN:
  // kandidat yang masuk SMK setelah SMA, atau D3 setelah S1, tercetak
  // terbalik. Laporan pemilik: "riwayat sekolah gak urut". Tanggal mulai yang
  // sama tetap dipecah per jenjang, supaya dua sekolah satu tahun tidak
  // bertukar tempat secara acak.
  const sorted = sortRiwayatKronologis(eduList || [], {
    tiebreak: (a, b) => getTingkatVal(a.tingkat) - getTingkatVal(b.tingkat),
  });
  for (let i = 1; i <= 5; i++) {
    const p = {...(sorted[i-1]||{})};
    if(!isGood(p.masuk)&&isGood(p.tahun_masuk)) p.masuk=p.tahun_masuk;
    if(!isGood(p.lulus)&&isGood(p.tahun_lulus)) p.lulus=p.tahun_lulus;
    if(!isGood(p.sekolah)&&isGood(p.nama_sekolah)) p.sekolah=p.nama_sekolah;
    if(!isGood(p.jurusan_id)&&isGood(p.jurusan)) p.jurusan_id=p.jurusan;
    const m=isGood(p.masuk)?String(p.masuk):v("PENDIDIKAN"+i+"TAHUNMASUK");
    const l=isGood(p.lulus)?String(p.lulus):v("PENDIDIKAN"+i+"TAHUNLULUS");
    const s=isGood(p.sekolah)?String(p.sekolah):v("PENDIDIKAN"+i+"NAMASEKOLAH","PENDIDIKAN"+i+"SEKOLAHID");
    const sj=isGood(p.sekolah_jp)?String(p.sekolah_jp):v("PENDIDIKAN"+i+"SEKOLAHJP");
    const j=isGood(p.jurusan_id)?String(p.jurusan_id):v("PENDIDIKAN"+i+"JURUSAN","PENDIDIKAN"+i+"JURUSANID");
    const jj=isGood(p.jurusan_jp)?String(p.jurusan_jp):v("PENDIDIKAN"+i+"JURUSANJP");
    [m,l,s,j,sj,jj].forEach((_x,idx,a)=>{if(a[idx]==="-")a[idx]="";});
    if(i>3&&!(s||m||l)) continue;
    const fs=sj?escHtml`${s}<br><span style="font-size:8px;font-weight:normal;">${sj}</span>`:escVal(s);
    const fj=jj?escHtml`${j}<br><span style="font-size:8px;font-weight:normal;">${jj}</span>`:escVal(j);
    html+=escHtml`<tr><td class="val-center border-r-none">${fmtMonthYearJp(m)}</td><td class="val-center border-lr-none">${m||l?"-":""}</td><td class="val-center border-l-none">${fmtMonthYearJp(l)}</td><td colspan="2" class="val-center">${fs}</td><td colspan="2" class="val-center">${fj}</td></tr>`;
  }
  return html;
}
export function buildJobRows(jobList: Record<string, any>[], v: (...keys: string[]) => string) {
  let html = "";
  // KRONOLOGIS (paling lama dulu). Sampai 2026-10-29 fungsi ini TIDAK
  // mengurutkan sama sekali: riwayat kerja tercetak sesuai urutan isi
  // formulir, jadi pekerjaan 2018 bisa muncul di atas pekerjaan 2010 —
  // laporan pemilik "riwayat kerja gak auto urut sesuai tahun dan bulan
  // kerjanya".
  const sorted = sortRiwayatKronologis(jobList || []);
  for (let i = 1; i <= 3; i++) {
    const p = {...(sorted[i-1]||{})};
    if(!isGood(p.masuk)&&isGood(p.tahun_masuk)) p.masuk=p.tahun_masuk;
    if(!isGood(p.keluar)&&isGood(p.tahun_keluar)) p.keluar=p.tahun_keluar;
    if(!isGood(p.perusahaan)&&isGood(p.nama_perusahaan)) p.perusahaan=p.nama_perusahaan;
    const m=isGood(p.masuk)?String(p.masuk):v("PEKERJAAN"+i+"TAHUNMASUK");
    const k=isGood(p.keluar)?String(p.keluar):v("PEKERJAAN"+i+"TAHUNKELUAR");
    const pt=isGood(p.perusahaan)?String(p.perusahaan):v("PEKERJAAN"+i+"NAMAPERUSAHAAN","PEKERJAAN"+i+"PERUSAHAANID");
    const ptj=isGood(p.perusahaan_jp)?String(p.perusahaan_jp):v("PEKERJAAN"+i+"PERUSAHAANJP");
    const ker=isGood(p.jabatan)?String(p.jabatan):v("PEKERJAAN"+i+"JENISKERJA","PEKERJAAN"+i+"POSISI","PEKERJAAN"+i+"JABATANID");
    const kerj=isGood(p.jabatan_jp)?String(p.jabatan_jp):v("PEKERJAAN"+i+"JABATANJP");
    const gaji=isGood(p.gaji)?String(p.gaji):v("PEKERJAAN"+i+"GAJI");
    [m,k,pt,ker,gaji,ptj,kerj].forEach((_x,idx,a)=>{if(a[idx]==="-")a[idx]="";});
    if(i>2&&!(pt||m||k)) continue;
    const kf=(k.toUpperCase().includes("SEKARANG")||k.toUpperCase().includes("IMA"))?"現在に至る":fmtMonthYearJp(k);
    const fpt=ptj?escHtml`${pt}<br><span style="font-size:8px;font-weight:normal;">${ptj}</span>`:escVal(pt);
    const fker=kerj?escHtml`${ker}<br><span style="font-size:8px;font-weight:normal;">${kerj}</span>`:escVal(ker);
    html+=escHtml`<tr><td class="val-center border-r-none">${fmtMonthYearJp(m)}</td><td class="val-center border-lr-none">${m||k?"-":""}</td><td class="val-center border-l-none">${kf}</td><td colspan="2" class="val-center">${fpt}</td><td class="val-center">${fker}</td><td class="val-right pr-1">${gaji?"¥   "+gaji:"¥        -"}</td></tr>`;
  }
  return html;
}

/**
 * Penanda "tidak diisi" yang HARUS hilang sebelum dicetak.
 *
 * `v()` mengembalikan "-" untuk sel kosong, dan CV AI menyimpan "・" (titik
 * tengah) sebagai pengganti hubungan yang tidak dipilih. Keduanya bukan isi:
 * "IBU ・" dan "WIRASWASTA / -" pernah benar-benar tercetak di CV kandidat
 * (laporan pemilik 2026-10-27). Daftar ini sengaja mencakup varian lebar
 * penuh dan tanda pisah, karena datanya datang dari formulir yang berbeda.
 */
const PENANDA_KOSONG = /^[\s・･\-–—－~〜ー]+$/;

function bersihkanNilai(nilai: string): string {
  return PENANDA_KOSONG.test(String(nilai ?? '')) ? '' : String(nilai ?? '').trim();
}

/**
 * Kanji 続柄 dari hubungan Indonesia ("AYAH" → 父).
 *
 * Dipakai HANYA kalau kolom Jepangnya kosong atau berisi penanda. Sumbernya
 * `HUBUNGAN_KELUARGA` di `lib/opsi-form.ts` — daftar yang sama yang dipakai
 * formulir — supaya CV tidak punya kamus sendiri yang bisa menyimpang.
 * Hubungan yang tidak ada di daftar dibiarkan kosong: menebak kanji keluarga
 * kandidat lebih buruk daripada sel kosong.
 */
function kanjiHubungan(hub: string): string {
  const teks = String(hub ?? '').trim();
  if (!teks) return '';
  const bagian = teks.split(/\s+/);

  /* Nilai lama kadang sudah membawa kanjinya sendiri ("AYAH 父親"). Kalau
     sisanya memang huruf Jepang, itulah jawabannya — tidak perlu kamus. */
  if (bagian.length > 1) {
    const sisa = bagian.slice(1).join(' ');
    if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(sisa)) return rapikanKanjiHubungan(sisa);
    /* Sisa berhuruf Latin berarti ini hubungan LAIN ("TETANGGA JAUH"), bukan
       "AYAH" yang kebetulan berawalan sama. Menebak di sini akan mencetak
       kanji yang salah di CV. */
    return '';
  }

  const kunci = (bagian[0] ?? '').toUpperCase();
  if (!kunci) return '';
  for (const [nilai, label] of HUBUNGAN_KELUARGA) {
    if (String(nilai).toUpperCase() !== kunci) continue;
    const m = String(label).match(/[（(]([^）)]+)[）)]/);
    if (m?.[1]) return rapikanKanjiHubungan(m[1]);
  }
  return '';
}

/**
 * 続柄 yang sah di rirekisho Jepang — satu kata, tanpa お/ご dan tanpa さん.
 *
 * KENAPA (laporan pemilik 2026-10-29): "kanji nya ga sesuai kek ayah harus nya
 * chichi saja". Kolom 続柄 di rirekisho berisi 父, bukan 「お父さん」 dan bukan
 * 「AYAH 父」. Nilai Jepang datang dari dua sumber yang sama-sama bisa meleset:
 * AI (sering menulis bentuk sopan お父さん/父さん) dan kandidat sendiri.
 */
const KANJI_HUBUNGAN: Array<[RegExp, string]> = [
  // URUTAN PENTING: yang lebih spesifik lebih dulu. `義父` dan `祖父`
  // mengandung `父`, jadi keduanya HARUS diperiksa sebelum aturan `父`.
  [/曾祖父|ひいおじい/, '曾祖父'],
  [/曾祖母|ひいおばあ/, '曾祖母'],
  [/義父|ぎふ/, '義父'],
  [/義母|ぎぼ/, '義母'],
  [/祖父|おじい(さん|ちゃん)?|grandfather/i, '祖父'],
  [/祖母|おばあ(さん|ちゃん)?|grandmother/i, '祖母'],
  [/父|お父さん|パパ|ちち/i, '父'],
  [/母|お母さん|ママ|はは/i, '母'],
  [/兄|お兄さん|にいさん/i, '兄'],
  [/姉|お姉さん|ねえさん/i, '姉'],
  [/弟|おとうと/i, '弟'],
  [/妹|いもうと/i, '妹'],
  [/夫|旦那|おっと/i, '夫'],
  [/妻|奥さん|つま/i, '妻'],
  [/息子|むすこ/i, '息子'],
  [/娘|むすめ/i, '娘'],
  [/子|お子さん|子供/i, '子'],
  [/伯父|叔父|おじさん/i, '叔父'],
  [/伯母|叔母|おばさん/i, '叔母'],
  [/従兄弟|いとこ/i, '従兄弟'],
  [/甥|おいご/i, '甥'],
  [/姪|めいご/i, '姪'],
];

/**
 * Rapikan nilai 続柄 Jepang menjadi SATU kata baku.
 *
 * Mengembalikan '' kalau tidak ada yang cocok — pemanggil lalu memakai nilai
 * Indonesia apa adanya, bukan kanji karangan.
 */
export function rapikanKanjiHubungan(nilai: string): string {
  const s = String(nilai ?? '').trim();
  if (!s) return '';
  for (const [re, kanji] of KANJI_HUBUNGAN) {
    if (re.test(s)) return kanji;
  }
  return '';
}

export function buildFamRows(famList: Record<string, any>[], v: (...keys: string[]) => string) {
  let html = "";
  for (let i = 1; i <= 6; i++) {
    const p = {...(famList[i-1]||{})};
    if(!isGood(p.umur)&&isGood(p.usia)) p.umur=p.usia;
    const hub=bersihkanNilai(isGood(p.hubungan)?String(p.hubungan):v("KELUARGA"+i+"HUBUNGANID","KELUARGA"+i+"HUBUNGAN"));
    const nm=bersihkanNilai(isGood(p.nama)?String(p.nama):v("KELUARGA"+i+"NAMA"));
    const u=bersihkanNilai(isGood(p.umur)?String(p.umur):v("KELUARGA"+i+"USIA","KELUARGA"+i+"UMUR"));
    const pk=bersihkanNilai(isGood(p.pekerjaan)?String(p.pekerjaan):v("KELUARGA"+i+"PEKERJAANID","KELUARGA"+i+"PEKERJAAN"));
    const g=bersihkanNilai(isGood(p.gaji)?String(p.gaji):v("KELUARGA"+i+"GAJI"));
    const hubj=rapikanKanjiHubungan(
      bersihkanNilai(isGood(p.hubungan_jp)?String(p.hubungan_jp):v("KELUARGA"+i+"HUBUNGANJP")),
    )||kanjiHubungan(hub);
    const pkj=bersihkanNilai(isGood(p.pekerjaan_jp)?String(p.pekerjaan_jp):v("KELUARGA"+i+"PEKERJAANJP"));
    /* Kolom 続柄 berisi KANJI saja. Sampai 2026-10-29 sel ini mencetak
       "AYAH  父" — dua bahasa di satu kolom Jepang, dan pemilik menyebutnya
       sebagai kanji yang tidak sesuai ("ayah harus nya chichi saja").
       Nilai Indonesia hanya dipakai kalau kanjinya memang tidak diketahui;
       sel kosong lebih buruk daripada teks yang bisa dibaca staf. */
    const fh = hubj ? escVal(hubj) : escVal(hub.toUpperCase());
    const fp=pkj?escHtml`${pk}<br><span style="font-size:8px;font-weight:normal;">${pkj}</span>`:escVal(pk);
    html+=escHtml`<tr><td colspan="2" class="val-center">${fh}</td><td colspan="2" class="val-center">${nm.toUpperCase()}</td><td class="val-center">${u?u+"歳":""}</td><td class="val-center">${fp}</td><td class="val-right pr-1">${g?"¥   "+g:"¥        -"}</td></tr>`;
  }
  return html;
}
// Data producer — tanpa sink HTML: mengembalikan nilai MENTAH sesuai kontrak
// (di-pin rirekishoEscape.test.ts); sheet yang meng-escape di sink-nya.
export function buildCvIdentitas(v: (...keys: string[]) => string) {
  const gen = String(v("GENDER","JENISKELAMIN","identitas.gender")).toUpperCase();
  const gStr = (gen.includes("PEREMPUAN")||gen.includes("WANITA")||gen.includes("CEWEK")||gen.includes("女")||gen==="W")?"PEREMPUAN (女)":gen==="-"?"":"LAKI LAKI (男)";
  // 配偶者: ternary lama mengarang jawaban — setiap nilai selain "MENIKAH"
  // polos jatuh ke `BELUM MENIKAH （未婚）`, termasuk `CERAI`, `CERAI MENINGGAL`
  // dan sel KOSONG. `statusNikahDisplay()` memetakan keempat kategori
  // (未婚/既婚/離婚/死別) dan mengembalikan sel kosong bila memang belum diisi;
  // nilai yang tidak dikenal dikembalikan APA ADANYA, tidak pernah dikarang.
  const nStr = statusNikahDisplay(v("STATUSPERNIKAHAN","STATUSNIKAH","PASANGAN","identitas.status_nikah","identitas.status_nikah_id"));
  const jp = String(v("PERNAHKEJEPANG","PENGALAMANJEPANG","STATUSEKSJEPANG","wawancara.riwayat_jepang")).toUpperCase();
  const jStr = (!jp||jp==="-"||jp.includes("BELUM")||jp.includes("TIDAK")||jp==="NO")?(jp==="-"?"":"TIDAK （無）"):"ADA （有）";
  const ps = String(v("PASPOR","PASPORT","identitas.paspor")).toUpperCase();
  const pStr = (ps.includes("YA")||ps.includes("ADA")||ps.length>5)?"ADA （有）":"TIDAK （無）";
  const tg = String(v("TANGANDOMINAN","TANGAN","fisik.tangan_dominan")).toUpperCase();
  const tStr = tg.includes("KIRI")?"KIRI (左)":tg==="-"?"":"KANAN  (右)";
  // 血液型: sufiks `型` menempel pada golongan ABO, jadi varian Rh dipisah —
  // `O+` → `O 型 Rh+`, bukan `O+ 型`. Nilai kosong / '-' menghasilkan sel
  // KOSONG; versi lama selalu menempelkan ` 型` sehingga sel berisi " 型" saja.
  const gd = golonganDarahDisplay(v("GOLONGANDARAH","GOLDAR","identitas.golongan_darah"));
  let nr = v("id_kandidat","IDKANDIDAT","NOMOR","ID");
  if(nr!=="-"){const m=String(nr).match(/(\d{3,})$/);nr=m?"P - "+m[1]:nr;}else{nr="";}
  return {gStr,nStr,jStr,pStr,tStr,gd,nr};
}
export function buildKertasA4(p: Record<string, any>) {
  // ⚠ NAMA KUNCI = kontrak `buildCvIdentitas()`. MEASURED 2026-10-12: di sini
  // dulu tertulis `gS,nS,jS,pS,tS`, sementara produsennya mengembalikan
  // `gStr,nStr,jStr,pStr,tStr` — jadi kelimanya `undefined`, dan
  // `escVal(undefined)` menulis kata "undefined" ke SELURUH CV (JENIS KELAMIN,
  // STATUS PERNIKAHAN, PERNAH KE JEPANG, PASPOR, TANGAN). Diukur atas DB live:
  // 40 dari 40 kandidat nyata. Kalau salah satu nama di bawah diubah, ubah juga
  // yang di `buildCvIdentitas()` — `RirekishoBuilder.test.tsx` menahannya.
  const {v,foto,btn,tgl,wa,gStr,nStr,jStr,pStr,tStr,gd,nr,edu,job,fam} = p;
  // td adalah sink sel ini: nilai polos di-escape; markup tepercaya lewat raw().
  const tr = (cells: string[]) => "<tr>" + cells.map(c => c).join("") + "</tr>";
  const td = (txt: string, cls?: string, span?: number|string) => {let h="<td";if(cls)h+=" class=\""+cls+"\"";if(span)h+=" colspan=\""+span+"\"";return h+">"+escVal(txt)+"</td>";};
  const amber = (txt: string, span?: number|string) => td(txt,"bg-amber val-center",span);
  const center = (txt: string, span?: number|string) => td(txt,"val-center",span);
  const rs11 = (txt: string) => "<td colspan=\"3\" rowspan=\"11\" style=\"padding:0;vertical-align:top;\">"+txt+"</td>";
  let h = raw("<style>"+CSS+"</style>");
  /* `color:black` IS REQUIRED ON THESE THREE, and it is not cosmetic.
     MEASURED 2026-10-01 with a pixel sample: the sheet is `bg-white`, and the
     CV's own stylesheet sets `color:black` only on `.cv-excel` — the table. The
     title block sits OUTSIDE that table, so it inherited the modal's text colour.
     In dark mode (the default) that is `rgb(255,255,255)`: white on white.
     Sampled along the title's baseline, **725 of 730 pixels were pure white** —
     no glyphs rendered at all. The document an admin prints and sends was
     missing its title, in the theme almost everyone uses. */
  h+=raw("<div style=\"color:black;text-align:center;font-weight:bold;font-size:22px;letter-spacing:2px;\">実習生経歴書</div>");
  h+=raw("<div style=\"color:black;text-align:center;font-weight:bold;font-size:18px;margin-bottom:2px;\">" + t("admin.rirekisho_title") + "</div>");
  h+=raw("<div style=\"color:black;text-align:right;font-size:10px;font-style:italic;margin-bottom:2px;\">Ver.2025</div>");
  h+=raw("<table class=\"cv-excel\"><colgroup><col class=\"col-1\"><col class=\"col-2\"><col class=\"col-3\"><col class=\"col-4\"><col class=\"col-5\"><col class=\"col-6\"><col class=\"col-7\"></colgroup>");
  // Row 1: Photo + Nomor + Gender
  h+=btn+tr([rs11(foto),amber(raw("実習生 NOMOR<br>番号")),center(nr),amber(raw("性別&nbsp;&nbsp;&nbsp;JENIS KELAMIN")),center(gStr)]);
  // Row 2: Nama + Usia
  h+=tr([amber(raw("名前&nbsp;&nbsp;&nbsp;NAMA"),2),amber(raw("年齢&nbsp;&nbsp;&nbsp;USIA")),center(String(v("USIA","UMUR","identitas.umur").replace(/\D/g,""))+" 歳")]);
  // Row 3: Nama Lengkap + Tinggi
  h+=tr([td(escHtml`<i>${v("NAMALENGKAP","NAMA","identitas.nama_lengkap")}</i>`,"val-center uppercase",2),amber(raw("身長&nbsp;&nbsp;&nbsp;TINGGI BADAN")),center(String(v("TB","TINGGI","fisik.tb").replace(/\D/g,""))+" CM")]);
  // Row 4: Furigana + Berat
  h+=tr([td(escHtml`<i>${v("FURIGANA","KATAKANA","NAMAKATAKANA","identitas.katakana")}</i>`,"val-center",2),amber(raw("体重&nbsp;&nbsp;&nbsp;BERAT BADAN")),center(String(v("BB","BERAT","fisik.bb").replace(/\D/g,""))+" KG")]);
  // Row 5: Panggilan + Goldar
  h+=tr([amber(raw("NAMA PANGGILAN<br>ニックネーム")),td(escHtml`<i>${v("NAMAPANGGILAN","PANGGILAN","PANGGILANID","identitas.panggilan")}<br>${v("PANGGILANKATAKANA","KATAKANAPANGGILAN","PANGGILANJP","identitas.panggilan_katakana")}</i>`,"val-center leading-tight"),amber(raw("血液型&nbsp;&nbsp;&nbsp;GOLONGAN DARAH")),center(gd)]);
  // Row 6: Tgl Lahir + Status Nikah
  h+=tr([amber(raw("生年月日&nbsp;&nbsp;&nbsp;TANGGAL LAHIR"),2),amber(raw("配偶者&nbsp;&nbsp;&nbsp;STATUS PERNIKAHAN")),center(nStr)]);
  // Row 7: Tgl + Agama
  h+=tr([center(escHtml`<i>${tgl}</i>`,2),amber(raw("宗教&nbsp;&nbsp;&nbsp;AGAMA")),center(v("AGAMA","AGAMAID","AGAMAJP","identitas.agama"))]);
  // Row 8: Tempat Lahir + Pernah ke JP
  h+=tr([amber(raw("出身地&nbsp;&nbsp;&nbsp;TEMPAT LAHIR"),2),amber(raw("来日経験&nbsp;&nbsp;&nbsp;PERNAH KE JEPANG")),center(jStr)]);
  // Row 9: Tempat Lahir JP + Paspor
  h+=tr([td(escHtml`<i>${v("TEMPATLAHIR","TEMPATLAHIRID","identitas.tempat_lahir_id","identitas.tempat_lahir")}</i>`,"val-center uppercase",2),amber(raw("パスポート番号<br>PERNAH MEMILIKI PASPOR")),center(pStr)]);
  // Row 10: Tempat Lahir JP transliteration + Tangan
  h+=tr([td(escHtml`<i>${v("TEMPATLAHIRJP","identitas.tempat_lahir_jp")==="-"?"":v("TEMPATLAHIRJP","identitas.tempat_lahir_jp")}</i>`,"val-center",2),amber(raw("利き手&nbsp;&nbsp;&nbsp;TANGAN AHLI")),center(tStr)]);
  // Row 11: No HP + Riwayat Penyakit
  h+=tr([amber(raw("携帯電話番号&nbsp;&nbsp;&nbsp;NO HP")),center("+"+wa.replace(/\D/g,"")),amber(raw("病歴の有無&nbsp;RIWAYAT PENYAKIT<br>(KERAS, LUKA DLL)")),center(v("RIWAYATPENYAKIT","RIWAYATPENYAKITID","RIWAYATMEDISID","medis.riwayat_medis_id")==="-"?raw("TIDAK (無)"):v("RIWAYATPENYAKIT","RIWAYATPENYAKITID","RIWAYATMEDISID","medis.riwayat_medis_id"))]);
  // Alamat
  h+=tr([td(raw("通信欄 ALAMAT RUMAH"),"bg-amber val-center",7)]);
  h+=tr([td(v("ALAMATLENGKAP","ALAMAT","ALAMATID","identitas.alamat_id","identitas.alamat"),"val-center uppercase font-normal",7)]);
  h+=tr([td(escHtml`<i>${v("ALAMATJP","identitas.alamatjp","identitas.alamat_jp")==="-"?"":v("ALAMATJP","identitas.alamatjp","identitas.alamat_jp")}</i>`,"val-center font-normal",7)]);
  // Pendidikan
  h+=tr([td(raw("学歴 PENDIDIKAN"),"bg-amber val-center",7)]);
  h+=tr([amber(raw("期間 TAHUN"),3),amber(raw("学校名 NAMA SEKOLAH"),2),amber(raw("専攻 JURUSAN"),2)]);
  h+=edu;
  // Pengalaman Kerja
  h+=tr([td(raw("職歴 PENGALAMAN KERJA "),"bg-amber val-center",7)]);
  h+=tr([amber(raw("期間 TAHUN"),3),amber(raw("会社名 NAMA PERUSAHAAN"),2),amber(raw("職種 JENIS KERJA")),amber(raw("月収/円 GAJI"))]);
  h+=job;
  // Keluarga
  h+=tr([td(raw("家族構成 SUSUNAN KELUARGA KANDUNG "),"bg-amber val-center",7)]);
  h+=tr([amber(raw("続柄 HUBUNGAN KELUARGA"),2),amber(raw("名前 NAMA ANGGOTA KELUARGA"),2),amber(raw("年齢 USIA")),amber(raw("職業 PEKERJAAN")),amber(raw("月収/円 GAJI"))]);
  h+=fam;
  h+=tr([td(raw("個人情報 INFORMASI PERSONAL "),"bg-amber val-center",7)]);
  h+=tr([amber(raw("日本へ行く目的&nbsp;&nbsp;&nbsp;TUJUAN KE<br>JEPANG"),3),td(escHtml`${v("wawancara.tujuan_ke_jepang_jp","TUJUANKEJEPANGJP","MOTIVASIKEJEPANGJP","MOTIVASIJP","wawancara.motivasi_jp")}<br>${v("wawancara.tujuan_ke_jepang","TUJUANKEJEPANG","MOTIVASIKEJEPANG","MOTIVASIID","wawancara.motivasi_id")}`,"val-center font-normal",4)]);
  h+=tr([amber(raw("帰国後の目標<br>SETELAH PULANG DARI JEPANG"),3),td(escHtml`${v("wawancara.rencana_pulang_jp","RENCANAPULANGJP")}<br>${v("wawancara.rencana_pulang_id","RENCANAPULANGID","RENCANASETELAHPULANG")}`,"val-center font-normal",4)]);
  h+=tr([amber(raw("長所&nbsp;&nbsp;&nbsp;KELEBIHAN"),3),td(escHtml`${v("KELEBIHANJP","wawancara.kelebihan_jp")}<br>${v("KELEBIHAN","KELEBIHANID","wawancara.kelebihan_id")}`,"val-center font-normal",4)]);
  h+=tr([amber(raw("短所&nbsp;&nbsp;&nbsp;KEKURANGAN"),3),td(escHtml`${v("KEKURANGANJP","wawancara.kekurangan_jp")}<br>${v("KEKURANGAN","KEKURANGANID","wawancara.kekurangan_id")}`,"val-center font-normal",4)]);
  h+=tr([amber(raw("趣味&nbsp;&nbsp;&nbsp;HOBI"),3),td(escHtml`${v("HOBIJP","wawancara.hobi_jp")}<br>${v("HOBI","HOBIID","wawancara.hobi_id")}`,"val-center font-normal",4)]);
  h+=tr([td(raw("資格・免許 SERTIFIKAT YANG DIMILIKI"),"bg-amber val-center",7)]);
  h+=tr([amber(raw("日本語能力試験<br>JLPT/ SETARA"),2),center(v("sertifikasi.bahasa_jepang","sertifikasi.nilai","JLPT","JFT","JFTTEXT","BAHASAJEPANG")==="-"?raw("TIDAK (無)"):v("sertifikasi.bahasa_jepang","sertifikasi.nilai","JLPT","JFT","JFTTEXT","BAHASAJEPANG")),amber(raw("運転免許&nbsp;&nbsp;&nbsp;SURAT IZIN<br>MENGEMUDI (SIM A)")),center(v("identitas.sim","SIM")==="-"?raw("TIDAK (無)"):v("identitas.sim","SIM")),amber(raw("他&nbsp;&nbsp;&nbsp;LAIN - LAIN")),center(v("sertifikasi.lisensi","SSW","SSWTEXT","LISENSI")==="-"?raw("-"):v("sertifikasi.lisensi","SSW","SSWTEXT","LISENSI"))]);
  h+=tr([td(raw("在日親戚・知人 KERABAT / KENALAN DI JEPANG"),"bg-amber val-center",7)]);
  h+=tr([amber(raw("名前 NAMA"),2),amber(raw("関係 HUBUNGAN")),amber(raw("職業 PEKERJAAN")),amber(raw("年齢 USIA")),amber(raw("日本の住所 ALAMAT DI JEPANG"),2)]);
  // Kenalan (else-branch): OLD meng-escape SATU KESATUAN "id<br>jp" — literal
  // <br> ikut ter-escape (quirk dipertahankan demi byte-identity; td = sink).
  h+=tr([td(v("kenalan_jepang.nama_jp","KENALANNAMAJP")==="-"?raw("無側"):v("kenalan_jepang.nama_id","KENALANNAMAID","KENALANDIJEPANGNAMA")+"<br>"+v("kenalan_jepang.nama_jp","KENALANNAMAJP"),"val-center font-normal",2),td(v("kenalan_jepang.hubungan_jp","KENALANHUBJP")==="-"?v("kenalan_jepang.hubungan_id","KENALANHUBID","KENALANDIJEPANGHUBUNGAN"):v("kenalan_jepang.hubungan_id","KENALANHUBID","KENALANDIJEPANGHUBUNGAN")+"<br>"+v("kenalan_jepang.hubungan_jp","KENALANHUBJP"),"val-center font-normal"),td(v("kenalan_jepang.pekerjaan_jp","KENALANKERJAJP")==="-"?v("kenalan_jepang.pekerjaan_id","KENALANKERJAID","KENALANDIJEPANGPEKERJAAN"):v("kenalan_jepang.pekerjaan_id","KENALANKERJAID","KENALANDIJEPANGPEKERJAAN")+"<br>"+v("kenalan_jepang.pekerjaan_jp","KENALANKERJAJP"),"val-center font-normal"),td(v("kenalan_jepang.usia","KENALANUSIA","KENALANDIJEPANGUSIA")==="-"?raw(""):v("kenalan_jepang.usia","KENALANUSIA","KENALANDIJEPANGUSIA"),"val-center font-normal"),td(v("kenalan_jepang.alamat_jp","KENALANALAMATJP")==="-"?v("kenalan_jepang.alamat_id","KENALANALAMATID","KENALANDIJEPANGALAMAT"):v("kenalan_jepang.alamat_id","KENALANALAMATID","KENALANDIJEPANGALAMAT")+"<br>"+v("kenalan_jepang.alamat_jp","KENALANALAMATJP"),"val-center font-normal",2)]);
  h+=tr([amber(raw("付記&nbsp;&nbsp;&nbsp;CATATAN TAMBAHAN"),3),td(v("CATATANTAMBAHAN","CATATAN")==="-"?raw(""):v("CATATANTAMBAHAN","CATATAN"),"val-left font-normal",4)]);
  h+=raw("</table>");
  return h;
}
/* ── Kerangka A4 selama `getDrafCvMaster` berjalan ────────────────────────────
   Sebelum 2026-10-01 keadaan ini HANYA teks: `text-center py-20` + "Memuat...".
   Panel 794x855 terbuka sebagai halaman putih KOSONG, lalu seluruh lembar muncul
   sekaligus — pola yang persis sama dengan spinner dashboard yang diganti
   `CandidateSkeleton`, dan alasan yang sama: skeleton memberi tahu BENTUK
   sebelum isinya ada.

   ⚠ Warna di sini BUKAN token tema, dan itu disengaja. Lembar CV selalu putih
   (panelnya `bg-white`) di KEDUA tema, karena ia dokumen cetak. `bg-line-strong`
   akan menghasilkan balok gelap di atas kertas putih pada tema gelap. Karena itu
   palet tetap `slate-*` yang dipakai, alasannya sama dengan banner `<noscript>`
   di enam rute aplikasi (lihat `src/pages/candidate.astro`): token tema tidak
   bisa dipakai di permukaan yang warnanya memang tidak ikut tema.

   ⚠ TIDAK ADA heading di sini. `e2e/test-headings.mjs` menuntut tepat satu `h1`
   per halaman, dan panel ini sudah dinamai lewat `useOverlay({ label })`. */
function rirekishoSkeleton(){
  const bar=(c:string)=>h("div",{class:`bg-slate-200 rounded ${c}`});
  return h("div",{"aria-hidden":"true"},
    bar("h-9 w-56 rounded-lg mb-4"),
    h("div",{class:"flex flex-col sm:flex-row gap-4 mb-5"},
      bar("w-32 h-48 rounded-lg shrink-0"),
      h("div",{class:"flex-1 space-y-3"},
        bar("h-6 w-2/3"),
        bar("h-4 w-1/2"),
        bar("h-4 w-3/4"),
        bar("h-4 w-1/3"),
      ),
    ),
    h("div",{class:"space-y-2"},...Array.from({length:8},()=>bar("h-5 w-full"))),
    bar("h-16 w-full mt-5"),
  );
}

export default function RirekishoBuilder({waTarget,isOpen,onClose,fotoFallback,closing=false}:Props) {
  const u = useStore(authStore) as {isLoggedIn?:boolean;role?:string};
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [html,setHtml] = useState("");
  const isAdmin = u.role==="admin";

  // §3.2#6 — `#rirek-modal` carried `.u-modal-shell` with no hook behind it, so
  // the A4 preview was a dialog with no role, no name, no Tab trap and no
  // Escape; the backdrop close was hand-rolled below. The sheet has no
  // <h1>-<h6> (its title is a styled <div> inside the generated HTML), so the
  // name has to come from `label` — the hook cannot derive it from a heading.
  const { containerRef, onBackdropClick } = useOverlay({ open: isOpen || closing, onClose, closing, label: t("admin.rirekisho_title") });

  useEffect(() => {
    if(!isOpen||!waTarget) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError("");
      try {
        const d = await apiClient.call<Record<string, any>>("getDrafCvMaster",[waTarget]);
        if(cancelled) return;
        if(!d||d.error) { setError(d?.error||t("ui.toast_master_incomplete")); return; }
        let ai={}; try{if(d.AIDATAJSON&&d.AIDATAJSON!=="-")ai=JSON.parse(d.AIDATAJSON);}catch{}
        const v = makeV(d,ai);
        // Normalisasi kunci SEKALI di titik gabung (parity legacy
        // 10_cv_rirekisho getArr): isi CV AI memakai sekolah_id/perusahaan_id/
        // jabatan_id sementara builder membaca bentuk kanonikal — tanpa wrapper
        // bertipe ini, entri AI tampil tanpa nama sekolah/perusahaan/jabatan.
        const getArr = (key: string) => mergeArrRiwayat(getPath(d,key),getPath(ai,key),(keyOf as any)[key],normalizeRiwayatFor(key));
        const edu=getArr("pendidikan"),job=getArr("pekerjaan"),fam=getArr("keluarga");
        const tglAsli=v("TGLLAHIR","TANGGALLAHIR","identitas.tgl_lahir");let tglFmt="-";
        if(tglAsli!=="-"){const dt=new Date(tglAsli);if(!isNaN(dt.getTime()))tglFmt=dt.getFullYear()+"年"+String(dt.getMonth()+1).padStart(2,"0")+"月"+String(dt.getDate()).padStart(2,"0")+"日";else tglFmt=tglAsli;}
        const photo = (d.uploads && d.uploads.photo) || fotoFallback || "";
        // S4 fix: URL foto di-escape + divalidasi skema (https only) SEBELUM
        // dibangun jadi <img>. Fragment foto ini trusted-by-construction —
        // satu-satunya bagian dari kandidat (URL) sudah lewat esc() + whitelist.
        const safePhoto = photo && /^https:\/\/[^\s"'<>]+$/.test(photo) ? esc(photo) : '';
        const foto = safePhoto ? "<img src=\""+safePhoto+"\" style=\"width:100%;height:100%;min-height:195px;object-fit:cover;object-position:top center;display:block;\">" : "<div style=\"width:100%;min-height:195px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#6b7280;\">" + t("admin.foto") + "</div>";
        const btn = isAdmin ? "<div class=\"flex flex-wrap items-center gap-2 mb-3 print:hidden z-50 relative\"><button onclick=\"window.print()\" class=\"min-h-11 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center font-sans text-sm transition-transform hover:scale-105 border border-emerald-500\"><svg class=\"asj-icon mr-2\" width=\"1em\" height=\"1em\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><use href=\"/icons/sprite.svg#fas-print\"/></svg> "+t("admin.print_rirekisho")+"</button><button onclick=\"window.print()\" class=\"min-h-11 px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-lg flex items-center font-sans text-sm transition-transform hover:scale-105 border border-sky-500\"><svg class=\"asj-icon mr-2\" width=\"1em\" height=\"1em\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><use href=\"/icons/sprite.svg#fas-file-pdf\"/></svg> "+t("admin.save_pdf")+"</button></div>" : "<div class=\"text-center mb-3 print:hidden z-50 relative\"><span class=\"inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/80 text-slate-300 text-[11px] font-bold rounded-full border border-slate-500/50\"><svg class=\"asj-icon mr-1\" width=\"1em\" height=\"1em\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\"><use href=\"/icons/sprite.svg#fas-eye\"/></svg> "+t("admin.preview_mode_admin_only")+"</span></div>";
        const id = buildCvIdentitas(v);
        const rendered = buildKertasA4({v,foto,btn,tgl:tglFmt,wa:waTarget,...id,edu:buildEduRows(edu,v),job:buildJobRows(job,v),fam:buildFamRows(fam,v)});
        if(!cancelled) setHtml(rendered);
      } catch { if(!cancelled) setError(t("ui.toast_server_conn_failed")); }
      finally { if(!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled=true; };
  },[isOpen,waTarget]);

  if(!isOpen&&!closing) return null;
  return h("div",{ref:containerRef,id:"rirek-modal",class:"fixed inset-0 u-modal-shell z-[200] bg-black/80 flex items-center justify-center p-4 u-scroll-area",onClick:onBackdropClick},
    h("div",{class:"bg-white rounded-xl max-w-[210mm] w-full max-h-[95vh] u-scroll-area p-6 relative"},
      h("button",{"type":"button","aria-label":t("public.close"),onClick:onClose,class:"min-w-11 min-h-11 inline-flex items-center justify-center absolute top-3 right-3 z-50 text-slate-500 hover:text-red-500 text-2xl print:hidden"},"×"),
      loading&&h("div",{role:"status"},h("span",{class:"sr-only"},t("ui.loading")),rirekishoSkeleton()),
      error&&h("div",{class:"text-center py-20 text-red-500"},error),
      !loading&&!error&&h("div",{class:"rirek-a4",dangerouslySetInnerHTML:{__html:html}}),
    ),
  );
}
