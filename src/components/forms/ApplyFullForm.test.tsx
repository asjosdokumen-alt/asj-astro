// ==========================================
// TESTS: ApplyFullForm (C01, 2026-09-05) — A4 server-driven required docs
// (kartu upload dari job.dokumenShare via getAppData public, bukan tabel
// hardcoded) + A5 local-only draft (asj_apply_<job>, tanpa POST).
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import ApplyFullForm from "./ApplyFullForm";
import { showToast } from "../Toast";

vi.mock("../Toast", () => ({ showToast: vi.fn() }));
vi.mock("../../store/i18n", async () => {
  const { atom } = await import("nanostores");
  return { t: (k: string) => k, langStore: atom<"id" | "jp">("id"), toggleLang: vi.fn() };
});
vi.mock("../../lib/cloudinary", () => ({
  uploadToCloudinary: vi.fn(async (f: File) => "https://cloud.test/" + (f && f.name || "doc")),
}));

const fetchMock = vi.fn();
function jsonRes(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

let getAppDataJobs: any[] = [];
let submitApplyRes: any = { success: true, message: "ok" };

async function routeFetch(url: string, init?: any): Promise<any> {
  const u = String(url);
  let body: any = {};
  try { body = JSON.parse(String(init && init.body || "{}")); } catch {}
  if (u.includes("get-app-data")) return jsonRes({ success: true, jobs: getAppDataJobs });
  if (u.includes("files")) {
    if (body.action === "submitApply") return jsonRes(submitApplyRes);
    if (body.action === "cekDataPelamar") return jsonRes({ found: false, applications: [] });
  }
  return jsonRes({});
}

describe("ApplyFullForm (C01) — A4 dokumen wajib dari server + A5 draft localStorage", () => {
  beforeEach(() => {
    localStorage.clear();
    history.replaceState({}, "", "/apply?job=TG123ASJ");
    getAppDataJobs = [{ code: "TG123ASJ", kategori: "Tukang Gypsum", dokumenShare: "CV,JFT,SSW,KTP" }];
    submitApplyRes = { success: true, message: "ok" };
    fetchMock.mockReset();
    vi.mocked(showToast).mockReset();
    fetchMock.mockImplementation(routeFetch as any);
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("A4: kartu wajib berasal dari job.dokumenShare server (getAppData public) + bidang dari kategori", async () => {
    render(<ApplyFullForm />);
    // getAppData dipanggil dengan mode public
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url0, init0] = fetchMock.mock.calls[0];
    expect(String(url0)).toBe("/.netlify/functions/get-app-data");
    expect(JSON.parse(String(init0.body))).toEqual({ action: "getAppData", payload: ["public"] });
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
    // Hanya getAppData yang dipanggil — draft tidak pernah di-POST
    const filesCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("files"));
    expect(filesCalls.length).toBe(0);
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
      const submit = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("files"));
      expect(submit).toBeTruthy();
    });
    const submitCall = fetchMock.mock.calls.find((c: any) => String(c[0]).includes("files"));
    const payload = JSON.parse(String(submitCall![1].body)).payload[0];
    expect(payload.extraFiles).toEqual([{ name: "KTP", url: "https://cloud.test/ktp.pdf" }]);
    expect(payload.cvFile).toBeNull();
    expect(payload.job).toBe("TG123ASJ");
    // Draft dibersihkan setelah submit sukses
    expect(localStorage.getItem("asj_apply_TG123ASJ")).toBeNull();
  });
});

