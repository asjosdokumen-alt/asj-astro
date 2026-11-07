/**
 * TabMail.tsx — Admin mail inbox tab
 * Source: legacy/index.html page-admin → admin-mail
 *
 * DUA DAFTAR, bukan tujuh filter untuk semua:
 *   LAMARAN → MENUNGGU · UPDATE · REVIEW · DISETUJUI · GAGAL · SEMUA
 *   BIODATA → INFO · GAGAL · SEMUA
 *
 * `LULUS` tidak lagi ada di sini: artinya tinggal TAHAPAN seleksi, dan itu
 * diubah admin lewat form kandidat — bukan dari kotak masuk Mail (keputusan
 * pemilik 2026-10-29).
 */
import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import {
  mailFilterStatus, mailSearchText, mailList,
  setMailFilterStatus, setMailSearchText, fetchMailFromAPI,
} from '../../store/adminStore';
import { t, langStore } from '../../store/i18n';
import { showToast } from '../Toast';
import Icon from '../ui/Icon';
import { useOverlayPresence } from '../ui/useOverlayPresence';
import api from '../../lib/apiClient';
import RejectMailModal from './RejectMailModal';

/**
 * DUA JENIS BARIS, DUA DAFTAR.
 *
 * `database_asj_form` menyimpan dua hal yang berbeda di satu tabel:
 *   • LAMARAN  — `code_job` terisi; punya keputusan (Setujui/Review/Tolak).
 *   • BIODATA  — `code_job` KOSONG; hanya perlu ditandai terbaca.
 *
 * Sebelum ini keduanya tampil di satu tabel dengan tujuh chip yang sama, dan
 * chip `MENUNGGU`/`REVIEW`/`DISETUJUI`/`GAGAL` praktis tidak pernah berlaku
 * untuk baris biodata — sementara baris biodata mengisi hampir seluruh daftar.
 * Keluhan pemilik: "binggung banyak tap nya".
 *
 * ⚠ `isLamaran` membaca KODE, bukan STATUS. Dulu aksi per baris dipilih lewat
 * `isInfoRow(status)`, sehingga baris DOKUMEN yang ditolak (status GAGAL)
 * menampilkan tombol Setujui — dan server menolaknya dengan "Baris
 * biodata/dokumen tidak perlu disetujui". Jenis baris ditentukan sekali oleh
 * `code_job`, bukan oleh status yang bisa berubah.
 */
type Jenis = 'lamaran' | 'biodata';

/** Keranjang yang masuk akal untuk tiap daftar — bukan tujuh untuk keduanya. */
const BUCKETS: Record<Jenis, readonly string[]> = {
  lamaran: ['MENUNGGU', 'UPDATE', 'REVIEW', 'DISETUJUI', 'GAGAL', 'SEMUA'],
  biodata: ['INFO', 'GAGAL', 'SEMUA'],
};

/** Keranjang default saat daftar dibuka: yang paling mungkin berisi pekerjaan. */
const BUCKET_DEFAULT: Record<Jenis, string> = { lamaran: 'MENUNGGU', biodata: 'INFO' };

/**
 * Baris LAMARAN = punya kode loker. `mapForm` memetakan `code` dari `code_job`,
 * jadi baris biodata bernilai KOSONG di produksi. Sentinel `BIODATA` pernah
 * dipakai sebagai label tampilan (dan masih dipakai fixture tes), jadi ia
 * dikecualikan juga — kalau tidak, baris biodata akan masuk daftar lamaran.
 */
function isLamaran(m: { code?: unknown }): boolean {
  const kode = String(m.code || '').trim().toUpperCase();
  return kode !== '' && kode !== 'BIODATA';
}

/**
 * Label tiap keranjang, sebagai peta — bukan rantai ternary. Rantai sepuluh
 * cabang adalah tempat di mana status baru lupa ditambahkan.
 *
 * `DISETUJUI` memakai `status.pass`, yang isinya sudah "Disetujui". Nilai
 * `LULUS` sengaja TIDAK dipakai lagi di Mail: keputusan pemilik 2026-10-29 —
 * "lulus hanya untuk admin mengganti tahapan, untuk update dokumen ganti saja
 * di setujui admin".
 */
const STATUS_LABEL_KEY: Record<string, string> = {
  MENUNGGU: 'status.waiting',
  UPDATE: 'status.updated',
  REVIEW: 'status.review',
  DISETUJUI: 'status.pass',
  GAGAL: 'status.fail',
  INFO: 'status.info',
  SEMUA: 'status.all',
};

/**
 * Status mentah → keranjang yang dikenal UI.
 *
 * `handleReviewForm` dulu menulis `REVIEW ADMIN` (dengan spasi), sementara
 * keranjangnya bernama `REVIEW`. Perbandingan `===` membuat baris yang SEDANG
 * DITINJAU tidak cocok dengan satu pun filter — hanya terlihat kalau admin
 * menebak menekan SEMUA — dan hitungan "Review" selalu 0. Kelas bug yang sama
 * dengan baris UPDATE pada 2026-10-22: notifikasinya datang, barisnya tidak ada.
 *
 * `DIBACA` sengaja masuk keranjang `INFO`: yang membedakan hanya "sudah dilihat",
 * dan itu ditampilkan di badge barisnya. Memberinya keranjang sendiri akan
 * menambah satu tombol filter untuk informasi yang sama.
 *
 * Di module scope, bukan di badan komponen: `filtered` memakainya SEBELUM titik
 * definisi kalau ia ditaruh di sana (`const` tidak di-hoist).
 *
 * Normalisasi harus ada di UI, bukan hanya di server, karena baris lama di
 * database masih menyimpan `REVIEW ADMIN` dan tidak berubah kalau penulisnya
 * diperbaiki.
 */
function bucketOf(raw: unknown): string {
  const s = String(raw || '').toUpperCase();
  if (s.startsWith('REVIEW')) return 'REVIEW';
  if (s === 'DIBACA') return 'INFO';
  return s;
}

/**
 * Label badge status.
 *
 * Biodata memakai status MENTAH: `bucketOf` melipat `DIBACA` menjadi `INFO`,
 * sehingga "sudah dilihat" dan "belum dilihat" tampil identik — padahal itulah
 * satu-satunya hal yang membedakan dua baris biodata. Lamaran tetap memakai
 * `bucketOf` untuk menormalkan `REVIEW ADMIN` lama.
 */
function labelStatus(raw: unknown, jenis: Jenis): string {
  const s = String(raw || '').toUpperCase();
  return jenis === 'biodata' ? s : bucketOf(raw);
}

const STATUS_COLORS: Record<string, string> = {
  MENUNGGU: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
  REVIEW: 'bg-sky-500/20 text-sky-400 border-sky-500/40',
  UPDATE: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  DISETUJUI: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  GAGAL: 'bg-red-500/20 text-red-400 border-red-500/40',
  INFO: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  DIBACA: 'bg-slate-600/20 text-slate-400 border-slate-600/40',
};

export default function TabMail() {
  const _lang = useStore(langStore);
  const filterStatus = useStore(mailFilterStatus);
  const searchText = useStore(mailSearchText);
  const mail = useStore(mailList);
  /* Daftar mana yang sedang dibuka. State lokal, bukan store: pilihan ini
     adalah sudut pandang sesi, bukan preferensi yang perlu bertahan setelah
     admin menutup panel. */
  const [jenis, setJenis] = useState<Jenis>('lamaran');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /**
   * Baris yang sedang ditolak (#12). `null` = modal tertutup.
   * Menyimpan seluruh baris, bukan cuma satu nilai, supaya judul modal bisa
   * menyebut nama kandidat — admin perlu yakin barisnya benar sebelum menolak.
   *
   * 🔴 `rowIndex`, BUKAN `id`. Backend mail bekerja dengan **posisi baris**
   * (`findFormByIndexFiltered` = `order=timestamp.desc&limit=1&offset=<idx>`),
   * bukan primary key. Field `rowIndex` di payload `mapForm(row, i)` memang ada
   * untuk dikirim balik. Mengirim `id` (mis. 144) membuatnya dibaca sebagai
   * `offset=144` ⇒ baris yang di-approve bisa kandidat LAIN. Lihat
   * `docs/PHASE_D_DATA_LAYER.md` §4.
   */
  const [rejectTarget, setRejectTarget] = useState<null | { rowIndex: unknown; nama?: string }>(null);
  /* Exit window (2026-09-28) — see `useOverlayPresence`. The render reads
     `rejectTarget.nama`, so the HELD value is what gets passed down. */
  const rejectTargetP = useOverlayPresence(rejectTarget);

  /* Mount memakai cache bersama (`store/adminData`) — lihat catatan di
     `fetchMailFromAPI`. Paksa hanya saat data memang berubah. */
  useEffect(() => { fetchMailFromAPI(); }, []);

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filtered.length && filtered.length > 0
        ? new Set()
        : new Set(filtered.map((m) => String(m.id ?? m.wa ?? m.nama ?? '')))
    );
  };

  const toggleOne = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // `rowIndex` — posisi baris di daftar PENUH (urutan `timestamp.desc`), bukan
  // `id`. Lihat catatan di `rejectTarget` di atas.
  const act = async (action: string, rowIndex: unknown, okMsg: string) => {
    try {
      const d: any = await api.secure(action, [rowIndex]);
      if (d && d.success) {
        showToast(okMsg, 'success');
        fetchMailFromAPI(true);
      } else {
        showToast(String(d?.error || d?.message || 'Gagal'), 'error');
      }
    } catch (e) {
      showToast('Error: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };

  /**
   * Hapus massal lamaran terpilih (#15).
   *
   * Baris dikirim sebagai **`rowIndex`** — posisi di daftar PENUH
   * (`order=timestamp.desc`), sama persis dengan yang dibaca backend
   * (`findFormByIndexFiltered`). ⚠ Sebelumnya dikirim posisi di daftar
   * `filtered`: begitu ada filter status/pencarian aktif, index itu bergeser
   * dan yang terhapus baris lain. `rowIndex` tidak bergeser saat difilter,
   * jadi satu nilai benar untuk semua keadaan.
   *
   * Backend menyelesaikan semua index → id lebih dulu, jadi mengirim daftar
   * ini aman — pergeseran index saat penghapusan ditangani di sana.
   *
   * Konfirmasi menyebut jumlah + menegaskan data kandidat TIDAK ikut terhapus,
   * persis teks legacy (`hapusFormMailTerpilih`).
   */
  const deleteSelected = async () => {
    if (selected.size === 0) {
      showToast(t('ui.select_mail_first'), 'error');
      return;
    }
    const idxs: number[] = [];
    filtered.forEach((m) => {
      if (!selected.has(String(m.id ?? m.wa ?? m.nama ?? ''))) return;
      const ri = Number(m.rowIndex);
      if (Number.isInteger(ri) && ri >= 0) idxs.push(ri);
    });
    if (idxs.length === 0) {
      showToast(t('ui.select_mail_first'), 'error');
      return;
    }
    if (!window.confirm(t('ui.confirm_delete_mail_selected').replace('{n}', String(idxs.length)))) return;
    try {
      const d: any = await api.secure('hapusFormTerpilih', [idxs]);
      if (d && d.success) {
        showToast(t('ui.toast_mail_deleted_n').replace('{n}', String(d.deleted ?? idxs.length)), 'success');
        setSelected(new Set());
        await fetchMailFromAPI(true);
      } else {
        showToast(String(d?.error || t('ui.toast_error_prefix')), 'error');
        await fetchMailFromAPI(true);
      }
    } catch (e) {
      showToast(t('ui.toast_error_prefix') + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };

  /**
   * Kirim penolakan beserta alasan yang ditulis admin (#12).
   *
   * Sebelum ini alasan **hardcoded** `'Lamaran GAGAL'`, padahal backend sudah
   * menerimanya sebagai argumen ke-3 (`handleRejectForm`) dan UI legacy
   * menjanjikan teks itu muncul di Dashboard Kandidat. Alasan kosong sengaja
   * dibiarkan lewat apa adanya — backend memilih default sesuai jenis baris
   * ('Lamaran ditolak' untuk lamaran, 'Berkas perlu diperbaiki' untuk dokumen).
   */
  const confirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    const { rowIndex, nama } = rejectTarget;
    try {
      const d: any = await api.secure('rejectForm', [rowIndex, '', reason]);
      if (d && d.success) {
        showToast(t('ui.toast_rejected_n').replace('{n}', String(nama || '')), 'success');
        setRejectTarget(null);
        await fetchMailFromAPI(true);
      } else {
        showToast(String(d?.error || d?.message || 'Gagal'), 'error');
      }
    } catch (e) {
      showToast('Error: ' + (e instanceof Error ? e.message : String(e)), 'error');
    }
  };

  /* Filter yang berlaku untuk daftar ini. Kalau store menyimpan keranjang yang
     tidak ada di daftar ini (mis. `MENUNGGU` saat pindah ke Biodata), jangan
     diam-diam menampilkan daftar kosong: jatuh ke keranjang default daftar itu
     sampai admin memilih chip lain. */
  const buckets = BUCKETS[jenis];
  const filterAktif = buckets.includes(filterStatus) ? filterStatus : BUCKET_DEFAULT[jenis];

  const gantiJenis = (j: Jenis) => {
    if (j === jenis) return;
    setJenis(j);
    setSelected(new Set());
    setMailFilterStatus(BUCKET_DEFAULT[j]);
  };

  const filtered = mail.filter((m) => {
    if (isLamaran(m) !== (jenis === 'lamaran')) return false;
    const matchStatus = filterAktif === 'SEMUA' || bucketOf(m.status) === filterAktif;
    const matchSearch = !searchText ||
      (m.nama || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (m.wa || '').includes(searchText) ||
      (m.code || '').toLowerCase().includes(searchText.toLowerCase());
    return matchStatus && matchSearch;
  });

  /* Jumlah per keranjang, dihitung di dalam daftar yang sedang dibuka — angka
     yang mencampur dua daftar akan menjanjikan baris yang tidak ada di layar. */
  const jumlahKeranjang = (b: string): number => {
    const sejenis = mail.filter((m) => isLamaran(m) === (jenis === 'lamaran'));
    return b === 'SEMUA' ? sejenis.length : sejenis.filter((m) => bucketOf(m.status) === b).length;
  };
  const jumlahLamaran = mail.filter((m) => isLamaran(m)).length;
  const jumlahBiodata = mail.length - jumlahLamaran;

  return (
    <div class="bg-slate-900 rounded-xl border border-sky-900/50 p-4 u-scroll-x">
      {/* Header */}
      <div class="flex flex-wrap justify-between items-center gap-3 border-b border-sky-900/50 pb-4 mb-4">
        <h2 class="text-sky-400 font-bold text-lg"><Icon name="envelope" class="mr-2" /> {t('admin.mail_inbox')}</h2>
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" value={searchText}
            onInput={(e) => setMailSearchText((e.target as HTMLInputElement).value)}
            placeholder={t("admin.search_mail")}
            class="min-h-11 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:border-sky-500 outline-none w-52" />

          {/* DAFTAR MANA: Lamaran (punya keputusan) atau Biodata (cukup ditandai).
              Netral (slate) untuk pilihan daftar, biru untuk keranjang di
              bawahnya — supaya dua tingkat pilihan itu tidak tertukar. */}
          <fieldset class="flex rounded-lg border border-slate-700 overflow-hidden m-0 p-0 min-w-0">
            <legend class="sr-only">{t('admin.mail_kind')}</legend>
            {(['lamaran', 'biodata'] as const).map((j) => {
              const aktif = jenis === j;
              const n = j === 'lamaran' ? jumlahLamaran : jumlahBiodata;
              return (
                <button type="button" key={j} onClick={() => gantiJenis(j)} aria-pressed={aktif}
                  class={`min-h-11 px-3 py-2 text-xs font-bold transition ${
                    aktif ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}>
                  {t(j === 'lamaran' ? 'admin.mail_kind_lamaran' : 'admin.mail_kind_biodata')}
                  <span class={`ml-1.5 tabular-nums ${aktif ? 'text-slate-300' : 'text-slate-500'}`}>{n}</span>
                </button>
              );
            })}
          </fieldset>

          {/* Keranjang + JUMLAHNYA, khusus daftar yang sedang dibuka. */}
          <div class="flex flex-wrap items-center gap-1.5">
            {buckets.map((s) => {
              const jumlah = jumlahKeranjang(s);
              const aktif = filterAktif === s;
              return (
                <button type="button" key={s} onClick={() => setMailFilterStatus(s)}
                  aria-pressed={aktif}
                  class={`min-h-11 px-3 py-2 rounded-lg border text-xs font-bold transition ${
                    aktif
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
                  }`}>
                  {STATUS_LABEL_KEY[s] ? t(STATUS_LABEL_KEY[s]) : s}
                  <span class={`ml-1.5 tabular-nums ${aktif ? 'text-white/80' : 'text-slate-500'}`}>
                    {jumlah}
                  </span>
                </button>
              );
            })}
          </div>

          <button type="button" onClick={() => fetchMailFromAPI(true)}
            class="min-h-11 px-5 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-500 transition">
            <Icon name="sync-alt" class="mr-1" /> {t('admin.refresh_mail')}
          </button>

          {/* Hapus terpilih — hanya muncul saat ada baris dipilih, supaya tidak
              jadi tombol mati yang membingungkan. */}
          {selected.size > 0 && (
            <button type="button" onClick={deleteSelected}
              class="px-5 py-2 bg-rose-600 text-white rounded-lg text-sm font-bold hover:bg-rose-500 transition">
              <Icon name="trash" class="mr-1" /> {t('ui.delete_selected_mail')} ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* Satu kalimat yang menjelaskan keranjang mana yang butuh keputusan.
          Baris ini dulu mengulang semua angka sebagai satu paragraf panjang
          ("Menunggu: 0 | Diperbarui: 0 | …"), yang menambah teks tanpa
          menjawab pertanyaan admin: "yang mana yang harus saya kerjakan?".
          Angkanya sekarang menempel di chip di atas. */}
      <p class="mb-3 text-[11.5px] leading-relaxed text-slate-400">{t('admin.mail_hint')}</p>

      {/* Table */}
      <div class="u-scroll-x rounded-xl border border-slate-800">
        <table class="w-full min-w-[900px] text-sm text-left whitespace-nowrap">
          <thead class="bg-slate-800 text-slate-300 text-[13px] font-semibold border-b border-slate-700">
            <tr>
              <th scope="col" class="p-4 text-center">
                {/* Sasaran sentuh: kotak 20x20 itu sendiri terlalu kecil untuk
                    jari (lantai repo 44px). Berbeda dari checkbox di
                    `TabTambah.tsx:261` yang dibungkus `<label class="min-h-11">`,
                    yang ini telanjang di dalam `<th>`, sehingga seluruh area
                    yang bisa diketuk hanya 20x20. Diukur 2026-10-11 pada enam
                    lebar (320-1440): selalu 20x20. Label pembungkus memberi
                    kotak sentuh 44x44 dengan tampilan kotak yang sama persis. */}
                <label class="min-h-11 min-w-11 inline-flex items-center justify-center cursor-pointer align-middle">
                  <input type="checkbox" aria-label={t('ui.select_all')} class="w-5 h-5 accent-rose-500 cursor-pointer"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} />
                </label>
              </th>
              <th scope="col" class="p-4">{t('table.upload_date')}</th>
              {/* Kolom loker hanya berarti untuk lamaran; baris biodata tidak
                  punya loker, jadi dua kolom kosong hanya menambah lebar. */}
              {jenis === 'lamaran' && (
                <>
                  <th scope="col" class="p-4">{t('table.job_code')}</th>
                  <th scope="col" class="p-4">{t('admin.kategori_bidang')}</th>
                </>
              )}
              <th scope="col" class="p-4">{t('table.full_name')}</th>
              <th scope="col" class="p-4">{t('ui.wa')}</th>
              <th scope="col" class="p-4 text-center">{t('table.status')}</th>
              <th scope="col" class="p-4 text-center">{t('table.doc_folder')}</th>
              <th scope="col" class="p-4 text-center">{t('table.action_review')}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={jenis === 'lamaran' ? 9 : 7} class="p-6 text-center text-slate-500">
                  {t('admin.no_mail_found')}
                  {/* 🔴 Keluhan pemilik 2026-10-22: "update profil Agus Khoci, ada notif,
                      tapi di mail admin panel gak ada sama sekali." Baris hasil update
                      berstatus UPDATE (bukan MENUNGGU), jadi di tab default ia TIDAK
                      terlihat sama sekali. Angka di atas memang menyebutnya, tapi
                      tabel kosong tetap terbaca sebagai "tidak ada apa-apa" — jadi
                      beri jalan keluarnya di sini juga. */}
                  {filterAktif === 'MENUNGGU' && jumlahKeranjang('UPDATE') > 0 && (
                    /* `text-violet-300`, BUKAN `text-violet-200`: yang 200 tidak punya
                       padanan tema terang, jadi labelnya #ddd6fe di atas latar #ede9fe
                       — rasio ~1,06:1, teksnya HILANG. Yang 300 di-shim ke #6d28d9
                       (≈7,4:1). Diukur 2026-10-22. */
                    <button type="button" onClick={() => setMailFilterStatus('UPDATE')}
                      class="mt-2 min-h-11 px-3 py-2 rounded-lg bg-violet-600/20 border border-violet-500/50 text-violet-300 text-[11px] font-bold hover:bg-violet-600/30 transition">
                      {t('admin.mail_update_hint').replace('{n}', String(jumlahKeranjang('UPDATE')))}
                    </button>
                  )}
                </td>
              </tr>
            ) : filtered.map((m, i) => (
              <tr key={m.id || i} class="hover:bg-white/5 transition-colors">
                <td class="p-4 text-center">
                  {/* Checkbox per-baris WAJIB punya nama: header punya
                      `ui.select_all`, tapi barisnya tidak punya apa pun —
                      terukur 2026-10-08 di accessibility tree, tiap baris
                      mengekspos "checkbox" tanpa keterangan, jadi pengguna
                      pembaca layar tidak tahu baris mana yang ia pilih.
                      Nama diambil dari subjek barisnya sendiri. */}
                  <input type="checkbox" class="w-4 h-4 accent-rose-500 cursor-pointer"
                    aria-label={t('ui.select_row').replace('{nama}', String(m.nama || m.wa || m.code || ''))}
                    checked={selected.has(String(m.id ?? m.wa ?? m.nama ?? ''))}
                    onChange={() => toggleOne(String(m.id ?? m.wa ?? m.nama ?? ''))} />
                </td>
                <td class="p-4 text-xs text-slate-400">{m.timestamp || '-'}</td>
                {jenis === 'lamaran' && (
                  <>
                    {/* Kode job dari `mapForm` bernama `code` (`row.code_job`).
                        Baris tanpa kode job adalah baris biodata/dokumen, dan
                        sekarang punya daftarnya sendiri — tidak lagi muncul di
                        sini, jadi tidak perlu label pengganti. */}
                    <td class="p-4"><span class="font-mono text-sky-300 text-xs">{m.code || '-'}</span></td>
                    <td class="p-4 text-xs text-slate-400">{m.kategori || '-'}</td>
                  </>
                )}
                <td class="p-4 font-bold text-white text-sm">{m.nama || '-'}</td>
                <td class="p-4 font-mono text-sky-300 text-xs">{m.wa || '-'}</td>
                <td class="p-4 text-center">
                  {/* `bucketOf`, bukan `m.status` mentah: baris lama menyimpan
                      `REVIEW ADMIN`, yang tidak punya warna dan terbaca sebagai
                      status asing padahal artinya sama dengan REVIEW. */}
                  <span class={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${STATUS_COLORS[labelStatus(m.status, jenis)] || 'bg-slate-500/20 text-slate-400 border-slate-500/40'}`}>
                    {labelStatus(m.status, jenis) || '-'}
                  </span>
                  {/* `feedback` = aktivitas terakhir dari backend ("[BIODATA] email
                      diubah · [UPLOAD KTP]"). Tanpa ini admin melihat status UPDATE
                      tanpa tahu APA yang berubah, dan harus membuka kandidatnya. */}
                  {m.feedback && (
                    <div class="text-[10px] text-slate-400 mt-1 max-w-[220px] whitespace-normal text-left">{m.feedback}</div>
                  )}
                </td>
                <td class="p-4 text-center">
                  <button type="button" disabled class="min-h-11 px-2 py-1 bg-slate-700/40 text-slate-500 rounded text-[11px] font-bold shadow cursor-not-allowed" title={t('admin.tt_segera_hadir')}>
                    <Icon name="folder-open" class="mr-1" /> {t('button.view')}
                  </button>
                </td>
                <td class="p-4 text-center">
                  <div class="flex flex-wrap justify-center gap-1">
                    {/* Aksi ditentukan oleh JENIS BARIS, bukan statusnya.
                        Sebelumnya `isInfoRow(m.status)`: baris DOKUMEN yang
                        ditolak berstatus GAGAL, jadi ia menampilkan tombol
                        Setujui — dan server menolaknya dengan "Baris
                        biodata/dokumen tidak perlu disetujui". */}
                    {!isLamaran(m) ? (
                      /* Baris biodata/dokumen INFORMASI: tidak ada yang perlu
                         disetujui. Pemilik 2026-10-29: "gak perlu persetujuan
                         admin, gak perlu menunggu". Yang tersedia hanya menandai
                         bahwa admin sudah melihatnya — itu jawaban atas
                         pertanyaan "untuk biodata telah dilihat admin gimana". */
                      <button
                        type="button"
                        disabled={String(m.status || '').toUpperCase() === 'DIBACA'}
                        onClick={() => act('tandaiDibacaForm', m.rowIndex, 'Ditandai sudah dibaca')}
                        class={`min-h-11 px-2 py-1.5 rounded text-[11px] font-bold shadow transition ${
                          String(m.status || '').toUpperCase() === 'DIBACA'
                            ? 'bg-slate-700/40 text-slate-500 cursor-not-allowed'
                            : 'bg-slate-600 hover:bg-slate-500 text-white'
                        }`}>
                        <Icon name="check-double" class="mr-1" /> {t('button.mark_read')}
                      </button>
                    ) : (
                      <>
                        {/* "Setujui", bukan "Lulus": yang disetujui admin adalah
                            BERKAS/lamaran ini, bukan kelulusan tahapan seleksi.
                            Nilai yang DISIMPAN pun sekarang `DISETUJUI`
                            (keputusan pemilik 2026-10-29); `LULUS` tinggal
                            arti tahapan dan hanya ditulis dari form kandidat. */}
                        <button type="button" onClick={() => act('approveForm', m.rowIndex, 'Lamaran disetujui')} class="min-h-11 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold shadow transition">
                          <Icon name="check" class="mr-1" /> {t('button.pass')}
                        </button>
                        <button type="button" onClick={() => act('reviewForm', m.rowIndex, 'Status REVIEW')} class="min-h-11 px-2 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold shadow transition">
                          <Icon name="eye" class="mr-1" /> {t('button.review')}
                        </button>
                        <button type="button" onClick={() => setRejectTarget({ rowIndex: m.rowIndex, nama: m.nama })} class="min-h-11 px-2 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-bold shadow transition">
                          <Icon name="times" class="mr-1" /> {t('button.reject')}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rejectTargetP.present && rejectTargetP.held && (
        <RejectMailModal
          candidateName={rejectTargetP.held.nama}
          onCancel={() => setRejectTarget(null)}
          onConfirm={confirmReject}
          closing={rejectTargetP.closing}
        />
      )}
    </div>
  );
}
