// ==========================================
// TESTS: documentColumns (design pass 2026-09-05) — single owner of the
// client file-key → payload-key map (was FILE_TO_PAYLOAD in MasterFullForm
// and DOC_TO_PAYLOAD in AiCvForm). Pins the payload keys to the backend
// contract (netlify/functions/contexts/master-data/service.ts
// MASTER_FILE_COLUMNS) so a drift breaks a test instead of silently
// dropping a document.
// ==========================================
import { describe, it, expect } from "vitest";
import { MASTER_FILE_COLUMNS, AI_FILE_COLUMNS, SISWA_FILE_COLUMNS } from "./documentColumns";

// Payload keys the backend persists (static pin of MASTER_FILE_COLUMNS keys
// in netlify/functions/contexts/master-data/service.ts — frontend tests
// cannot import the Netlify project).
const BACKEND_MASTER_PAYLOAD_KEYS = [
  "photoFile", "jftFile", "sswFile",
  "ijazahSdFile", "ijazahSmpFile", "ijazahSmaFile",
  "univFile", "ktpFile", "kkFile",
];

describe("MASTER_FILE_COLUMNS (C02 master-full)", () => {
  it("memetakan 9 dokumen state → payload key backend", () => {
    expect(MASTER_FILE_COLUMNS).toEqual({
      photo: "photoFile", jft: "jftFile", ssw: "sswFile",
      ijazahSd: "ijazahSdFile", ijazahSmp: "ijazahSmpFile", ijazahSma: "ijazahSmaFile",
      univ: "univFile", ktpFile: "ktpFile", kk: "kkFile",
    });
  });

  it("set payload key == set key backend MASTER_FILE_COLUMNS (tanpa drift)", () => {
    expect([...new Set(Object.values(MASTER_FILE_COLUMNS))].sort()).toEqual([...BACKEND_MASTER_PAYLOAD_KEYS].sort());
  });
});

describe("AI_FILE_COLUMNS (C03 ai-cv)", () => {
  /* 10, bukan 9: SIM A ditambahkan 2026-11-13 (permintaan pemilik — sel kosong
     di samping "Sertifikat SSW" diisi tempat unggah SIM). Ia satu-satunya yang
     TIDAK punya kolom master; URL-nya hidup di `ai_data_json.berkas.sim_url`. */
  it("memetakan 10 dokumen state → payload key (fotoFile..simFile)", () => {
    expect(AI_FILE_COLUMNS).toEqual({
      foto: "fotoFile", jft: "jftFile", ssw: "sswFile",
      ktp: "ktpFile", kk: "kkFile",
      ijazahSd: "ijazahSdFile", ijazahSmp: "ijazahSmpFile",
      ijazahSma: "ijazahSmaFile", univ: "univFile",
      sim: "simFile",
    });
  });

  it("semua nilai berakhiran File (kontrak payload submitDataAsj)", () => {
    expect(Object.values(AI_FILE_COLUMNS).every((v) => v.endsWith("File"))).toBe(true);
  });
});

describe("SISWA_FILE_COLUMNS (C04 siswa-baru)", () => {
  it("map identitas ktp/kk/ijazah", () => {
    expect(SISWA_FILE_COLUMNS).toEqual({ ktp: "ktp", kk: "kk", ijazah: "ijazah" });
  });
});

describe("single ownership", () => {
  it("MASTER dan AI tidak berbagi file-key (state bentuk beda: photo vs foto)", () => {
    expect(Object.keys(MASTER_FILE_COLUMNS).sort()).not.toEqual(Object.keys(AI_FILE_COLUMNS).sort());
  });
});

