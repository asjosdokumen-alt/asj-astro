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
  const [mode, setMode] = useState<"chat" | "parse">("chat");
  const [parseStatus, setParseStatus] = useState("");
  const [parseWa, setParseWa] = useState(candidateWa || "");
  const [parseBidang, setParseBidang] = useState("");
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
  const apiCall = async (action: string, payload: Record<string, unknown>[]) => {
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

  const handleGenModel = async () => {
    if (busy) return;
    if (!parseWa && !candidateId) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
    setBusy(true);
    setParseStatus(t("ai.status_generating"));
    try {
      const data = await apiCall("generateWawancaraModel", [
        {
          candidateId: candidateId || undefined,
          wa: parseWa || undefined,
          bidang: parseBidang || undefined,
        },
      ]);
      addMsg(
        "📋 **" +
          t("admin.model_wawancara") +
          "** " +
          String(
            (data as Record<string, unknown>).nama ||
              (data as Record<string, unknown>).bidang ||
              "SSW",
          ) +
          " (" +
          String((data as Record<string, unknown>).bidang || "SSW") +
          ")\n" +
          t("ai.bidang_label") +
          String((data as Record<string, unknown>).bidang || "SSW") +
          "\n\n" +
          String((data as Record<string, unknown>).model || ""),
        "assistant",
      );
      const resWa = String((data as Record<string, unknown>).wa || "");
      if (resWa) setParseWa(resWa);
      showToast(t("ai.model_ready"), "success");
      setParseStatus("");
    } catch (e) {
      reportError(e);
      setParseStatus("");
    } finally {
      setBusy(false);
    }
  };

  /**
   * "Hasil Wawancara" — membaca BANK SOAL (sistem 2026-10-25), bukan simulator
   * AI lama.
   *
   * KENAPA BERUBAH (2026-11-08; laporan pemilik: *"hrd ai kan ada wawancara parse
   * padahal kan system nya sudah berubah"*). Aksi lama `getHasilWawancara`
   * membaca `ai_form_submissions`, tabel yang berhenti diisi ketika wawancara
   * berganti menjadi bank soal. Terukur di produksi: baris terbaru tabel itu
   * semuanya `mode=AI_MASTER`, NOL baris wawancara — jadi tombol ini selalu
   * menjawab "belum ada hasil" dan `Update Biodata` (yang butuh `biodata` dari
   * payload lama) tidak akan pernah bisa jalan.
   *
   * Yang ditampilkan sekarang: pertanyaan + jawaban siswa dari
   * `wawancara_jawaban`, lewat aksi admin `getJawabanWawancaraAdmin`. Kalau
   * belum ada isian, itu dikatakan sebagai "0 dari N" — bukan "tidak ada hasil",
   * karena dua keadaan itu berbeda.
   */
  const handleResults = async () => {
    if (busy) return;
    if (!parseWa && !candidateId) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
    setBusy(true);
    setParseStatus(t("ai.status_fetching"));
    try {
      const data = await apiCall("getJawabanWawancaraAdmin", [
        { wa: parseWa || undefined, candidateId: candidateId || undefined },
      ]);
      const soal = Array.isArray(data?.soal) ? (data.soal as Record<string, unknown>[]) : [];
      if (!soal.length) {
        addMsg(t("ai.no_results"), "assistant");
        setParseStatus("");
        return;
      }
      const terisi = soal.filter((s) => s.terisi === true);
      const baris = (terisi.length ? terisi : soal).slice(0, 12).map((s, i) => {
        const tanya = String(s.tanya || s.kode || "");
        const jawab = String(s.jawaban || "").trim();
        return `${i + 1}. ${tanya}\n   → ${jawab || "—"}`;
      });
      addMsg(
        "📋 **" +
          t("admin.ai_results_title") +
          " — " +
          String(data?.wa || parseWa) +
          "**" +
          "\n✅ " +
          String(data?.terisi ?? terisi.length) +
          "/" +
          String(data?.jumlah ?? soal.length) +
          "\n\n" +
          baris.join("\n") +
          (terisi.length > 12
            ? "\n\n… +" + String(terisi.length - 12) + " " + t("admin.ai_field_biodata")
            : ""),
        "assistant",
      );
      setParseStatus("");
    } catch (e) {
      reportError(e);
      setParseStatus("");
    } finally {
      setBusy(false);
      // Hasilnya DICETAK KE PERCAKAPAN, jadi tab Chat harus dibuka — kalau
      // tidak, admin menekan "Hasil Wawancara" di tab Alat dan melihat layar
      // yang tidak berubah sama sekali (balasannya ada di tab lain). Ini juga
      // yang membuat dua keadaan "bank kosong" vs "siswa belum mengisi" bisa
      // dibaca, bukan ditebak.
      setMode("chat");
    }
  };

  const modes: { key: "chat" | "parse"; label: string }[] = [
    { key: "chat", label: t("admin.ai_tab_chat") },
    { key: "parse", label: t("admin.ai_tab_parse") },
  ];

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

        {mode === "parse" && (
          <div class="flex-1 u-scroll-area p-4 space-y-3">
            <div class="grid grid-cols-2 gap-2">
              <input
                type="tel"
                value={parseWa}
                onInput={(e) => setParseWa((e.target as HTMLInputElement).value)}
                placeholder={t("ai.placeholder_wa")}
                class="bg-slate-800 text-xs text-white px-3 py-2 rounded-lg border border-slate-700"
              />
              <input
                type="text"
                value={parseBidang}
                onInput={(e) => setParseBidang((e.target as HTMLInputElement).value)}
                placeholder={t("ai.placeholder_bidang")}
                class="bg-slate-800 text-xs text-white px-3 py-2 rounded-lg border border-slate-700"
              />
            </div>
            <div class="flex gap-2">
              <button type="button"
                onClick={handleGenModel}
                disabled={busy}
                class="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                <Icon name="clipboard-list" class="mr-1" />
                {t("admin.ai_btn_model")}
              </button>
            </div>
            {/* `Update Biodata` DIHAPUS 2026-11-08: satu-satunya sumber datanya
                adalah `biodata` dari payload simulator wawancara AI yang sudah
                tidak ditulis lagi (lihat catatan di `handleResults`). Tombol
                yang selalu berbunyi "belum ada data" lebih buruk daripada tidak
                ada tombol. */}
            <div class="flex gap-2">
              <button type="button"
                onClick={handleResults}
                disabled={busy}
                class="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-lg disabled:opacity-50"
              >
                <Icon name="file-alt" class="mr-1 text-sky-400" />
                {t("admin.ai_results_title")}
              </button>
            </div>
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
