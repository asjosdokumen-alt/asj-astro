// ==========================================
// TESTS: MasterFullForm (C02, 2026-09-05) — error-return contract dari
// dedup uploadMany + draft lokal-only (M4). Sebelumnya file ini TIDAK
// punya test sama sekali padahal 5 pass menyentuhnya; branch upload gagal
// (toast eksak + setSaving(false) + return tanpa submit) hanya line-verified.
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import MasterFullForm from "./MasterFullForm";
import { showToast } from "../Toast";
import { SENTINEL_LAINNYA } from "../../lib/opsi-form";
import { authStore, type AuthState } from "../../store/authReactive";
import { uploadMany } from "../../lib/cloudinary";
import { t } from "../../store/i18n";
import { apiClient } from "../../lib/apiClient";
import { getEndpoint } from "../../lib/apiEndpoint";

vi.mock("../Toast", () => ({ showToast: vi.fn() }));
// Use the real dictionary rather than a hand-maintained key→copy map.
// The old stub returned the raw key for anything it had not been told about,
// so every label this component moved from a JSX literal to `t("master.…")`
// started rendering as "master.next" and the queries below silently broke.
// Delegating to the real `t` keeps the test reading what a user actually sees.
vi.mock("../../store/i18n", async () => {
  const { atom } = await import("nanostores");
  const actual = await vi.importActual<typeof import("../../store/i18n")>("../../store/i18n");
  return {
    ...actual,
    t: actual.t,
    langStore: atom<"id" | "jp">("id"),
    toggleLang: vi.fn(),
  };
});
vi.mock("../../lib/cloudinary", () => ({
  uploadMany: vi.fn(async (files: Record<string, File | null>, map: Record<string, string>) => {
    const urls: Record<string, string> = {};
    for (const [k, pk] of Object.entries(map)) {
      const f = files[k];
      if (f) urls[pk] = "https://cloud.test/" + f.name;
    }
    return urls;
  }),
}));

const fetchMock = vi.fn();
function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

// ==========================================
// apiClient tiruan yang MENIRU format kabelnya
//
// Kenapa meniru, bukan sekadar mengembalikan nilai: berkas ini punya ~25 tes
// yang membaca `fetchMock.mock.calls` untuk memeriksa bentuk payload
// (`JSON.parse(c[1].body).action`, `.payload[0]`, dst). Setelah komponen lewat
// apiClient, panggilan fetch tetap terjadi — dari KLIEN, bukan dari komponen —
// jadi seluruh asersi payload itu tetap menguji hal yang sama tanpa ditulis
// ulang. Yang berubah hanya SIAPA yang mengirim.
//
// Penanda `x-asj-via-api-client` di header adalah invariannya: setiap panggilan
// fetch yang TIDAK membawanya berarti komponen memanggil fetch sendiri — persis
// regresi yang gate ini paku. Tanpa penanda ini, "lewat apiClient" hanya bisa
// diasumsikan dari sumber, dan asumsi itulah yang membuat konversi setengah
// jalan terlihat selesai.
// ==========================================
vi.mock("../../lib/apiClient", () => ({ apiClient: vi.fn(), api: {}, default: {} }));
const apiClientMock = vi.mocked(apiClient);
const VIA_CLIENT = "x-asj-via-api-client";

// Dipasang SEKALI di level modul, bukan di beforeEach: setiap describe di bawah
// me-reset `fetchMock` (untuk mengganti router-nya), dan reset itu tidak boleh
// ikut mencabut emulasi klien.
apiClientMock.mockImplementation(async (action: string, args: unknown[] = []) => {
  // Tanpa anotasi `any`: `lint-ratchet` menghitung anotasi eksplisit, dan berkas
  // ini sudah punya diagnostik — menambah satu saja memerahkan gate itu
  // (kondisi 3). Tipe hasilnya ditulis di sisi PEMAKAIAN, bukan di sini.
  const res = await fetchMock(getEndpoint(action), {
    method: "POST",
    headers: { "Content-Type": "application/json", [VIA_CLIENT]: "1" },
    body: JSON.stringify({ action, payload: args }),
  });
  if (res && res.ok === false) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

/** Bentuk satu panggilan `fetch` yang dicatat mock: [url, init]. */
type FetchCall = [string, { headers?: Record<string, string> } | undefined];
const fetchCalls = () => fetchMock.mock.calls as unknown as FetchCall[];

const GUEST: AuthState = { role: "guest", name: "", wa: "", sessionToken: "", refreshToken: "", isLoggedIn: false, lastChecked: 0 };
const KANDIDAT: AuthState = { role: "kandidat", name: "Budi", wa: "081234567890", sessionToken: "tok123", refreshToken: "", isLoggedIn: true, lastChecked: Date.now() };

/** Isi nama di step 1.
 *
 *  P3 §4.1 #7 menambahkan validasi legacy: simpan FINAL tanpa nama → toast +
 *  lompat ke step 1. Tes yang subjeknya bukan validasi itu (error uploadMany,
 *  bentuk payload, sentinel) tetap perlu nama supaya sampai ke
 *  `submitMasterForm` — kalau tidak, yang teruji justru toast nama wajib dan
 *  tesnya gagal karena alasan yang salah.
 *
 *  Dipakai lewat `container`, bukan `screen`, dan tanpa navigasi ke step 1:
 *  field `nama` ada di DOM pada semua step (step tidak aktif hanya
 *  disembunyikan dengan class), jadi tes tidak perlu bolak-balik. */
async function fillNama(container: HTMLElement | Element, nama = "BUDI SANTOSO") {
  const label = [...container.querySelectorAll("label")].find((l) =>
    (l.textContent || "").toUpperCase().includes("NAMA LENGKAP"));
  if (!label) throw new Error("label nama lengkap tidak ditemukan");
  let el: Element | null = label.nextElementSibling;
  while (el && el.tagName !== "INPUT" && el.tagName !== "TEXTAREA") el = el.nextElementSibling;
  if (!el) throw new Error("input nama lengkap tidak ditemukan");
  await fireEvent.input(el as HTMLElement, { target: { value: nama } });
}

describe("MasterFullForm (C02) — error-return uploadMany + draft lokal-only", () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...GUEST });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes({ success: true })); // getDrafCvMaster mount
    vi.mocked(showToast).mockReset();
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("tanpa sesi → gate login tampil, TANPA panggilan API", () => {
    render(<MasterFullForm />);
    expect(screen.getByText("Verifikasi Akun Kandidat")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // §4.1(a): the gate used to be a `.u-modal-shell` with no semantics at all.
  // It is a WALL — cleared only by a successful gateLogin(), with the form
  // behind it not rendered — so the contract it owes is "announce + trap", not
  // "close". Both halves are asserted, because a role without the trap would
  // be the same false claim §25 removed from RejectMailModal.
  it("gate login memenuhi kontrak overlay: role=dialog + aria-modal + nama yang RESOLVE", () => {
    render(<MasterFullForm />);
    const shell = document.querySelector(".u-modal-shell") as HTMLElement | null;
    if (!shell) throw new Error("gate rendered without a .u-modal-shell");
    expect(shell.getAttribute("role")).toBe("dialog");
    expect(shell.getAttribute("aria-modal")).toBe("true");
    // The gate has no <h1>-<h6> (its title is a styled <div>), so the name can
    // only come from `label`. Asserted against the rendered attribute, not the
    // source — a dangling aria-labelledby would silently yield no name.
    expect(shell.getAttribute("aria-labelledby")).toBeNull();
    expect(shell.getAttribute("aria-label")).toBe("Verifikasi Akun Kandidat");
  });

  it("gate login TIDAK bisa ditutup dengan Escape — dinding, bukan dialog biasa", () => {
    render(<MasterFullForm />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".u-modal-shell")).not.toBeNull();
    expect(screen.getByText("Verifikasi Akun Kandidat")).toBeTruthy();
  });

  // KONTRAK WIRE: `loginKandidat` divalidasi dengan z.tuple([waField,
  // passwordField]) di kernel/validate.ts — payload-nya DUA PRIMITIF.
  //
  // Gate ini (dan gate kembarnya di AiCvForm) dulu mengirim SATU OBJEK
  // `[{wa,password}]`, yang ditolak zod dengan "Array must contain at least 2
  // element(s)". Akibatnya gate TIDAK PERNAH bisa lolos: user selalu melihat
  // "Password salah atau akun tidak ditemukan." walau passwordnya benar, dan
  // tidak ada tes yang memaku bentuk payload ini — gate-nya hanya diuji soal
  // overlay/Escape. LoginModal, jalur login utama, memakai [wa, password] dan
  // memang jalan; jadi schema-nya benar dan kedua gate inilah yang menyimpang.
  it("gate login → loginKandidat dikirim sebagai [wa, password], bukan satu objek", async () => {
    // gateWa diisi dari query string `?wa=` (efek mount), bukan dari input.
    window.history.replaceState({}, "", "/?wa=081234567890");
    apiClientMock.mockClear();
    apiClientMock.mockResolvedValueOnce({ sessionToken: "tok123", user: "Budi" } as never);
    render(<MasterFullForm />);
    await fireEvent.input(document.getElementById("mf-gate-pass") as HTMLInputElement, {
      target: { value: "rahasia123" },
    });
    await fireEvent.click(screen.getByRole("button", { name: "Masuk" }));

    await waitFor(() =>
      expect(apiClientMock.mock.calls.some((c) => c[0] === "loginKandidat")).toBe(true),
    );
    const call = apiClientMock.mock.calls.find((c) => c[0] === "loginKandidat");
    if (!call) throw new Error("loginKandidat tidak dipanggil");
    expect(call[1]).toEqual(["081234567890", "rahasia123"]);
    // Gate benar-benar lewat — bukan sekadar "panggilan terjadi".
    await waitFor(() => expect(screen.queryByText("Verifikasi Akun Kandidat")).toBeNull());
    window.history.replaceState({}, "", "/");
  });

  it('upload gagal → toast "Gagal upload <key>: <msg>" EKSAK + setSaving(false) (tombol aktif lagi) + TANPA submitMasterForm', async () => {
    authStore.set({ ...KANDIDAT });
    const { container } = render(<MasterFullForm />);
    await waitFor(() => expect(screen.queryByText("Verifikasi Akun Kandidat")).toBeNull());
    // P3 §4.1 #7: simpan final butuh nama; isi di step 1 SEBELUM maju karena
    // step dirender kondisional.
    await fillNama(container);
    // Langkah 1..4 → step 5 (Simpan Final)
    for (let i = 0; i < 4; i++) {
      await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    }
    // Bentuk nyata error uploadMany: Error + key file (UploadCollectionError).
    const uploadErr = new Error("Upload Cloudinary gagal (HTTP 500): boom") as any;
    uploadErr.key = "photo";
    vi.mocked(uploadMany).mockRejectedValueOnce(uploadErr);
    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Gagal upload photo: Upload Cloudinary gagal (HTTP 500): boom", "error"));
    // return path: tidak ada submitMasterForm (hanya getDrafCvMaster saat mount)
    const masterCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("master-data"));
    expect(masterCalls.length).toBe(1);
    const body0 = JSON.parse(String(masterCalls[0][1].body));
    expect(body0.action).toBe("getDrafCvMaster");
    // setSaving(false): tombol Simpan Final aktif kembali
    await waitFor(() => expect((screen.getByRole("button", { name: "Simpan Final" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("draft → localStorage asj_master_<wa> SAJA, TANPA POST ke server (M4)", async () => {
    authStore.set({ ...KANDIDAT });
    render(<MasterFullForm />);
    await waitFor(() => expect(screen.queryByText("Verifikasi Akun Kandidat")).toBeNull());
    await fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    const raw = localStorage.getItem("asj_master_081234567890");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).wa).toBe("081234567890");
    // Assert the copy the user actually sees. The component localises via
    // t(), so asserting the raw key only passed while t() was stubbed to
    // echo its input. `t` resolves the real "id" dictionary here.
    expect(showToast).toHaveBeenCalledWith(t("toast.draft_saved"), "success");
    expect(t("toast.draft_saved")).toBe("Draft berhasil disimpan!");
    const masterCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("master-data"));
    expect(masterCalls.length).toBe(1); // hanya getDrafCvMaster mount — tidak ada submitMasterForm
  });
});

// ==========================================
// TESTS: paritas data legacy (2026-09-14) — kelas bug "data hilang / salah
// bentuk saat disimpan", bukan kosmetik. Sebelumnya: daftar SSW memakai kode
// AA…AU yang bukan bidang SSW mana pun, sentinel-nya 'Lainnya' (legacy
// '__LAINNYA__'), 9 field multi-baris dirender <input> satu baris, dan baris
// pendidikan kosong difilter sehingga posisi baris LPK bisa bergeser.
// ==========================================
describe("MasterFullForm — paritas data legacy", () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes({ success: true }));
    vi.mocked(showToast).mockReset();
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** Render, tunggu gate login lewat, lalu maju `n` langkah.
   *
   *  `nama`: kalau diisi, nama diisikan di step 1 SEBELUM maju — step form ini
   *  dirender kondisional (`{step === 1 && …}`), jadi begitu pindah step field
   *  nama tidak ada lagi di DOM dan tidak bisa diisi belakangan. Simpan FINAL
   *  tanpa nama (P3 §4.1 #7) akan dipentalkan kembali ke step 1, sehingga tes
   *  yang bukan tentang validasi itu harus mengisi nama di sini. */
  async function openStep(n: number, nama?: string) {
    const r = render(<MasterFullForm />);
    await waitFor(() => expect(screen.queryByText("Verifikasi Akun Kandidat")).toBeNull());
    if (nama !== undefined) await fillNama(r.container, nama);
    for (let i = 0; i < n; i++) {
      await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    }
    return r;
  }

  it("9 field multi-baris dirender <textarea>, bukan <input> (alamat/penyakit/alergi/laka/promosi/…)", async () => {
    // Step 1 memuat `alamat`.
    const s1 = await openStep(0);
    const alamat = s1.container.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(alamat).toBeTruthy();
    expect(alamat!.getAttribute("rows")).toBe("2");
    cleanup();

    // Step 2 memuat penyakit + alergi + laka + promosi + 4 field Jiko PR.
    const s2 = await openStep(1);
    const tas = [...s2.container.querySelectorAll("textarea")];
    // penyakit, alergi, laka, promosi, alasanBidang, motivasiJepang,
    // keinginan, rencanaPulang = 8 di step 2.
    expect(tas.length).toBe(8);
    const rows = tas.map((x) => x.getAttribute("rows"));
    expect(rows.filter((r) => r === "3").length).toBe(1); // hanya promosi
    expect(rows.filter((r) => r === "2").length).toBe(7);
  });

  it("select SSW memakai 16 bidang resmi + sentinel __LAINNYA__ (BUKAN kode AA…AU)", async () => {
    const { container } = await openStep(4);
    const ssw = [...container.querySelectorAll("select")].filter((s) =>
      [...(s as HTMLSelectElement).options].some((o) => o.value === "KAIGO"),
    ) as HTMLSelectElement[];
    expect(ssw.length).toBe(2); // lisensi + lisensi2
    for (const sel of ssw) {
      const values = [...sel.options].map((o) => o.value);
      expect(values.length).toBe(18); // kosong + 16 bidang + sentinel
      expect(values).toContain("KAIGO");
      expect(values).toContain("WOOD INDUSTRY");
      expect(values).toContain("__LAINNYA__");
      // Kode dari daftar yang salah harus benar-benar hilang.
      expect(values).not.toContain("AA");
      expect(values).not.toContain("Lainnya");
    }
  });

  it("pilih __LAINNYA__ → field manual muncul; yang DIKIRIM teks manualnya, bukan sentinel", async () => {
    // P3 §4.1 #7: simpan final butuh nama — isi di step 1 supaya tes ini
    // menguji sentinel, bukan toast nama wajib.
    const { container } = await openStep(4, "BUDI SANTOSO");
    const sel = [...container.querySelectorAll("select")].find((s) =>
      [...(s as HTMLSelectElement).options].some((o) => o.value === "KAIGO"),
    ) as HTMLSelectElement;

    expect(container.querySelector('input[placeholder="その他の職種を入力"]')).toBeNull();
    await fireEvent.change(sel, { target: { value: "__LAINNYA__" } });
    const manual = container.querySelector('input[placeholder="その他の職種を入力"]') as HTMLInputElement;
    expect(manual).toBeTruthy();
    await fireEvent.input(manual, { target: { value: "TOKUTEI KHUSUS" } });

    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("master-data") && JSON.parse(String(c[1].body)).action === "submitMasterForm");
      expect(call).toBeTruthy();
    });
    const submit = fetchMock.mock.calls.find((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm");
    if (!submit) throw new Error("submitMasterForm tidak terpanggil");
    const payload = JSON.parse(String(submit[1].body)).payload[0];
    expect(payload.lisensi).toBe("TOKUTEI KHUSUS");
    expect(payload.lisensi).not.toBe("__LAINNYA__");
  });

  it("pendidikan selalu dikirim 5 elemen (baris kosong = {}) supaya posisi baris tidak bergeser", async () => {
    // P3 §4.1 #7: simpan final butuh nama.
    await openStep(4, "BUDI SANTOSO");
    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm")).toBe(true);
    });
    const submit = fetchMock.mock.calls.find((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm");
    if (!submit) throw new Error("submitMasterForm tidak terpanggil");
    const payload = JSON.parse(String(submit[1].body)).payload[0];
    expect(Array.isArray(payload.pendidikan)).toBe(true);
    expect(payload.pendidikan.length).toBe(5);
    expect(payload.pendidikan.every((e: unknown) => typeof e === "object")).toBe(true);
  });

  it("enam dokumen (ijazah/KTP/KK) menerima .pdf,image/* — bukan .pdf saja", async () => {
    const { container } = await openStep(4);
    const byName = (n: string) => [...container.querySelectorAll("input[type=file]")].map((f) => (f as HTMLInputElement).accept);
    const accepts = byName("");
    // photo tetap gambar saja; jft & ssw tetap PDF; sisanya .pdf,image/*
    expect(accepts.filter((a) => a === ".pdf,image/*").length).toBe(6);
    expect(accepts.filter((a) => a === ".pdf").length).toBe(2);
    expect(accepts.filter((a) => a.includes(".jpg")).length).toBe(1);
  });
});

// ==========================================
// TESTS: C09 dropdown (2026-09-14) — jurusan sekolah, pekerjaan, kota
// terbit paspor, dan hubungan keluarga kini punya daftar pilihan, bukan
// kotak teks bebas. Kelas bug yang dijaga di sini:
//   - nilai yang DIKIRIM ke server bukan nilai yang dipilih (mis. sentinel
//     'Lainnya' ikut terkirim — data jadi tidak bisa dicocokkan);
//   - nilai lama dari database yang tidak ada di daftar HILANG saat user
//     menyimpan ulang tanpa menyentuh baris itu.
// Keduanya sunyi: tidak ada error, hanya data yang salah/hilang.
// ==========================================
describe("MasterFullForm — C09 dropdown (jurusan/pekerjaan/kota/hubungan)", () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes({ success: true }));
    vi.mocked(showToast).mockReset();
    vi.mocked(uploadMany).mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** Render, isi nama, lalu maju `n` langkah. */
  async function openStep(n: number) {
    const r = render(<MasterFullForm />);
    await waitFor(() => expect(screen.queryByText("Verifikasi Akun Kandidat")).toBeNull());
    await fillNama(r.container);
    for (let i = 0; i < n; i++) {
      await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    }
    return r;
  }

  /** Maju ke step 5 supaya tombol "Simpan Final" ada, lalu submit.
   *
   *  Field step 3 hilang dari DOM begitu pindah step (render kondisional),
   *  TAPI nilainya sudah tersimpan di state komponen — jadi mengisi lalu
   *  navigasi aman, dan justru itu alur nyata user. */
  async function submitFromStep5() {
    for (let i = 0; i < 2; i++) {
      await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    }
    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));
    await waitFor(() => expect(
      fetchMock.mock.calls.some((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm"),
    ).toBe(true));
  }

  /** Select yang opsi-nya memuat `probe` — cara paling andal menemukan satu
   *  dropdown tertentu di antara puluhan field form ini. */
  function selectWith(container: HTMLElement | Element, probe: string, labelText: string) {
    const label = [...container.querySelectorAll("label")].find((l) =>
      (l.textContent || "").trim().toLowerCase() === labelText.toLowerCase());
    if (!label) throw new Error("label tidak ditemukan: " + labelText);
    let el: Element | null = label.nextElementSibling;
    while (el && el.tagName !== "SELECT") el = el.nextElementSibling;
    if (!el) throw new Error("select tidak ditemukan untuk: " + labelText);
    const sel = el as HTMLSelectElement;
    const values = [...sel.options].map((o) => o.value);
    if (!values.includes(probe)) {
      throw new Error(`select "${labelText}" tidak memuat opsi "${probe}"`);
    }
    return sel;
  }

  function submitPayload() {
    const submit = fetchMock.mock.calls.find((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm");
    if (!submit) throw new Error("submitMasterForm tidak terpanggil");
    return JSON.parse(String(submit[1].body)).payload[0];
  }

  async function pick(sel: HTMLSelectElement, value: string) {
    await fireEvent.change(sel as unknown as HTMLElement, { target: { value } });
  }

  it("step 3: jurusan pendidikan memakai daftar jurusan, bukan kotak teks bebas", async () => {
    const { container } = await openStep(2);
    // 'TKJ' ada di JURUSAN_SMK; 'IPA' di JURUSAN_SMA — keduanya harus muncul
    // di SATU dropdown yang sama (SMK + SMA + Kuliah digabung atas permintaan).
    const sel = selectWith(container, "TEKNIK KOMPUTER & JARINGAN (TKJ)", "Jurusan");
    const values = [...sel.options].map((o) => o.value);
    expect(values).toContain("IPA (MIPA)");
    expect(values).toContain("AKUNTANSI");
    expect(values).toContain(SENTINEL_LAINNYA);
    expect(values).toContain("");
  });

  it("step 3: jurusan yang dipilih benar-benar terkirim (bukan sentinel, bukan kosong)", async () => {
    const { container } = await openStep(2);
    const sel = selectWith(container, "TEKNIK KOMPUTER & JARINGAN (TKJ)", "Jurusan");
    await pick(sel, "TEKNIK KOMPUTER & JARINGAN (TKJ)");
    // Isi jenjang supaya barisnya ikut terkirim (legacy: baris tanpa jenjang = {}).
    const jenjang = selectWith(container, "SMA/SMK", "Jenjang");
    await pick(jenjang, "SMA/SMK");

    await submitFromStep5();

    const payload = submitPayload();
    expect(payload.pendidikan[0].jurusan).toBe("TEKNIK KOMPUTER & JARINGAN (TKJ)");
    expect(payload.pendidikan[0].jurusan).not.toBe(SENTINEL_LAINNYA);
  });

  it("step 3: jurusan 'Lainnya' → kotak manual muncul, dan TEKS MANUAL yang terkirim", async () => {
    const { container } = await openStep(2);
    const sel = selectWith(container, "TEKNIK KOMPUTER & JARINGAN (TKJ)", "Jurusan");
    await pick(sel, SENTINEL_LAINNYA);

    // Label 'Jurusan' ada 2 (satu di pendidikan, satu di modal admin) — ambil
    // input manual pertama di step 3 yang muncul setelah memilih sentinel.
    const manual = [...container.querySelectorAll("input")].find(
      (i) => (i as HTMLInputElement).placeholder.includes("tidak ada di daftar"),
    ) as HTMLInputElement;
    expect(manual).toBeTruthy();
    await fireEvent.input(manual, { target: { value: "TEKNIK OTOMOTIF KAPAL" } });

    const jenjang = selectWith(container, "SMA/SMK", "Jenjang");
    await pick(jenjang, "SMA/SMK");

    await submitFromStep5();

    const payload = submitPayload();
    expect(payload.pendidikan[0].jurusan).toBe("TEKNIK OTOMOTIF KAPAL");
    expect(payload.pendidikan[0].jurusan).not.toBe(SENTINEL_LAINNYA);
  });

  it("step 3: jabatan pekerjaan memakai daftar pekerjaan Indonesia (25 legacy + tambahan)", async () => {
    const { container } = await openStep(2);
    const sel = selectWith(container, "KASIR", "Jabatan");
    const values = [...sel.options].map((o) => o.value);
    // Legacy harus ada…
    expect(values).toContain("OPERATOR PRODUKSI");
    expect(values).toContain("BELUM BEKERJA");
    // …dan daftar harus benar-benar diperluas, bukan hanya legacy.
    expect(values.length).toBeGreaterThan(25);
  });

  it("step 4: pekerjaan anggota keluarga memakai daftar yang sama", async () => {
    const { container } = await openStep(3);
    const sel = selectWith(container, "KASIR", "Pekerjaan");
    expect([...sel.options].map((o) => o.value)).toContain("PETANI / PERKEBUNAN");
  });

  it("step 4: hubungan keluarga memakai nilai UPPERCASE legacy (AYAH, bukan Ayah)", async () => {
    const { container } = await openStep(3);
    const sel = selectWith(container, "AYAH", "Hubungan");
    const values = [...sel.options].map((o) => o.value);
    expect(values).toContain("AYAH");
    expect(values).toContain("ISTRI");
    // Nilai TitleCase lama tidak boleh ada lagi — itu nilai yang tidak akan
    // pernah cocok dengan data legacy untuk orang yang sama.
    expect(values).not.toContain("Ayah");
    expect(values).not.toContain("Ibu");
  });

  it("step 5: kota terbit paspor memakai daftar kota, dan terkirim apa adanya", async () => {
    const { container } = await openStep(4);
    const sel = selectWith(container, "SURABAYA", "Kota Penerbitan");
    const values = [...sel.options].map((o) => o.value);
    expect(values).toContain("JAKARTA");
    expect(values).toContain("MAKASSAR");

    await pick(sel, "MAKASSAR");
    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm")).toBe(true));

    expect(submitPayload().kotaPaspor).toBe("MAKASSAR");
  });

  it("prefill: kota lama yang TIDAK ada di daftar tidak hilang saat disimpan ulang", async () => {
    // 'KOTA LAMA' bukan kota di daftar. Sebelum C09 field ini bebas-teks jadi
    // nilainya lolos; sesudah jadi dropdown, risikonya justru nilai itu
    // ter-reset. Tes ini mengunci janji "data lama tidak hilang".
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: any, init: any) => {
      const body = JSON.parse(String(init?.body || "{}"));
      if (body.action === "getDrafCvMaster") {
        return Promise.resolve(jsonRes({
          success: true,
          identitas: { nama_lengkap: "BUDI", kota_terbit_paspor: "KOTA LAMA" },
          pendidikan: [{ tingkat: "SMA", nama_sekolah: "SMAN 1", jurusan: "JURUSAN LAMA" }],
          pekerjaan: [{ nama_perusahaan: "PT X", jabatan: "JABATAN LAMA" }],
          keluarga: [{ nama: "SITI", hubungan: "ISTRI", pekerjaan: "PEKERJAAN LAMA" }],
        }));
      }
      return Promise.resolve(jsonRes({ success: true }));
    });

    const { container } = await openStep(4);
    // Sudah di step 5 (tombol "Simpan Final" sudah ada di sini).
    expect(screen.queryByRole("button", { name: "Simpan Final" })).toBeTruthy();

    // Nilai lama harus TERLIHAT (select parkir di sentinel + kotak manual).
    const kota = selectWith(container, "JAKARTA", "Kota Penerbitan");
    expect(kota.value).toBe(SENTINEL_LAINNYA);

    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));
    await waitFor(() => expect(
      fetchMock.mock.calls.some((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm"),
    ).toBe(true));

    const payload = submitPayload();
    expect(payload.kotaPaspor).toBe("KOTA LAMA");
    expect(payload.pendidikan[0].jurusan).toBe("JURUSAN LAMA");
    expect(payload.pekerjaan[0].jabatan).toBe("JABATAN LAMA");
    expect(payload.keluarga[0].pekerjaan).toBe("PEKERJAAN LAMA");
  });

  // -------------------------------------------------------------------------
  // BUG (ditemukan 2026-09-14 saat verifikasi dokumen review):
  // select `hubungan` dirender dengan `withOther(HUBUNGAN_KELUARGA, …)`, yang
  // IKUT menambahkan baris "✍️ Lainnya / ketik manual" — padahal baris keluarga
  // tidak punya kotak teks manual, dan payload mengirim `hubungan` APA ADANYA
  // (tanpa `resolveRow`). Jadi memilih baris itu menyimpan string literal
  // `__LAINNYA__` sebagai hubungan keluarga — persis kelas bug yang seluruh
  // pola sentinel ini ada untuk mencegahnya.
  //
  // Catatan paritas: komentar di komponen sendiri sudah menulis "legacy memakai
  // nilai UPPERCASE (AYAH/IBU/…) dan TANPA sentinel" — jadi sentinel di sini
  // memang tidak pernah dimaksudkan ada.
  // -------------------------------------------------------------------------
  it("hubungan keluarga TIDAK menawarkan baris 'Lainnya' — legacy tanpa sentinel", async () => {
    const { container } = await openStep(3);
    const sel = selectWith(container, "AYAH", "Hubungan");
    const values = [...sel.options].map((o) => o.value);
    expect(values).not.toContain(SENTINEL_LAINNYA);
  });

  it("hubungan keluarga: nilai yang dikirim tidak pernah sentinel", async () => {    const { container } = await openStep(3);
    const sel = selectWith(container, "AYAH", "Hubungan");
    // Tes ini harus benar-benar MENCOBA jalur sentinel. Kalau ia hanya memilih
    // "ISTRI", ia lulus bahkan ketika baris "Lainnya" masih ada — jadi ia tidak
    // membuktikan apa pun tentang bug yang diklaimnya. Karena itu: kalau opsi
    // sentinel ADA, pilih itu (dan tes harus menangkap kebocorannya); kalau
    // TIDAK ada, tes mencatat fakta itu. Mutation testing mengonfirmasi bedanya.
    const values = [...sel.options].map((o) => o.value);
    const hasSentinel = values.includes(SENTINEL_LAINNYA);
    // Pilihan terakhir yang bukan sentinel = nilai nyata, dipakai sebagai
    // pembanding supaya tes tetap bermakna di kedua keadaan.
    const realValue = values.filter((v) => v && v !== SENTINEL_LAINNYA).pop()!;
    await pick(sel, hasSentinel ? SENTINEL_LAINNYA : realValue);

    // Payload memfilter baris keluarga dengan `f.nama`, jadi baris ini perlu
    // nama supaya ikut terkirim — kalau tidak, `keluarga` kosong dan tesnya
    // gagal karena alasan yang salah (bukan karena sentinel).
    //
    // Labelnya hanya "Nama" (t("form.mf_nama_keluarga")), yang terlalu umum
    // untuk dicari langsung (banyak label "Nama" lain di step ini). Input-nya
    // adalah elemen <input> terdekat SEBELUM label "Hubungan" pada baris yang
    // sama, jadi dicari dengan menelusuri mundur dari sana.
    const labelHubungan = [...container.querySelectorAll("label")].find(
      (l) => (l.textContent || "").trim().toLowerCase() === "hubungan",
    )!;
    const inputs = [...container.querySelectorAll("input")];
    const inputNama = inputs
      .filter((inp) => inp.compareDocumentPosition(labelHubungan) & Node.DOCUMENT_POSITION_FOLLOWING)
      .pop();
    expect(inputNama, "input nama anggota keluarga tidak ditemukan").toBeTruthy();
    await fireEvent.input(inputNama as HTMLElement, { target: { value: "SITI" } });

    // Maju ke step 5 (tombol Simpan Final hanya ada di sana).
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await fireEvent.click(screen.getByRole("button", { name: "Simpan Final" }));
    await waitFor(() => expect(fetchMock.mock.calls.some((c: any) => JSON.parse(String(c[1].body)).action === "submitMasterForm")).toBe(true));

    const row = submitPayload().keluarga[0];
    // Inti bug: apa pun yang dipilih, yang TERSIMPAN tidak boleh sentinel.
    expect(row.hubungan).not.toBe(SENTINEL_LAINNYA);
    expect(row.hubungan).toBe(hasSentinel ? "" : realValue);
  });
});

// ==========================================
// TESTS: invarian struktural — `withOther` hanya untuk field yang PUNYA kotak
// teks manual, dan setiap `ManualSelect` harus di-resolve lewat `resolveOther`.
//
// Ini yang mencegah bug hubungan-keluarga terulang di field lain: kesalahannya
// bukan pada satu nilai, melainkan pada memasangkan daftar bersentinel dengan
// field yang tidak pernah men-resolve sentinel. Tes ini membaca sumbernya
// langsung, karena hubungan antara "select pakai withOther" dan "payload pakai
// resolveRow" tidak terlihat dari DOM.
// ==========================================
describe("MasterFullForm — invarian sentinel ↔ kotak manual", () => {
  const SRC = readFileSync("src/components/forms/MasterFullForm.tsx", "utf8");

  it("setiap <select> yang memakai withOther terletak di dalam ManualSelect", () => {
    // Satu-satunya pemakaian `withOther(...)` di berkas ini harus baris yang ada
    // di dalam komponen ManualSelect — karena hanya komponen itulah yang juga
    // merender kotak teks manual kondisional. Pemakaian di luar itu berarti ada
    // field yang menawarkan "ketik manual" tanpa tempat mengetik.
    const uses = [...SRC.matchAll(/withOther\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(uses.length).toBeGreaterThan(0); // penjaga agar tes tidak hampa
    // Semua pemakaian harus bentuk generik `list, value` (di dalam ManualSelect),
    // BUKAN daftar konkret seperti `HUBUNGAN_KELUARGA, ...`.
    for (const arg of uses) {
      expect(arg, `withOther dipanggil dengan daftar konkret: ${arg}`).toMatch(/^list\s*,/);
    }
  });

  it("tidak ada field yang memakai withEmpty sekaligus di-resolve seperti sentinel", () => {
    // `withEmpty` = field tertutup. Kalau sebuah field memakai withEmpty, ia
    // TIDAK boleh di-resolve lewat resolveRow (tidak ada manual box untuknya) —
    // nilai yang tersimpan harus nilai select apa adanya.
    const withEmptyUses = [...SRC.matchAll(/withEmpty\(([A-Z_]+)/g)].map((m) => m[1]);
    expect(withEmptyUses).toContain("HUBUNGAN_KELUARGA");
    // hubungan dikirim apa adanya (bukan resolveRow) — lihat blok payload.
    expect(SRC).toMatch(/hubungan:\s*f\.hubungan,/);
    expect(SRC).not.toMatch(/hubungan:\s*resolveRow\(/);
  });

  it("tiap ManualSelect punya pasangan resolveRow di payload", () => {
    // `[^>]*` supaya `label` tidak harus jadi prop PERTAMA. Versi sebelumnya
    // menuntut `<ManualSelect label={t("…")}` persis, dan itu bukan invarian
    // yang dimaksud tes ini: menambahkan prop lain (mis. `id` untuk mengaitkan
    // label ke kontrolnya) di depan `label` membuat pola ini menemukan **0**
    // titik pasang — dan tesnya gagal dengan pesan yang menuduh payload, bukan
    // urutan prop. Longgar pada URUTAN, tetap ketat pada JUMLAH.
    const sites = [...SRC.matchAll(/<ManualSelect\b[^>]*label=\{t\("([^"]+)"\)\}/g)].map((m) => m[1]);
    // 4 titik pasang yang diketahui: jurusan, jabatan, pekerjaan keluarga,
    // kota paspor.
    expect(sites).toHaveLength(4);
    // Dan jumlah pemanggilan `resolveRow(...)` harus SAMA BANYAK — satu per
    // ManualSelect. Kalau ada yang lupa di-resolve, sentinel ikut terkirim.
    // (Catatan: `const resolveRow = resolveOther;` tidak dihitung karena tidak
    // berisi `resolveRow(`.)
    const resolveRowCalls = [...SRC.matchAll(/resolveRow\(/g)].length;
    expect(resolveRowCalls).toBe(sites.length);
  });
});

// ==========================================
// TESTS: semua panggilan server lewat apiClient (§26)
//
// `getDrafCvMaster` ada di CACHEABLE_READS, jadi fetch mentah melewati cache
// baca 30 s — cacat yang sama dengan TabKelola, CandidateDash, dan
// ApplyFullForm. Dua invarian, dan keduanya harus bisa GAGAL:
//   1. pembacaan draf lewat apiClient, dengan opsi yang mempertahankan perilaku;
//   2. tidak ada fetch() mentah — setiap panggilan fetch harus datang dari
//      emulasi klien di atas.
// ==========================================
describe("MasterFullForm — semua panggilan server lewat apiClient (§26)", () => {
  beforeEach(() => {
    localStorage.clear();
    authStore.set({ ...KANDIDAT });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonRes({ success: true }));
    vi.mocked(showToast).mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("membaca draf lewat apiClient, dan tidak ada fetch mentah", async () => {
    render(<MasterFullForm />);
    await waitFor(() => expect(apiClientMock).toHaveBeenCalled());
    // Opsi ketiga ditegaskan, bukan sekadar "apiClient dipanggil": default
    // 'logout' akan me-redirect user yang sedang mengisi form pada satu sesi
    // mati, dan itu perubahan SESI yang tidak diminta oleh perbaikan cache ini.
    expect(apiClientMock).toHaveBeenCalledWith("getDrafCvMaster", ["081234567890"], {
      onSessionInvalid: "throw",
      silent: true,
    });
    const raw = fetchCalls().filter((c) => !c[1]?.headers?.[VIA_CLIENT]);
    expect(raw.map((c) => String(c[0]))).toEqual([]);
  });

  it("sumbernya tidak memanggil fetch() mentah sama sekali (invarian statis)", () => {
    // Asersi runtime di atas hanya membuktikan jalur yang benar-benar
    // dijalankan tes ini. Invariannya berlaku untuk SELURUH berkas — termasuk
    // jalur yang tidak pernah dieksekusi suite ini — jadi ia diperiksa pada
    // SUMBER, memakai idiom yang sudah dipakai describe terakhir berkas ini.
    // Yang dilaporkan saat gagal adalah BARISNYA, bukan sekadar jumlahnya.
    const src = readFileSync("src/components/forms/MasterFullForm.tsx", "utf8");
    const offenders = src
      .split("\n")
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /\bfetch\s*\(/.test(line) && !/^(\/\/|\*|\/\*)/.test(line));
    expect(offenders).toEqual([]);
  });
});


