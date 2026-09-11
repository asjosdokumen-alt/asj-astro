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
import { api } from "../../lib/apiClient";

const JEKLIN_IMG =
  "https://gdwvffmevwtwnzrapjwy.supabase.co/storage/v1/object/public/asj-files/assets/jeklin.png";

interface ChatMsg {
  role: "assistant" | "user";
  text: string;
  time: string;
}

interface Props {
  candidateId?: string;
  candidateWa?: string;
  onClose: () => void;
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

export default function AdminAiCopilot({ candidateId, candidateWa, onClose }: Props) {
  const user = useStore(authStore);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [mode, setMode] = useState<"chat" | "parse" | "results">("chat");
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [parseStatus, setParseStatus] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseWa, setParseWa] = useState(candidateWa || "");
  const [parseBidang, setParseBidang] = useState("");
  const [lastHasil, setLastHasil] = useState<Record<string, unknown> | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const now = () =>
    new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  useEffect(() => {
    setMessages([{ role: "assistant", text: t("ai.welcome_admin"), time: now() }]);
    setSuggestions([t("ai.sug_analyze"), t("ai.sug_translate"), t("ai.sug_check_stage")]);
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
      throw new Error(String(data.error || data.message || "Gagal"));
    }
    return data;
  };

  /** Show an in-chat warning bubble for an operation failure (legacy behavior). */
  const reportError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    addMsg("⚠️ " + msg, "assistant");
  };

  const refreshCandidates = () => {
    window.dispatchEvent(new CustomEvent("candidates-changed"));
  };

  const handleSend = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    addMsg(msg, "user");
    setInput("");
    setSending(true);
    setSuggestions([]);
    try {
      const data = await apiCall("processAdminAIChat", [
        {
          adminName: user.name || "Admin",
          message: msg,
          history: messages.slice(-20).map((m) => ({ role: m.role, content: m.text })),
          candidateId: candidateId || undefined,
        },
      ]);
      addMsg(String(data?.reply || t("admin.ai_confused")), "assistant");
      const acts = data?.suggestedActions;
      if (Array.isArray(acts) && acts.length) setSuggestions(acts.map(String));
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

  /** Two-step legacy parse: parseDokumenBiodata - then submitMasterForm. */
  const handleParse = async () => {
    if (parsing) return;
    if (!parseFile) {
      showToast(t("ai.pick_file_first"), "error");
      return;
    }
    setParseStatus(t("ai.status_parsing").replace("{name}", parseFile.name));
    setParsing(true);
    try {
      const reader = new FileReader();
      const b64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
        reader.onerror = () => reject(new Error(t("ai.read_file_failed")));
        reader.readAsDataURL(parseFile);
      });
      const res = await apiCall("parseDokumenBiodata", [
        {
          candidateId: candidateId || undefined,
          wa: parseWa || undefined,
          file: {
            name: parseFile.name,
            mimeType: parseFile.type || "application/octet-stream",
            data: b64,
          },
        },
      ]);
      const wa = String((res as Record<string, unknown>).wa || parseWa || "");
      if (!wa) throw new Error(t("ai.fill_wa_first"));
      // Step 2 (legacy parse.ts): persist extracted biodata to the master.
      const data = (res as Record<string, unknown>).data as Record<string, unknown> | undefined;
      if (!data || typeof data !== "object") {
        throw new Error(
          String((res as Record<string, unknown>).error || t("admin.ai_parse_failed")),
        );
      }
      await apiCall("submitMasterForm", [{ wa, ...data }]);
      const riwayat = ((res as Record<string, unknown>).riwayat || {}) as Record<string, number>;
      const nama = String((res as Record<string, unknown>).namaSekarang || wa);
      addMsg(
        "📄 **" +
          t("ai.parse_ok_title") +
          ":** " +
          parseFile.name +
          "\n👤 " +
          t("admin.ai_candidate_label") +
          nama +
          "\n📊 " +
          String((res as Record<string, unknown>).fieldCount ?? 0) +
          " " +
          t("admin.ai_field_biodata") +
          " · 🎓 " +
          String(riwayat.pendidikan ?? 0) +
          " · 💼 " +
          String(riwayat.pekerjaan ?? 0) +
          " · 👨‍👩‍👧‍👦 " +
          String(riwayat.keluarga ?? 0) +
          "\n✅ " +
          t("ai.biodata_updated"),
        "assistant",
      );
      showToast(t("ai.parse_success") + " — " + nama + " (" + parseFile.name + ")", "success");
      setParseWa(wa);
      refreshCandidates();
      setParseStatus("");
    } catch (e) {
      reportError(e);
      setParseStatus("");
    } finally {
      setParsing(false);
    }
  };

  const handleGenModel = async () => {
    if (!parseWa && !candidateId) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
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
    }
  };

  const handleResults = async () => {
    if (!parseWa && !candidateId) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
    setParseStatus(t("ai.status_fetching"));
    try {
      const data = await apiCall("getHasilWawancara", [
        { candidateId: candidateId || undefined, wa: parseWa || undefined },
      ]);
      if (!data?.hasil) {
        addMsg(t("ai.no_results"), "assistant");
        setParseStatus("");
        return;
      }
      const h = (data as Record<string, unknown>).hasil as Record<string, any>;
      const bio =
        h.biodata && typeof h.biodata === "object"
          ? (h.biodata as Record<string, unknown>)
          : {};
      const nama =
        String((data as Record<string, unknown>).nama || "") ||
        String(bio.nama || (data as Record<string, unknown>).wa || "");
      setLastHasil({
        wa: (data as Record<string, unknown>).wa || parseWa,
        hasil: h,
        nama,
        updatedAt: (data as Record<string, unknown>).updatedAt || "",
      });
      addMsg(
        "📊 **" +
          t("admin.ai_results_title") +
          " — " +
          (nama || (data as Record<string, unknown>).wa) +
          "**" +
          (String((data as Record<string, unknown>).updatedAt || "") !== ""
            ? "\n🗓️ " + String((data as Record<string, unknown>).updatedAt)
            : "") +
          "\n⭐ " +
          t("admin.ai_score") +
          (h.score !== undefined ? String(h.score) + "/10" : "-") +
          (h.nilai ? " (" + String(h.nilai) + ")" : "") +
          "\n💡 " +
          t("admin.ai_recommendation") +
          String(h.rekomendasi || "-") +
          "\n🧬 " +
          t("admin.ai_field_biodata") +
          ": " +
          Object.keys(bio).length,
        "assistant",
      );
      if ((data as Record<string, unknown>).wa) {
        setParseWa(String((data as Record<string, unknown>).wa));
      }
      setParseStatus("");
    } catch (e) {
      reportError(e);
      setParseStatus("");
    }
  };

  const handleUpdateBio = async () => {
    const h = (lastHasil as any)?.hasil;
    const bio =
      h && h.biodata && typeof h.biodata === "object" ? (h.biodata as Record<string, unknown>) : null;
    if (!bio || !Object.keys(bio).length) {
      showToast(t("ai.no_biodata"), "error");
      return;
    }
    const wa = String((lastHasil as any)?.wa || parseWa || "");
    if (!wa) {
      showToast(t("ai.fill_wa_first"), "error");
      return;
    }
    setParseStatus(t("ai.status_updating"));
    try {
      await apiCall("submitMasterForm", [{ wa, ...bio }]);
      const nama = String((lastHasil as any)?.nama || wa);
      addMsg(
        "✅ **" +
          nama +
          "** — " +
          t("ai.biodata_updated") +
          " (" +
          Object.keys(bio).length +
          " " +
          t("admin.ai_field_biodata") +
          ")",
        "assistant",
      );
      showToast(t("ai.biodata_updated"), "success");
      refreshCandidates();
      setParseStatus("");
    } catch (e) {
      reportError(e);
      setParseStatus("");
    }
  };

  const modes: { key: "chat" | "parse" | "results"; label: string }[] = [
    { key: "chat", label: t("admin.ai_tab_chat") },
    { key: "parse", label: t("admin.ai_tab_parse") },
    { key: "results", label: t("admin.ai_tab_results") },
  ];

  return (
    <div
      class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-2 md:p-4"
      onClick={onClose}
    >
      <div
        class="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
          <div class="flex items-center gap-3">
            <img src={JEKLIN_IMG} alt="Jeklin" class="w-8 h-8 rounded-full border border-amber-400" />
            <div>
              <h3 class="text-sm font-bold text-amber-400">{t("ui.ai_copilot")}</h3>
              <p class="text-[10px] text-slate-400">Qween Jeklin</p>
            </div>
          </div>
          <div class="flex gap-1">
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setMode(m.key)}
                class={
                  "px-2 py-1 text-[10px] font-bold rounded " +
                  (mode === m.key ? "bg-amber-600 text-white" : "bg-slate-800 text-slate-400")
                }
              >
                {m.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} class="text-slate-400 hover:text-white">
            <Icon name="times" class="text-lg" />
          </button>
        </div>

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
            {suggestions.length > 0 && !sending && (
              <div class="px-3 pb-2 flex gap-2 u-scroll-x">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s)}
                    class="whitespace-nowrap px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 text-[11px] rounded-full border border-slate-700 flex-shrink-0"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
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
              <button
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
            <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
              <label
                htmlFor="ai-admin-file"
                class="block text-[10px] font-bold text-slate-400 mb-1"
              >
                {t("admin.ai_upload_label")}
              </label>
              <input
                id="ai-admin-file"
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*"
                onChange={(e) => {
                  const f = (e.target as HTMLInputElement).files?.[0];
                  if (f) setParseFile(f);
                }}
                class="w-full text-[10px] text-slate-400 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-amber-600 file:text-white file:text-[10px] file:font-bold"
              />
              {parseFile && (
                <p class="text-[10px] text-emerald-400 mt-1">
                  <Icon name="check" class="mr-0.5" />
                  {parseFile.name}
                </p>
              )}
            </div>
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
              <button
                onClick={handleParse}
                disabled={parsing}
                class="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
              >
                <Icon name="bolt" class="mr-1" />
                {t("admin.ai_btn_parse")}
              </button>
              <button
                onClick={handleGenModel}
                class="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-lg"
              >
                <Icon name="clipboard-list" class="mr-1" />
                {t("admin.ai_btn_model")}
              </button>
            </div>
            <div class="flex gap-2">
              <button
                onClick={handleResults}
                class="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-bold rounded-lg"
              >
                <Icon name="file-alt" class="mr-1 text-sky-400" />
                {t("admin.ai_results_title")}
              </button>
              <button
                onClick={handleUpdateBio}
                class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold rounded-lg"
              >
                <Icon name="database" class="mr-1" />
                {t("admin.ai_btn_update_bio")}
              </button>
            </div>
            {parseStatus && (
              <div class="text-[11px] text-sky-300 bg-sky-900/30 border border-sky-700/50 rounded-lg px-3 py-2">
                {parseStatus}
              </div>
            )}
          </div>
        )}

        {mode === "results" && (
          <div class="flex-1 u-scroll-area p-4">
            {lastHasil ? (
              <div class="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2">
                <h4 class="text-sm font-bold text-amber-400">{t("admin.ai_results_title")}</h4>
                <p class="text-xs text-slate-300">
                  {t("admin.ai_candidate_label")}
                  <span class="text-white font-bold">
                    {(lastHasil as any).nama || (lastHasil as any).wa}
                  </span>
                </p>
                {String((lastHasil as any).updatedAt || "") !== "" && (
                  <p class="text-xs text-slate-300">
                    {t("admin.ai_updated_label")}
                    <span class="text-slate-100">{(lastHasil as any).updatedAt}</span>
                  </p>
                )}
                <p class="text-xs text-slate-300">
                  {t("admin.ai_score")}
                  <span class="text-emerald-400 font-bold">
                    {(lastHasil as any).hasil?.score ?? "-"}/10
                  </span>
                  {(lastHasil as any).hasil?.nilai
                    ? " (" + String((lastHasil as any).hasil.nilai) + ")"
                    : ""}
                </p>
                {(lastHasil as any).hasil?.rekomendasi && (
                  <p class="text-xs text-slate-300">
                    {t("admin.ai_recommendation")}
                    {(lastHasil as any).hasil.rekomendasi}
                  </p>
                )}
                <button
                  onClick={handleUpdateBio}
                  class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg mt-2"
                >
                  <Icon name="database" class="mr-1" />
                  {t("admin.ai_btn_update_bio")}
                </button>
              </div>
            ) : (
              <p class="text-xs text-slate-500 text-center py-8">{t("ai.no_results")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
