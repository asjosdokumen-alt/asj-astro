/**
 * AdminAiCopilot.tsx - Unified AI HR Copilot (Qween Jeklin)
 * Migrated from legacy/js/ai_copilot/ (admin + interview + parse + results)
 *
 * A11 parity crosscheck (2026-09-05) against legacy admin.html #modal-admin-ai
 * + js/ai_copilot/{admin,parse,results}.ts fixed root bugs:
 *  1. Chat bubbles were collected into state but NEVER rendered - the chat
 *     looked dead after every send. Bubbles are now rendered (escaped text +
 *     **bold** like legacy tambahPesanAdminAi).
 *  2. All actions used raw fetch with no session token - the surface guard
 *     always answered sessionInvalid. Everything now goes through api.secure
 *     (Bearer token + body; centralized sessionInvalid/network handling).
 *  3. parseDokumenBiodata used to be routed to an 'ingest.parse' background
 *     job whose worker was never implemented (NOT_IMPL), while the real
 *     handler in _lib/ai/classify.ts sat orphaned. surfaces/ingest now calls
 *     the real handler synchronously (legacy contract).
 *  4. Legacy parse is a TWO-step flow: parseDokumenBiodata - then
 *     submitMasterForm({ wa, ...res.data }) persists the extracted biodata.
 *     The old modal showed "Parse berhasil" and threw the data away. The
 *     two-step flow is restored (and dispatches candidates-changed so the
 *     pelamar table refreshes).
 */
import { useState, useRef, useEffect } from "preact/hooks";
import { useStore } from "@nanostores/preact";
import { authStore } from "../../store/authReactive";
import { showToast } from "../Toast";
import { t } from "../../store/i18n";
import Icon from "../ui/Icon";
import AiUnavailableBanner from "../ui/AiUnavailableBanner";
import { api } from "../../lib/apiClient";
import {
  buildAiCvNested,
  mapAiCvDraft,
  parseAiCvRows,
  patchAiDenganKonflik,
  type AiCvRows,
  type KonflikKolom,
} from "../../lib/aiCvDraft";
import KonflikAiPanel from "../ui/KonflikAiPanel";
import { useOverlay } from "../ui/useOverlay";

const JEKLIN_IMG = '/assets/jeklin.webp';

interface ChatMsg {
  role: "assistant" | "user";
  text: string;
  time: string;
}

interface Props {
  candidateId?: string;
  candidateWa?: string;
  onClose: () => void;
  /** Exit window (2026-09-28) — see `useOverlayPresence` + `motion.css` §5b. */
  closing?: boolean;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Render assistant text: escape HTML then convert **bold** to <b> (legacy tambahPesanAdminAi). */
export function boldHtml(text: string): string {
  const escaped = esc(text);
  const parts = escaped.split(/\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? "<b>" + p + "</b>" : p)).join("");
}

/**
 * Kartu hasil wawancara DULU ada di sini (`HasilWawancara` + `lastHasil`) dan
 * membaca `getHasilWawancara` — payload simulator wawancara AI yang lama
 * (`score`, `rekomendasi`, `biodata`). Sistem wawancara berganti 2026-10-25
 * menjadi BANK SOAL (`wawancara_soal` + `wawancara_jawaban`), dan tabel lama
 * itu berhenti diisi: terukur 2026-11-08, baris terbaru `ai_form_submissions`
 * semuanya `mode=AI_MASTER`, nol baris wawancara. Jadi kartu itu tidak pernah
 * punya data lagi — lihat `handleResults` di bawah, yang sekarang membaca bank.
 */

export default function AdminAiCopilot({ candidateId, candidateWa, onClose, closing = false }: Props) {
  const user = useStore(authStore);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"chat" | "isi">("chat");
  const [parseStatus, setParseStatus] = useState("");
  const [parseWa, setParseWa] = useState(candidateWa || "");
  // ── Mode "Isi": tempel data → AI membagi ke kolom → admin memutuskan ──────
  // Permintaan pemilik 2026-11-09: satu tempat untuk mengedit/memperbarui
  // biodata kandidat tanpa mencari-cari di tab lain.
  const [tempel, setTempel] = useState("");
  const [konflik, setKonflik] = useState<KonflikKolom[]>([]);
  /** Gabungan penuh (isi kandidat sekarang + hasil ekstraksi) — yang disimpan. */
  const [gabung, setGabung] = useState<Record<string, string> | null>(null);
  /** Baris riwayat dari draf, dipakai ulang saat membentuk payload simpan. */
  const [rowsDraf, setRowsDraf] = useState<AiCvRows | null>(null);
  // Satu penjaga kesibukan untuk SEMUA aksi AI di panel parse — dulu `parsing`
  // dan `busy` terpisah, sehingga dua klik cepat pada "Buat Model" / "Hasil
  // Wawancara" menembak DUA permintaan AI sekaligus (dua kali kuota provider
  // untuk satu niat pengguna). `parsing` dihapus 2026-11-08: ia tidak pernah
  // dibaca sejak alur parse berkas dibuang.
  const [busy, setBusy] = useState(false);
  // §6.5 row 3: set when the backend answers `code: 'AI_UNAVAILABLE'`. Non-null
  // shows the banner; a later successful AI call clears it.
  const [aiDown, setAiDown] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // §3.2#6 — this overlay carried `.u-modal-shell` with NO hook behind it:
  // no role, no accessible name, no Tab trap, no Escape. It is mounted only
  // while open (`{showAiCopilot && <AdminAiCopilot …/>}` in App.tsx), so
  // `open: true` is the honest value here rather than a hardcoded role.
  // The <h3> below names the dialog — the same text a sighted user reads as
  // the title, which is what the hook resolves `aria-labelledby` from.
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose, closing });

  const now = () =>
    new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    setMessages([{ role: "assistant", text: t("ai.welcome_admin"), time: now() }]);
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, sending]);

  const addMsg = (text: string, role: "assistant" | "user") => {
    setMessages((prev) => [...prev, { role, text, time: now() }]);
  };

  /** Authed API call. api.secure handles session/network toasts + redirects. */
  const apiCall = async (action: string, payload: unknown[]) => {
    const data = await api.secure(action, payload);
    if (data && data.success === false) {
      const err = new Error(String(data.error || data.message || "Gagal")) as Error & { code?: string };
      // Carry the code: the AI surfaces need to tell "the AI provider is down"
      // (show the banner) from "your request was rejected" (show a toast).
      if (data.code) err.code = String(data.code);
      throw err;
    }
    return data;
  };

  /** Show an in-chat warning bubble for an operation failure (legacy behavior). */
  const reportError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof Error ? (e as Error & { code?: string }).code : undefined;
    if (code === "AI_UNAVAILABLE") setAiDown(msg);
    addMsg("⚠️ " + msg, "assistant");
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    // Riwayat diambil SEBELUM bubble admin disisipkan. Server menambahkan
    // `message` ke ujung riwayat, jadi kalau kita mengirim state yang sudah
    // memuatnya, giliran terakhir muncul DUA KALI di prompt. (Server juga
    // memeriksanya sebagai jaring, tapi mengirim yang benar sejak awal adalah
    // perbaikan yang sebenarnya — bukan mengandalkan pembersihan di hilir.)
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    addMsg(msg, "user");
    setInput("");
    setSending(true);
    try {
      const data = await apiCall("processAdminAIChat", [
        {
          adminName: user.name || "Admin",
          message: msg,
          history,
          candidateId: candidateId || undefined,
          // Jalur `wa` di server (`d.candidateId || d.wa`) sudah lama siap, tapi
          // TIDAK PERNAH dikirim dari sini — jadi kandidat yang punya WA tanpa
          // `candidateId` (mis. hanya ada di master) kehilangan blok konteksnya.
          wa: candidateWa || undefined,
        },
      ]);
      addMsg(String(data?.reply || t("admin.ai_confused")), "assistant");
      setAiDown(null);
    } catch (e) {
      reportError(e);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Label manusia untuk kunci flat AI (`nama_lengkap` → "Nama Lengkap"). */
  const labelKolom = (key: string) => {
    const k = `cv.field_${key}`;
    const v = t(k);
    if (v !== k) return v;
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const modes: { key: "chat" | "isi"; label: string }[] = [
    { key: "chat", label: t("admin.ai_tab_chat") },
    { key: "isi", label: t("admin.ai_tab_isi") },
  ];

  /**
   * Mode "Isi" — tempel data kandidat, AI membagi ke kolom.
   *
   * SATU-SATUNYA tempat di panel admin yang bisa memperbarui biodata kandidat
   * dari teks bebas (permintaan pemilik 2026-11-09: *"1 tempat bisa edit update
   * biodata kandidat"*).
   *
   * Alurnya SENGAJA tiga langkah — ekstrak, bandingkan, simpan — dan bukan
   * "tempel lalu langsung tulis". Model bisa salah membaca satu kolom; menulis
   * langsung berarti data yang benar hilang tanpa ada yang melihatnya. Kolom
   * yang SUDAH berisi nilai berbeda tidak ditimpa: ia masuk `konflik` dan admin
   * memilih sendiri (default: pertahankan yang lama).
   */
  const handleEkstrak = async () => {
    if (busy) return;
    const wa = parseWa.trim();
    const teks = tempel.trim();
    if (!wa) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
    if (teks.length < 20) {
      showToast("Tempel data kandidat dulu — teksnya terlalu pendek.", "error");
      return;
    }
    setBusy(true);
    setParseStatus(t("ai.status_fetching"));
    try {
      const hasil = await apiCall("ekstrakBiodataDariTeks", [{ teks }]);
      const patch = hasil?.data ? mapAiCvDraft(hasil.data) : {};
      if (!Object.keys(patch).length) {
        addMsg("⚠️ Tidak ada kolom yang bisa dibaca dari teks itu. Coba tempel ulang dengan label kolom.", "assistant");
        setParseStatus("");
        return;
      }
      // Isi kandidat SEKARANG — tanpa ini "bentrok" tidak bisa dibedakan dari
      // "kosong", dan panel pilihan tidak akan pernah muncul.
      const draf = await apiCall("getDrafCvMaster", [wa]);
      if (draf?.error) {
        addMsg(`⚠️ ${String(draf.error)}`, "assistant");
        setParseStatus("");
        return;
      }
      const sekarang = mapAiCvDraft(draf);
      setRowsDraf(parseAiCvRows(draf));
      const { hasil: gabungan, konflik: bentrok } = patchAiDenganKonflik(sekarang, patch);
      setGabung(gabungan);
      setKonflik(bentrok);
      const siap = Object.keys(patch).length - bentrok.length;
      addMsg(
        `📋 **${siap} kolom siap diisi**` +
          (bentrok.length
            ? ` · **${bentrok.length} kolom bentrok** — pilih di tab "Isi Biodata" dulu.`
            : '. Tekan "Simpan ke biodata" untuk menulis.'),
        "assistant",
      );
      setParseStatus("");
    } catch (e) {
      reportError(e);
      setParseStatus("");
    } finally {
      setBusy(false);
    }
  };

  /** Terapkan pilihan pada kolom yang bentrok (default: yang lama dipertahankan). */
  const terapkanKonflik = (pilihan: Record<string, "lama" | "baru">) => {
    setGabung((g) => {
      if (!g) return g;
      const next = { ...g };
      for (const k of konflik) if (pilihan[k.key] === "baru") next[k.key] = k.baru;
      return next;
    });
    setKonflik([]);
  };

  /** Tulis hasil gabungan ke biodata kandidat (satu payload, satu permintaan). */
  const simpanBiodata = async () => {
    if (busy || !gabung) return;
    const wa = parseWa.trim();
    if (!wa) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
    setBusy(true);
    setParseStatus(t("ai.status_updating"));
    try {
      // Bentuk NESTED yang sama dengan yang dikirim form CV AI saat menekan
      // Simpan — jalur yang sudah terbukti di produksi. `gabung` sudah memuat
      // isi kandidat sebelumnya, jadi tidak ada kolom yang dikosongkan.
      const nested = buildAiCvNested(gabung, rowsDraf || undefined);
      await apiCall("submitDataAsj", [{ context: { wa }, ...nested }]);
      addMsg(`✅ **Biodata ${wa} tersimpan.**`, "assistant");
      showToast(t("ai.biodata_updated"), "success");
      setTempel("");
      setGabung(null);
      setKonflik([]);
      setMode("chat");
    } catch (e) {
      reportError(e);
    } finally {
      setBusy(false);
      setParseStatus("");
    }
  };

  return (
    <div
      ref={containerRef}
      class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-2 md:p-4"
      role="none"
      onClick={onBackdropClick}
    >
      <div
        class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        role="none"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <div class="flex items-center gap-3">
            <img src={JEKLIN_IMG} alt="Jeklin" class="w-8 h-8 rounded-full border border-amber-400" />
            <div>
              <h3 class="text-sm font-bold text-amber-400">{t("ui.ai_copilot")}</h3>
              <p class="text-[11px] text-slate-400">Qween Jeklin</p>
            </div>
          </div>
          <div class="flex gap-1">
            {modes.map((m) => (
              <button type="button"
                key={m.key}
                onClick={() => setMode(m.key)}
                class={
                  "px-2 py-1 text-[11px] font-bold rounded " +
                  (mode === m.key ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} class="text-slate-400 hover:text-white" aria-label={t("public.close")}>
            <Icon name="times" class="text-lg" />
          </button>
        </div>

        {aiDown && (
          <div class="px-4 pt-3 shrink-0">
            <AiUnavailableBanner message={aiDown} />
          </div>
        )}

        {mode === "chat" && (
          <>
            <div ref={chatRef} class="flex-1 u-scroll-area p-4 space-y-3">
              {messages.map((m, i) => (
                <div
                  key={i}
                  class={"flex items-start gap-2 " + (m.role === "user" ? "justify-end" : "")}
                >
                  {m.role === "assistant" && (
                    <img
                      src={JEKLIN_IMG}
                      alt="J"
                      class="w-7 h-7 rounded-full border border-amber-400 flex-shrink-0"
                    />
                  )}
                  <div
                    class={
                      "max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap " +
                      (m.role === "user"
                        ? "bg-sky-600 text-white rounded-tr-none"
                        : "bg-slate-800 text-slate-200 border border-amber-500/20 rounded-tl-none")
                    }
                    // eslint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: boldHtml(m.text) }}
                  />
                </div>
              ))}
              {sending && (
                <div class="flex items-start gap-2">
                  <img
                    src={JEKLIN_IMG}
                    alt="J"
                    class="w-7 h-7 rounded-full border border-amber-400 flex-shrink-0"
                  />
                  <div class="bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-amber-500/20 flex gap-1.5 items-center h-8">
                    <div class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce" />
                    <div
                      class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce"
                      style={{ animationDelay: "0.15s" }}
                    />
                    <div
                      class="w-2 h-2 bg-amber-500/80 rounded-full animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    />
                  </div>
                </div>
              )}
            </div>
            <div class="p-3 border-t border-slate-700 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onInput={(e) => setInput((e.target as HTMLInputElement).value)}
                onKeyDown={handleKeyDown}
                class="flex-1 bg-slate-800 text-xs text-white px-4 py-2.5 rounded-xl border border-slate-700 focus:outline-none focus:border-amber-500"
                placeholder={t("ai.placeholder_admin")}
              />
              <button type="button"
                onClick={() => handleSend()}
                disabled={sending}
                class="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl disabled:opacity-50"
              >
                <Icon name="paper-plane" />
              </button>
            </div>
          </>
        )}

        {mode === "isi" && (
          <div class="flex-1 u-scroll-area p-4 space-y-3">
            <p class="text-[11px] text-slate-400 leading-snug">{t("admin.ai_isi_bantuan")}</p>
            <input
              type="tel"
              value={parseWa}
              onInput={(e) => setParseWa((e.target as HTMLInputElement).value)}
              placeholder={t("ai.placeholder_wa")}
              class="w-full bg-slate-800 text-xs text-white px-3 py-2 rounded-lg border border-slate-700"
            />
            <textarea
              value={tempel}
              onInput={(e) => setTempel((e.target as HTMLTextAreaElement).value)}
              placeholder={"Nama Lengkap: ...\nTempat, Tanggal Lahir: ...\nAlamat: ...\nNo HP: ...\nTinggi / Berat: ..."}
              class="w-full h-40 bg-slate-800 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-amber-500 resize-y"
            />
            <div class="flex gap-2">
              <button
                type="button"
                onClick={handleEkstrak}
                disabled={busy}
                class="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                <Icon name="magic" class="mr-1" /> {t("admin.ai_btn_ekstrak")}
              </button>
              <button
                type="button"
                onClick={simpanBiodata}
                disabled={busy || !gabung}
                class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                <Icon name="database" class="mr-1" /> {t("admin.ai_btn_simpan_biodata")}
              </button>
            </div>
            {konflik.length > 0 && (
              <KonflikAiPanel
                konflik={konflik}
                label={labelKolom}
                onTerapkan={terapkanKonflik}
                onBatal={() => setKonflik([])}
              />
            )}
            {parseStatus && (
              <div class="text-[11px] text-sky-300 bg-sky-900/30 border border-sky-700/50 rounded-lg px-3 py-2">
                {parseStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
