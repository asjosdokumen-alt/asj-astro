// ==========================================
// TESTS: MasterFullForm (C02, 2026-09-05) — error-return contract dari
// dedup uploadMany + draft lokal-only (M4). Sebelumnya file ini TIDAK
// punya test sama sekali padahal 5 pass menyentuhnya; branch upload gagal
// (toast eksak + setSaving(false) + return tanpa submit) hanya line-verified.
// ==========================================
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/preact";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MasterFullForm from "./MasterFullForm";
import { showToast } from "../Toast";
import { authStore, type AuthState } from "../../store/authReactive";
import { uploadMany } from "../../lib/cloudinary";

vi.mock("../Toast", () => ({ showToast: vi.fn() }));
vi.mock("../../store/i18n", async () => {
  const { atom } = await import("nanostores");
  return {
    t: (k: string) => {
      if (k === "ai_cv.verify_account") return "Verifikasi Akun Kandidat";
      if (k === "login.btn_masuk") return "Masuk";
      return k;
    },
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

const GUEST: AuthState = { role: "guest", name: "", wa: "", sessionToken: "", refreshToken: "", isLoggedIn: false, lastChecked: 0 };
const KANDIDAT: AuthState = { role: "kandidat", name: "Budi", wa: "081234567890", sessionToken: "tok123", refreshToken: "", isLoggedIn: true, lastChecked: Date.now() };

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

  it('upload gagal → toast "Gagal upload <key>: <msg>" EKSAK + setSaving(false) (tombol aktif lagi) + TANPA submitMasterForm', async () => {
    authStore.set({ ...KANDIDAT });
    render(<MasterFullForm />);
    await waitFor(() => expect(screen.queryByText("Verifikasi Akun Kandidat")).toBeNull());
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
    expect(showToast).toHaveBeenCalledWith("toast.draft_saved", "success");
    const masterCalls = fetchMock.mock.calls.filter((c: any) => String(c[0]).includes("master-data"));
    expect(masterCalls.length).toBe(1); // hanya getDrafCvMaster mount — tidak ada submitMasterForm
  });
});

