// ==========================================
// TESTS: cloudinary uploadMany (design pass 2026-09-05) — shared
// iterate → Cloudinary → collect-URLs loop used by MasterFullForm,
// AiCvForm, and SiswaBaruForm. The uploader is injectable (default =
// uploadToCloudinary) so behavior is testable without network.
// Behavior byte-identical to the inline loops they replaced: skip missing
// files, stop at first error with the original message + failing file key.
// ==========================================
import { describe, it, expect, vi } from "vitest";
import { buatPublicId, kompresGambar, uploadMany, UploadCollectionError } from "./cloudinary";

const f1 = new File(["a"], "photo.jpg", { type: "image/jpeg" });
const f2 = new File(["b"], "jft.pdf", { type: "application/pdf" });

describe("uploadMany (loops Master/AiCv/Siswa → satu helper)", () => {
  it("file yang tidak ada dilewati → {} tanpa upload", async () => {
    const upload = vi.fn(async (f: File) => "https://c/" + f.name);
    const urls = await uploadMany({}, { ktp: "ktp", kk: "kk" }, upload);
    expect(urls).toEqual({});
    expect(upload).not.toHaveBeenCalled();
  });

  it("upload tiap file yang ada, URL dikumpulkan dgn payload-key (bukan file-key)", async () => {
    const upload = vi.fn(async (f: File) => "https://c/" + f.name);
    const urls = await uploadMany({ photo: f1, jft: f2, ssw: null }, { photo: "photoFile", jft: "jftFile", ssw: "sswFile" }, upload);
    expect(urls).toEqual({ photoFile: "https://c/photo.jpg", jftFile: "https://c/jft.pdf" });
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenNthCalledWith(1, f1);
    expect(upload).toHaveBeenNthCalledWith(2, f2);
  });

  it("error pertama → UploadCollectionError dgn key file + message asli; upload berhenti", async () => {
    const upload = vi.fn(async (f: File) => {
      if (f === f2) throw new Error("Upload Cloudinary gagal (HTTP 500): boom");
      return "https://c/" + f.name;
    });
    const err = await uploadMany({ a: f1, b: f2, c: f2 }, { a: "aFile", b: "bFile", c: "cFile" }, upload).then(() => null, (e: unknown) => e);
    expect(err).toBeInstanceOf(UploadCollectionError);
    expect((err as UploadCollectionError).key).toBe("b");
    expect((err as Error).message).toBe("Upload Cloudinary gagal (HTTP 500): boom");
    expect(upload).toHaveBeenCalledTimes(2); // c tidak dicoba
  });

  it("map identitas (SISWA_FILE_COLUMNS): payload key == file key", async () => {
    const upload = vi.fn(async (f: File) => "https://c/" + f.name);
    const urls = await uploadMany({ ktp: f1, kk: null, ijazah: f2 }, { ktp: "ktp", kk: "kk", ijazah: "ijazah" }, upload);
    expect(urls).toEqual({ ktp: "https://c/photo.jpg", ijazah: "https://c/jft.pdf" });
  });
});


// ==========================================
// Penamaan berkas (pemilik 2026-11-03): *"rapikan penamaan file nya sehingga
// jelas. contoh agus khoci_ktp"*. Menimpa TIDAK mungkin — Cloudinary menolak
// `overwrite` untuk unggahan unsigned ("Cannot set overwrite to true in unsigned
// presets"), dan unggahan kedua dengan public_id sama mengembalikan aset LAMA.
// Keputusan pemilik: unggah ulang = URL baru. Karena itu ada akhiran waktu.
// ==========================================
describe("buatPublicId — nama berkas yang bisa dibaca", () => {
  it("menggabungkan nama + jenis + waktu", () => {
    expect(buatPublicId("Agus Khoci", "ktp", 1700000000000)).toBe("agus_khoci_ktp_1700000000000");
  });

  it("spasi, tanda baca, dan huruf besar tidak bocor ke nama", () => {
    expect(buatPublicId("1. ALFIAN ARTIN SAPUTRA", "cv", 5)).toBe("1_alfian_artin_saputra_cv_5");
  });

  it("waktu berbeda ⇒ public_id berbeda (unggah ulang dapat URL baru)", () => {
    // Inilah inti keputusan pemilik: berkas baru tidak boleh memakai URL lama.
    expect(buatPublicId("Budi", "jft", 1)).not.toBe(buatPublicId("Budi", "jft", 2));
  });

  it("nama kosong tetap menghasilkan id yang sah", () => {
    expect(buatPublicId("", "", 9)).toBe("kandidat_berkas_9");
  });
});

describe("uploadMany — uploader yang di-inject tetap dipanggil (file) saja", () => {
  it("tanda tangan uploader tidak berubah karena penamaan", async () => {
    const upload = vi.fn(async (f: File) => `https://c/${f.name}`);
    await uploadMany({ ktp: f1 }, { ktp: "ktpFile" }, upload, { nama: "Agus Khoci" });
    expect(upload).toHaveBeenCalledWith(f1);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

/* ── Kompresi foto sebelum unggah (2026-11-05) ──────────────────────────────
 * Tidak ada jalur unggah yang mengecilkan foto: kamera HP 3–8 MB naik apa
 * adanya. Di jaringan seluler itu puluhan detik per unggahan. Kompresi dipasang
 * di SATU titik (`uploadToCloudinary`), jadi tes ini menjaga tiga janji:
 * berkas non-gambar tidak disentuh, gambar kecil tidak disentuh, dan kegagalan
 * kompresi TIDAK PERNAH menggagalkan unggahan.
 */
describe("kompresGambar — hanya foto besar, dan tidak boleh pernah gagal", () => {
  const berkas = (nama: string, tipe: string, ukuran: number) =>
    new File([new Uint8Array(ukuran)], nama, { type: tipe });

  it("dokumen non-gambar dilewati apa adanya", async () => {
    const pdf = berkas("ktp.pdf", "application/pdf", 900_000);
    expect(await kompresGambar(pdf)).toBe(pdf);
  });

  it("PNG dilewati (bisa punya transparansi)", async () => {
    const png = berkas("logo.png", "image/png", 900_000);
    expect(await kompresGambar(png)).toBe(png);
  });

  it("foto kecil dilewati — tidak ada gunanya mengecilkan 200 KB", async () => {
    const kecil = berkas("foto.jpg", "image/jpeg", 200_000);
    expect(await kompresGambar(kecil)).toBe(kecil);
  });

  it("foto besar tanpa canvas/createImageBitmap → berkas asli, bukan error", async () => {
    // jsdom tidak menyediakan keduanya; ini justru menguji jalur fallback yang
    // dipakai browser lama.
    const besar = berkas("foto.jpg", "image/jpeg", 3_000_000);
    const hasil = await kompresGambar(besar);
    expect(hasil).toBe(besar);
  });
});
