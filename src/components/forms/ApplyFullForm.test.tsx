// ==========================================
// TESTS: ApplyFullForm (C01, 2026-09-05) — A4 server-driven required docs
// (kartu upload dari job.dokumenShare via getAppData public, bukan tabel
// hardcoded) + A5 local-only draft (asj_apply_<job>, tanpa POST).
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ApplyFullForm from "./ApplyFullForm";
import { showToast } from "../Toast";
import { apiClient } from "../../lib/apiClient";

vi.mock("../Toast", () => ({ showToast: vi.fn() }));
vi.mock("../../store/i18n", async () => {
  const { atom } = await import("nanostores");
  return { t: (k: string) => k, langStore: atom<"id" | "jp">("id"), toggleLang: vi.fn(), useLang: () => "id" };
});
vi.mock("../../lib/cloudinary", () => ({
  uploadToCloudinary: vi.fn(async (f: File) => "https://cloud.test/" + (f && f.name || "doc")),
}));

vi.mock("../../lib/apiClient", () => ({ apiClient: vi.fn(), api: {}, default: {} }));

// `fetch` mentah tidak boleh dipakai lagi oleh form ini: `getAppData` dan
// `cekDataPelamar` keduanya ada di CACHEABLE_READS, jadi fetch mentah melewati
// cache baca 30 s di apiClient. Mock fetch TETAP dipasang — justru supaya bisa
// DITEGASKAN bahwa ia tidak pernah dipanggil.
const fetchMock = vi.fn();
const apiClientMock = vi.mocked(apiClient);

let getAppDataJobs: any[] = [];
let submitApplyRes: any = { success: true, message: "ok" };
let cekRes: { found: boolean; isVip?: boolean; nama?: string; applications: unknown[] } = { found: false, applications: [] };

/** Router berdasarkan ACTION, bukan URL — itu inti perubahannya. */
function routeApi(action: string): any {
  if (action === "getAppData") return { success: true, jobs: getAppDataJobs };
  if (action === "submitApply") return submitApplyRes;
  if (action === "cekDataPelamar") return cekRes;
  return {};
}

describe("ApplyFullForm (C01) — A4 dokumen wajib dari server + A5 draft localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, "", "/apply?job=TG123ASJ");
    getAppDataJobs = [{ code: "TG123ASJ", kategori: "Tukang Gypsum", dokumenShare: "CV,JFT,SSW,KTP" }];
    submitApplyRes = { success: true, message: "ok" };
    cekRes = { found: false, applications: [] };
    fetchMock.mockReset();
    apiClientMock.mockReset();
    apiClientMock.mockImplementation((async (action: string) => routeApi(action)) as any);
    vi.mocked(showToast).mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("A4: kartu wajib berasal dari job.dokumenShare server (getAppData public) + bidang dari kategori", async () => {
    render(<ApplyFullForm />);
    // getAppData dipanggil lewat apiClient dengan mode public, dan dengan opsi
    // yang menjaga halaman PUBLIK ini tetap publik: `requireAuth: true` akan
    // menuntut sesi, dan default 'logout' akan me-redirect pengunjung tanpa sesi.
    await waitFor(() => expect(apiClientMock).toHaveBeenCalled());
    expect(apiClientMock).toHaveBeenCalledWith("getAppData", ["public"], {
      requireAuth: false,
      onSessionInvalid: "throw",
      silent: true,
    });
    // Regresi: pembacaan ini TIDAK boleh kembali ke fetch mentah, karena fetch
    // mentah melewati cache baca 30 s untuk action yang ada di CACHEABLE_READS.
    expect(fetchMock).not.toHaveBeenCalled();
    // Bidang terisi dari server (URL tidak membawa ?bidang=)
    await screen.findByDisplayValue("Tukang Gypsum");
    // Kartu: foto (selalu) + CV/JFT/SSW + KTP (dokumenShare server)
    await screen.findByText("KTP");
    expect(screen.getByText("apply.photo_label")).toBeTruthy();
    expect(screen.getByText("apply.cv_label")).toBeTruthy();
    expect(screen.getByText("apply.jft_label")).toBeTruthy();
    expect(screen.getByText("apply.ssw_label")).toBeTruthy();
  });

  it("A4: job tidak ditemukan / tanpa dokumenShare → fallback default CV/JFT/SSW", async () => {
    getAppDataJobs = [];
    render(<ApplyFullForm />);
    await screen.findByText("apply.cv_label");
    expect(screen.getByText("apply.jft_label")).toBeTruthy();
    expect(screen.getByText("apply.ssw_label")).toBeTruthy();
    expect(screen.queryByText("KTP")).toBeNull();
  });

  it("A5: tombol Draft → localStorage asj_apply_<job> SAJA (tidak ada POST ke server)", async () => {
    render(<ApplyFullForm />);
    await screen.findByText("apply.cv_label");
    await fireEvent.input(screen.getByPlaceholderText("apply.nama_ph"), { target: { value: "BUDI SANTOSO" } });
    await fireEvent.click(screen.getByRole("button", { name: "Draft" }));
    const raw = localStorage.getItem("asj_apply_TG123ASJ");
    expect(raw).toBeTruthy();
    const d = JSON.parse(raw!);
    expect(d.form.nama).toBe("BUDI SANTOSO");
    expect(d.form.job).toBe("TG123ASJ");
    expect(d.docKeys).toContain("cv");
    expect(showToast).toHaveBeenCalledWith("toast.draft_saved", "success");
    // Hanya getAppData yang dipanggil — draft tidak pernah di-POST ke server.
    // Ditegaskan lewat ACTION, bukan URL: satu-satunya panggilan tulis di form
    // ini adalah submitApply, dan ia tidak boleh muncul sama sekali.
    const writeCalls = apiClientMock.mock.calls.filter((c: any) => c[0] === "submitApply");
    expect(writeCalls.length).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("A5: draft dipulihkan saat remount (restoreDraft)", async () => {
    localStorage.setItem("asj_apply_TG123ASJ", JSON.stringify({
      savedAt: Date.now(),
      form: { job: "TG123ASJ", bidang: "X", wa: "081234567890", nama: "BUDI SANTOSO", email: "", gender: "", usia: "25", tb: "", bb: "" },
      agree: true, docKeys: ["cv"], oldDocs: {},
    }));
    render(<ApplyFullForm />);
    await screen.findByDisplayValue("BUDI SANTOSO");
    expect((screen.getByDisplayValue("081234567890") as HTMLInputElement).value).toBe("081234567890");
  });

  it("A5: submit sukses → extraFiles membawa dokumen tambahan + draft dibersihkan", async () => {
    render(<ApplyFullForm />);
    // Tunggu kartu KTP dari server
    await screen.findByText("KTP");
    await fireEvent.input(screen.getByPlaceholderText("apply.wa_ph"), { target: { value: "081234567890" } });
    await fireEvent.input(screen.getByPlaceholderText("apply.nama_ph"), { target: { value: "BUDI SANTOSO" } });
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    // KTP input = input file ke-5 (photo, cv, jft, ssw, KTP)
    const inputs = document.querySelectorAll("input[type=file]");
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    const ktpFile = new File(["x"], "ktp.pdf", { type: "application/pdf" });
    await fireEvent.change(inputs[4], { target: { files: [ktpFile] } });
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await fireEvent.click(screen.getByRole("checkbox"));
    await fireEvent.click(screen.getByRole("button", { name: "KIRIM LAMARAN" }));
    await waitFor(() => {
      const submit = apiClientMock.mock.calls.find((c: any) => c[0] === "submitApply");
      expect(submit).toBeTruthy();
    });
    const submitCall = apiClientMock.mock.calls.find((c: any) => c[0] === "submitApply");
    // `apiClient(action, args, options)` — payload adalah argumen KEDUA dan tetap
    // dibungkus satu array, persis seperti yang dulu ditulis ke badan HTTP.
    const payload = (submitCall![1] as any[])[0];
    expect(fetchMock).not.toHaveBeenCalled();
    expect(payload.extraFiles).toEqual([{ name: "KTP", url: "https://cloud.test/ktp.pdf" }]);
    expect(payload.cvFile).toBeNull();
    expect(payload.job).toBe("TG123ASJ");
    // Draft dibersihkan setelah submit sukses
    expect(localStorage.getItem("asj_apply_TG123ASJ")).toBeNull();

    // §4.1(a): the success screen is a TERMINAL dialog — role + trap so the
    // "ke Portal" CTA is reachable, and a name RESOLVED from its own <h2>
    // (asserted through the id, because a dangling aria-labelledby yields no
    // name and would read as green on a presence-only check).
    //
    // The role is written by the hook's passive effect, so it lands one flush
    // after the node appears — hence waitFor rather than a bare read.
    await waitFor(() => {
      const shell = document.querySelector(".u-modal-shell") as HTMLElement | null;
      if (!shell) throw new Error("the success screen is not a .u-modal-shell");
      expect(shell.getAttribute("role")).toBe("dialog");
      expect(shell.getAttribute("aria-modal")).toBe("true");
      const lb = shell.getAttribute("aria-labelledby");
      expect(lb).toMatch(/^asj-overlay-title-\d+$/);
      const heading = lb ? document.getElementById(lb) : null;
      expect((heading?.textContent || "").trim()).toBe("apply.success_title");
    });
  });
});

// ==========================================
// TESTS: gerbang pre-check Magang (item 11 / B3) — UX sebelum round-trip.
// Job kategori "Magang" hanya untuk siswa VIP; server tetap otoritatif
// (handleSubmitApply), form hanya memberi tahu lebih awal.
// ==========================================
describe("ApplyFullForm — pre-check Magang (VIP-only)", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, "", "/apply?job=GJ1ASJ");
    getAppDataJobs = [{ code: "GJ1ASJ", kategori: "Magang", dokumenShare: "" }];
    submitApplyRes = { success: true, message: "ok" };
    cekRes = { found: false, applications: [] };
    fetchMock.mockReset();
    apiClientMock.mockReset();
    apiClientMock.mockImplementation((async (action: string) => routeApi(action)) as unknown as typeof apiClient);
    vi.mocked(showToast).mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("pelamar NON-VIP → lamaran DIBLOKIR lokal (tanpa submitApply) + pesan apply.error_magang_vip", async () => {
    cekRes = { found: true, nama: "Budi", isVip: false, applications: [] };
    render(<ApplyFullForm />);
    await screen.findByText("apply.cv_label");
    await fireEvent.input(screen.getByPlaceholderText("apply.wa_ph"), { target: { value: "081234567890" } });
    await fireEvent.input(screen.getByPlaceholderText("apply.nama_ph"), { target: { value: "BUDI SANTOSO" } });
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await fireEvent.click(screen.getByRole("checkbox"));
    await fireEvent.click(screen.getByRole("button", { name: "KIRIM LAMARAN" }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("apply.error_magang_vip", "error");
    });
    const submit = apiClientMock.mock.calls.find((c) => c[0] === "submitApply");
    expect(submit, "submitApply tidak boleh dikirim untuk Magang non-VIP").toBeUndefined();
  });

  it("pelamar VIP → lamaran DITERUSKAN (submitApply dikirim)", async () => {
    cekRes = { found: true, nama: "Budi", isVip: true, applications: [] };
    render(<ApplyFullForm />);
    await screen.findByText("apply.cv_label");
    await fireEvent.input(screen.getByPlaceholderText("apply.wa_ph"), { target: { value: "081234567890" } });
    await fireEvent.input(screen.getByPlaceholderText("apply.nama_ph"), { target: { value: "BUDI SANTOSO" } });
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    await fireEvent.click(screen.getByRole("checkbox"));
    await fireEvent.click(screen.getByRole("button", { name: "KIRIM LAMARAN" }));
    await waitFor(() => {
      const submit = apiClientMock.mock.calls.find((c) => c[0] === "submitApply");
      expect(submit).toBeTruthy();
    });
    expect(showToast).not.toHaveBeenCalledWith("apply.error_magang_vip", "error");
  });
});

