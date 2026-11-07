// ==========================================
// TESTS: TabMail — DUA DAFTAR (Lamaran vs Biodata)
//
// `database_asj_form` menyimpan dua hal berbeda di satu tabel:
//   • LAMARAN — `code_job` terisi; punya keputusan (Setujui/Review/Tolak).
//   • BIODATA — `code_job` KOSONG; hanya perlu ditandai terbaca.
//
// Sebelum pemisahan ini keduanya tampil di satu tabel dengan tujuh chip yang
// sama, dan chip MENUNGGU/REVIEW/DISETUJUI/GAGAL praktis tidak pernah berlaku
// untuk baris biodata — sementara baris biodata mengisi hampir seluruh daftar.
// Keluhan pemilik: "binggung banyak tap nya".
//
// Dua hal yang dikunci di sini:
//   1. tiap daftar hanya menampilkan jenisnya sendiri, dan angkanya hanya
//      menghitung jenis itu;
//   2. aksi ditentukan oleh JENIS BARIS, bukan status — baris DOKUMEN yang
//      ditolak (status GAGAL) TIDAK boleh menawarkan "Setujui", karena server
//      menolaknya dengan "Baris biodata/dokumen tidak perlu disetujui".
// ==========================================
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/preact';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import TabMail from './TabMail';

/** Angka pada chip keranjang. Dulu baris "Diperbarui: 1" adalah paragraf
 *  padat di bawah header; sekarang angka itu menempel di chip-nya. */
function angkaKeranjang(kunci: string): string {
  const btn = screen.getAllByRole('button').find((b) => (b.textContent || '').startsWith(kunci));
  const m = (btn?.textContent || '').match(/(\d+)\s*$/);
  return m ? m[1] : '';
}

import { mailList, mailFilterStatus } from '../../store/adminStore';
import { invalidateAdminData } from '../../store/adminData';

vi.mock('../Toast', () => ({ showToast: vi.fn() }));
vi.mock('../../store/i18n', async () => {
  const { atom } = await import('nanostores');
  return {
    t: (k: string) => {
      const dict: Record<string, string> = {
        'status.waiting': 'Menunggu',
        'status.updated': 'Diperbarui',
        'status.review': 'Review',
        'status.pass': 'Disetujui',
        'status.fail': 'Gagal',
        'status.info': 'Info',
        'button.mark_read': 'Tandai dibaca',
        'status.all': 'SEMUA',
        'admin.no_mail_found': 'Tidak ada mail ditemukan.',
        'admin.mail_update_hint': 'Ada {n} pembaruan biodata/dokumen dari kandidat — buka tab Diperbarui untuk melihatnya.',
        'admin.mail_kind_lamaran': 'Lamaran',
        'admin.mail_kind_biodata': 'Biodata',
        'admin.mail_kind': 'Jenis baris',
        'table.job_code': 'Kode Job',
      };
      return dict[k] ?? k;
    },
    langStore: atom<'id' | 'jp'>('id'),
    toggleLang: vi.fn(),
    useLang: () => 'id',
  };
});

import api from '../../lib/apiClient';

vi.mock('../../lib/apiClient', () => ({ default: { secure: vi.fn() } }));

/** Bentuk `mapForm` (backend) — hanya kolom yang dibaca TabMail.
 *  `code` = `code_job`: KOSONG berarti baris biodata/dokumen. */
function row(over: Record<string, unknown>) {
  return {
    rowIndex: 0, id: 1, timestamp: '2026-10-22 04:40', code: '',
    kategori: '-', nama: 'AGUS KHOCI', wa: '628123456789', status: 'MENUNGGU',
    feedback: '', folderUrl: '', photo: '', jft: '', ssw: '', cv: '', keterangan: '', docs: [],
    ...over,
  };
}

/** Dua lamaran + dua baris biodata, termasuk satu dokumen yang DITOLAK. */
const CAMPUR = [
  row({ rowIndex: 0, id: 1, nama: 'LAMARAN MENUNGGU', status: 'MENUNGGU', code: 'TG100' }),
  row({ rowIndex: 1, id: 2, nama: 'LAMARAN UPDATE', status: 'UPDATE', code: 'TG101', feedback: '[BIODATA] email diubah' }),
  row({ rowIndex: 2, id: 3, nama: 'BIODATA INFO', status: 'INFO', feedback: '[BIODATA] Nama' }),
  row({ rowIndex: 3, id: 4, nama: 'DOKUMEN DITOLAK', status: 'GAGAL', feedback: '[UPLOAD KTP]' }),
];

/** Klik tombol pemilih daftar. Nama aksesibelnya memuat angka ("Biodata 2"). */
function pilihDaftar(nama: 'Lamaran' | 'Biodata') {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${nama}`) }));
}

describe('TabMail — dua daftar terpisah', () => {
  beforeEach(() => {
    invalidateAdminData();
    mailFilterStatus.set('MENUNGGU');
    mailList.set(CAMPUR as never);
    vi.mocked(api.secure).mockResolvedValue({ success: true, formInbox: CAMPUR } as never);
  });
  afterEach(() => {
    cleanup();
    vi.mocked(api.secure).mockReset();
  });

  it('default membuka daftar Lamaran dan tidak mencampur baris biodata', async () => {
    render(<TabMail />);
    await waitFor(() => expect(screen.getByText('LAMARAN MENUNGGU')).toBeTruthy());

    // Baris biodata TIDAK ikut, walau tabelnya sama-sama `database_asj_form`.
    expect(screen.queryByText('BIODATA INFO')).toBeNull();
    expect(screen.queryByText('DOKUMEN DITOLAK')).toBeNull();
  });

  it('angka di chip hanya menghitung daftar yang sedang dibuka', async () => {
    render(<TabMail />);
    // Lamaran: 1 MENUNGGU + 1 UPDATE. Biodata tidak ikut dihitung.
    await waitFor(() => expect(angkaKeranjang('Menunggu')).toBe('1'));
    expect(angkaKeranjang('Diperbarui')).toBe('1');
    expect(angkaKeranjang('SEMUA')).toBe('2');
  });

  it('pindah ke Biodata menampilkan barisnya sendiri, tanpa kolom loker', async () => {
    render(<TabMail />);
    await waitFor(() => expect(screen.getByText('LAMARAN MENUNGGU')).toBeTruthy());

    pilihDaftar('Biodata');

    await waitFor(() => expect(screen.getByText('BIODATA INFO')).toBeTruthy());
    expect(screen.queryByText('LAMARAN MENUNGGU')).toBeNull();
    // Kolom Kode Job / Kategori tidak berarti untuk biodata.
    expect(screen.queryByText('Kode Job')).toBeNull();
  });

  it('dokumen yang DITOLAK tidak menawarkan Setujui — hanya Tandai dibaca', async () => {
    render(<TabMail />);
    await waitFor(() => expect(screen.getByText('LAMARAN MENUNGGU')).toBeTruthy());

    pilihDaftar('Biodata');
    fireEvent.click(screen.getByRole('button', { name: /^Gagal/ }));

    await waitFor(() => expect(screen.getByText('DOKUMEN DITOLAK')).toBeTruthy());
    /* REGRESI: dulu aksi dipilih lewat `isInfoRow(status)`. Baris dokumen yang
       ditolak berstatus GAGAL, jadi ia menampilkan Setujui/Review/Tolak — dan
       server menjawab "Baris biodata/dokumen tidak perlu disetujui". */
    expect(screen.queryByRole('button', { name: 'button.pass' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'button.reject' })).toBeNull();
    expect(screen.getByRole('button', { name: /Tandai dibaca/ })).toBeTruthy();
  });
});

// ==========================================
// TESTS: baris UPDATE harus BISA DILIHAT
//
// Keluhan pemilik 2026-10-22: *"saya habis update profil Agus Khoci, ada
// notifnya, tapi di mail admin panel gak ada sama sekali."*
//
// Sebabnya bukan notifikasinya: `syncBiodataKeMail` memang menulis baris itu —
// tetapi kalau lamarannya SUDAH pernah diputuskan (LULUS/GAGAL), statusnya
// diubah menjadi `UPDATE`, bukan `MENUNGGU`. Keranjang default hanya
// MENUNGGU, jadi baris itu tidak terlihat dan admin tidak punya jalan masuk.
// ==========================================
describe('TabMail — baris UPDATE tidak boleh tak terlihat', () => {
  const ROWS = [
    row({ rowIndex: 0, id: 1, nama: 'AGUS KHOCI', status: 'UPDATE', code: 'TG101', feedback: '[BIODATA] email diubah' }),
    row({ rowIndex: 1, id: 2, nama: 'SITI AMINAH', status: 'DISETUJUI', code: 'TG123' }),
  ];

  beforeEach(() => {
    invalidateAdminData();
    mailFilterStatus.set('MENUNGGU');
    mailList.set(ROWS as never);
    vi.mocked(api.secure).mockResolvedValue({ success: true, formInbox: ROWS } as never);
  });
  afterEach(() => {
    cleanup();
    vi.mocked(api.secure).mockReset();
  });

  it('hitungan Diperbarui muncul walau keranjang default (Menunggu) kosong', async () => {
    render(<TabMail />);
    await waitFor(() => expect(angkaKeranjang('Diperbarui')).toBe('1'));
    // Keranjang default memang kosong — itu benar, barisnya bukan MENUNGGU.
    expect(screen.getByText('Tidak ada mail ditemukan.')).toBeTruthy();
    // …tapi tabel kosong tidak boleh dibiarkan tanpa jalan keluar: petunjuknya
    // sendiri adalah tombol yang membuka keranjang Diperbarui.
    const hint = screen.getByRole('button', { name: /Ada 1 pembaruan biodata\/dokumen/ });
    fireEvent.click(hint);
    await waitFor(() => expect(screen.getByText('AGUS KHOCI')).toBeTruthy());
  });

  it('klik chip Diperbarui → barisnya muncul lengkap dengan APA yang berubah', async () => {
    render(<TabMail />);
    await waitFor(() => expect(angkaKeranjang('Diperbarui')).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: /^Diperbarui/ }));

    await waitFor(() => expect(screen.getByText('AGUS KHOCI')).toBeTruthy());
    // Yang berubah ikut terlihat — tanpa ini admin hanya melihat status UPDATE
    // dan harus membuka kandidatnya untuk tahu apa yang diperbarui.
    expect(screen.getByText('[BIODATA] email diubah')).toBeTruthy();
    expect(screen.queryByText('SITI AMINAH')).toBeNull();
  });

  it('SEMUA menampilkan seluruh baris daftar ini', async () => {
    render(<TabMail />);
    await waitFor(() => expect(angkaKeranjang('Diperbarui')).toBe('1'));

    fireEvent.click(screen.getByRole('button', { name: /^SEMUA/ }));

    await waitFor(() => expect(screen.getByText('AGUS KHOCI')).toBeTruthy());
    expect(screen.getByText('SITI AMINAH')).toBeTruthy();
  });

  // ==========================================
  // TEMA TERANG: label tombol ini nyaris tak terbaca.
  //
  // DIUKUR 2026-10-22 di DOM (Playwright, `data-theme="light"`, /admin#mail):
  //   text-violet-200 (#ddd6fe) di atas bg shim #ede9fe = **1,17:1** — teksnya
  //   praktis hilang, karena `text-violet-200` TIDAK punya padanan tema terang
  //   sementara `bg-violet-600/20` punya. `text-violet-300` di-shim ke #6d28d9
  //   ⇒ **5,98:1** terukur (hover 5,12:1).
  //
  // Gate kontras (`e2e:contrast`) TIDAK menyapu panel admin, jadi tidak ada
  // yang menangkapnya; tes ini yang menahan regresinya.
  // ==========================================
  it('label tombol pembaruan memakai warna teks yang punya padanan tema terang', async () => {
    const { container } = render(<TabMail />);
    await waitFor(() => expect(angkaKeranjang('Diperbarui')).toBe('1'));
    const btn = [...container.querySelectorAll('button')]
      .find((b) => /pembaruan/i.test(b.textContent || ''));
    if (!btn) throw new Error('tombol "Ada N pembaruan" tidak dirender');
    expect(btn.className).toContain('text-violet-300');
    expect(btn.className).not.toContain('text-violet-200');
  });
});

// ==========================================
// TESTS: baris "REVIEW ADMIN" tidak boleh hilang dari keranjang Review
//
// `handleReviewForm` dulu menulis status `REVIEW ADMIN` (dengan spasi),
// sementara keranjangnya bernama `REVIEW`. Perbandingan `===` membuat baris yang
// SEDANG DITINJAU tidak cocok dengan satu pun filter — hanya terlihat kalau
// admin menebak menekan SEMUA — dan hitungan "Review" selalu 0.
//
// Baris lama di database masih menyimpan nilai itu, jadi normalisasinya harus
// ada di UI: memperbaiki penulisnya saja tidak menyembuhkan data yang sudah ada.
// ==========================================
describe('TabMail — status REVIEW ADMIN masuk keranjang Review', () => {
  beforeEach(() => {
    invalidateAdminData();
    mailFilterStatus.set('REVIEW');
    mailList.set([
      row({ rowIndex: 0, id: 9, nama: 'RINA WATI', status: 'REVIEW ADMIN', code: 'TG200' }),
    ] as never);
    vi.mocked(api.secure).mockResolvedValue({ success: true, formInbox: [] } as never);
  });
  afterEach(() => {
    cleanup();
    vi.mocked(api.secure).mockReset();
  });

  it('dihitung sebagai Review dan barisnya terlihat di filter Review', async () => {
    render(<TabMail />);
    await waitFor(() => expect(angkaKeranjang('Review')).toBe('1'));
    expect(screen.getByText('RINA WATI')).toBeTruthy();
  });
});

// ==========================================
// TESTS: baris INFO tidak punya tombol persetujuan
//
// Keputusan pemilik 2026-10-29: "ada baris di mail tapi infonya di mail tab,
// gak perlu persetujuan admin, gak perlu menunggu … biar admin lihat notif dan
// bisa check siswa mana yang aktif mana yang diperbarui".
//
// Baris biodata karena itu berstatus `INFO`: tidak masuk hitungan MENUNGGU, dan
// tombol Setujui/Review/Tolak diganti satu tombol "Tandai dibaca" (`DIBACA`).
// Sejak pemisahan daftar, baris ini ada di daftar **Biodata**, bukan Lamaran.
// ==========================================
describe('TabMail — baris INFO: informasi, bukan antrean', () => {
  beforeEach(() => {
    invalidateAdminData();
    mailFilterStatus.set('INFO');
    mailList.set([
      row({ rowIndex: 0, id: 21, nama: 'SITI INFO', status: 'INFO', feedback: '[BIODATA] Nama' }),
    ] as never);
    vi.mocked(api.secure).mockResolvedValue({ success: true, formInbox: [] } as never);
  });
  afterEach(() => {
    cleanup();
    vi.mocked(api.secure).mockReset();
  });

  it('tidak menawarkan Setujui/Review/Tolak — hanya Tandai dibaca', async () => {
    render(<TabMail />);
    pilihDaftar('Biodata');
    await waitFor(() => expect(screen.getByText('SITI INFO')).toBeTruthy());

    // Nama tombol aksi di mock kamus ini adalah KEY-nya, jadi yang dicari
    // adalah key mentah itu — bukan label Indonesia.
    expect(screen.queryByRole('button', { name: 'button.pass' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'button.review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'button.reject' })).toBeNull();
    expect(screen.getByRole('button', { name: /Tandai dibaca/ })).toBeTruthy();
  });

  it('DIBACA tetap di keranjang Info, dan tombolnya nonaktif', async () => {
    mailList.set([
      row({ rowIndex: 0, id: 22, nama: 'BUDI DIBACA', status: 'DIBACA', feedback: '[BIODATA] Alamat' }),
    ] as never);

    render(<TabMail />);
    pilihDaftar('Biodata');
    await waitFor(() => expect(angkaKeranjang('Info')).toBe('1'));
    expect(screen.getByText('BUDI DIBACA')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /Tandai dibaca/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
