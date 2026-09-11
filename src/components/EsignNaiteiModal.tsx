/**
 * EsignNaiteiModal.tsx — "Dokumen E-Sign" (E-Sign & Data Naitei).
 *
 * A07 parity cross-check (2026-09-04) terhadap legacy partials/modals-shared.html
 * `#modal-ttd` + `#modal-fs-canvas` & js/12_esign_match.ts (bukaModalTtd /
 * bukaLayarCanvas / saveFsCanvas / submitDataEsignFull).
 *
 * Rebuild lama hanya menyediakan SATU area tanda tangan (ESignatureModal +
 * saveSignature → ttd1 saja) — Pihak 2 (Wali) dan tulisan Nama Terang tidak
 * ada, dan tidak ada alur simpanDataTtdNaitei. Modal ini mem-port kontrak
 * legacy:
 *   - 4 area: ttd1 + nama1 (Pihak 1 / Kandidat), ttd2 + nama2 (Pihak 2 / Wali)
 *   - setiap area digambar di layar penuh (canvas), area Nama memakai kanvas
 *     lebar (mode tulisan) + hint putar HP
 *   - submit sekali → action simpanDataTtdNaitei { wa, ttd1, nama1, ttd2, nama2 }
 *     (base64 PNG penuh dataUrl; backend menerima objek maupun array args)
 *   - lock tahapan: kandidat hanya boleh membuka saat tahapan sudah masuk
 *     Lolos/Pemberkasan (regex legacy); admin selalu boleh (guard backend tetap).
 */
import { useEffect, useRef, useState } from "preact/hooks";
import { authStore } from "../store/authReactive";
import { t } from "../store/i18n";
import { getEndpoint } from "../lib/apiEndpoint";
import Icon from "./ui/Icon";
import { useOverlay } from "./ui/useOverlay";
import { showToast } from "./Toast";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Nomor WA kandidat yang menandatangani (dari sesi, scope owner-or-admin di backend). */
  wa: string;
}

type FieldKey = "ttd1" | "nama1" | "ttd2" | "nama2";

interface FieldDef {
  key: FieldKey;
  labelKey: string;
  drawTitle: string;
  isNama: boolean;
}

interface SigState {
  ttd1: string | null;
  nama1: string | null;
  ttd2: string | null;
  nama2: string | null;
}

// Lock tahapan — regex sama persis dengan legacy bukaModalTtd (LOLOS..NAITEI).
const RE_NAITEI_OPEN = /LOLOS|PEMBERKASAN|MCU|MEDICAL|MEDIKAL|PARPOR|PASPOR|PASPORT|MATCH|TERIMA|SIAP|TTD|KONTRAK|VISA|COE|KTKLN|SISKOP|FLIGHT|BERANGKAT|TERBANG|TIKET|E-ID|NAITEI/i;

/** Export utk test & gating tombol di dashboard (parity legacy). */
export function allowedTahapanEsign(tahapanRaw: string | undefined | null): boolean {
  return RE_NAITEI_OPEN.test(String(tahapanRaw || "").toUpperCase());
}

const FIELDS_PARTY1: FieldDef[] = [
  { key: "ttd1", labelKey: "ui.sign1", drawTitle: "Tanda Tangan Kandidat", isNama: false },
  { key: "nama1", labelKey: "ui.name1", drawTitle: "Tulisan Nama Kandidat", isNama: true },
];

const FIELDS_PARTY2: FieldDef[] = [
  { key: "ttd2", labelKey: "ui.sign2", drawTitle: "Tanda Tangan Wali", isNama: false },
  { key: "nama2", labelKey: "ui.name2", drawTitle: "Tulisan Nama Wali", isNama: true },
];

// Resolusi logis kanvas per jenis (TTD persegi, Nama lebar utk tulisan).
const LOGICAL_W = { ttd: 900, nama: 1100 };
const LOGICAL_H = { ttd: 340, nama: 300 };

export default function EsignNaiteiModal({ isOpen, onClose, wa }: Props) {
  const [sigs, setSigs] = useState<SigState>({ ttd1: null, nama1: null, ttd2: null, nama2: null });
  const [drawField, setDrawField] = useState<FieldDef | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const openDraw = (field: FieldDef) => {
    setSigs((prev) => ({ ...prev, [field.key]: null }));
    setDrawField(field);
  };

  const { containerRef, onBackdropClick } = useOverlay({ open: isOpen && !drawField, onClose });

  // Ukur + siapkan kanvas saat layar gambar dibuka.
  useEffect(() => {
    if (!drawField || !isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = LOGICAL_W[drawField.isNama ? "nama" : "ttd"];
    const h = LOGICAL_H[drawField.isNama ? "nama" : "ttd"];
    const dpr = Math.max(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    hasDrawn.current = false;
  }, [drawField, isOpen]);

  const pos = (e: PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const w = LOGICAL_W[drawField?.isNama ? "nama" : "ttd"];
    const h = LOGICAL_H[drawField?.isNama ? "nama" : "ttd"];
    return {
      x: ((e.clientX - rect.left) / rect.width) * w,
      y: ((e.clientY - rect.top) / rect.height) * h,
    };
  };

  const onPointerDown = (e: PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    hasDrawn.current = true;
    last.current = pos(e);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };

  const onPointerUp = () => {
    drawing.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !drawField) return;
    const w = LOGICAL_W[drawField.isNama ? "nama" : "ttd"];
    const h = LOGICAL_H[drawField.isNama ? "nama" : "ttd"];
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    hasDrawn.current = false;
  };

  const saveCanvas = () => {
    if (!drawField) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!hasDrawn.current) {
      showToast(t("ui.toast_area_empty"), "error");
      return;
    }
    const dataUrl = canvas.toDataURL("image/png");
    setSigs((prev) => ({ ...prev, [drawField.key]: dataUrl }));
    setDrawField(null);
  };

  const hasAny = () => Object.values(sigs).some((v) => !!v);

  const handleSubmit = async () => {
    if (!wa) {
      showToast(t("ui.toast_target_invalid"), "error");
      return;
    }
    if (!hasAny()) {
      showToast(t("ui.toast_sign_area_required"), "error");
      return;
    }
    setSubmitting(true);
    try {
      const payload = { wa, ttd1: sigs.ttd1 || "", nama1: sigs.nama1 || "", ttd2: sigs.ttd2 || "", nama2: sigs.nama2 || "" };
      const res = await fetch(getEndpoint("simpanDataTtdNaitei"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simpanDataTtdNaitei",
          args: [payload],
          sessionToken: authStore.get().sessionToken || "",
        }),
      });
      const data = await res.json();
      if (data && data.success) {
        showToast(t("ui.toast_saved_server"), "success");
        window.dispatchEvent(new CustomEvent("candidates-changed", { detail: { wa } }));
        onClose();
      } else {
        showToast(t("ui.toast_failed_prefix") + ((data && (data.error || data.message)) || "gagal simpan"), "error");
      }
    } catch (e) {
      showToast(t("ui.toast_network_error_prefix") + (e instanceof Error ? e.message : String(e)), "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const fieldCard = (field: FieldDef, tone: "sky" | "amber") => {
    const done = !!sigs[field.key];
    const btn = done ? t("ui.redo_sign") : t("ui.start_draw");
    return (
      <div class="bg-black/40 border border-slate-700 rounded-lg p-3 text-center flex flex-col items-center justify-center min-h-[110px]">
        <p class="text-[9px] font-bold text-slate-400 mb-2">{t(field.labelKey)}</p>
        {done && sigs[field.key] ? (
          <img
            src={sigs[field.key] as string}
            alt="Pratinjau"
            decoding="async"
            class="h-12 object-contain mb-2 bg-white rounded p-1"
          />
        ) : (
          <div class="h-12 mb-2 w-full rounded bg-white/5 border border-dashed border-slate-600" />
        )}
        <button
          type="button"
          onClick={() => openDraw(field)}
          class={`px-3 py-1.5 ${tone === "sky" ? "bg-sky-600 hover:bg-sky-500" : "bg-amber-600 hover:bg-amber-500"} text-white rounded text-xs font-bold transition shadow mt-auto`}
        >
          <Icon name="pen" class="mr-1" />
          {btn}
        </button>
      </div>
    );
  };

  const partyBlock = (titleKey: string, fields: FieldDef[], tone: "sky" | "amber") => (
    <div class={`col-span-2 ${tone === "sky" ? "bg-slate-900/80 border-slate-700" : "bg-slate-900/80 border-slate-700"} border p-4 rounded-xl`}>
      <h4 class={`text-sm font-bold mb-3 uppercase tracking-widest ${tone === "sky" ? "text-sky-400" : "text-amber-400"}`}>
        {tone === "sky" ? (
          <Icon name="user" class="mr-1" />
        ) : (
          <Icon name="users" class="mr-1" />
        )}
        {t(titleKey)}
      </h4>
      <div class="grid grid-cols-2 gap-3">
        {fields.map((f) => fieldCard(f, tone))}
      </div>
    </div>
  );

  // ── Tampilan daftar area (list) ─────────────────────────────────────────
  if (!drawField) {
    return (
      <div
        class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[300] flex items-center justify-center p-4"
        ref={containerRef}
        onClick={onBackdropClick}
      >
        <div class="glass-panel p-6 md:p-8 rounded-[2rem] w-full max-w-lg shadow-2xl relative border border-rose-500/50 max-h-[90vh] u-scroll-area custom-scrollbar">
          <button
            type="button"
            onClick={onClose}
            class="absolute top-5 right-6 text-slate-400 hover:text-white transition z-[100]"
            aria-label={t("public.close")}
          >
            <Icon name="times" class="text-2xl" />
          </button>

          <h3 class="text-xl font-black text-rose-400 mb-2 border-b border-rose-900/50 pb-3">
            <Icon name="file-signature" class="mr-2" />
            {t("ui.esign_docs")}
          </h3>
          <p class="text-xs text-slate-300 mb-5 leading-relaxed">{t("ui.esign_hint")}</p>

          <div class="grid grid-cols-2 gap-4 mb-6">
            {partyBlock("ui.party1", FIELDS_PARTY1, "sky")}
            {partyBlock("ui.party2", FIELDS_PARTY2, "amber")}
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            class="w-full py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-sm font-bold shadow-[0_0_15px_rgba(225,29,72,0.4)] transition disabled:opacity-50"
          >
            <Icon name="cloud-upload-alt" class="mr-2" />
            {submitting ? t("ui.uploading_server") : t("ui.save_all_docs")}
          </button>
        </div>
      </div>
    );
  }

  // ── Layar gambar penuh (full-screen canvas) ──────────────────────────────
  return (
    <div class="fixed inset-0 u-modal-shell bg-slate-950 z-[999] flex flex-col">
      <div class="px-4 py-3 bg-slate-900 border-b border-slate-800 flex justify-between items-center shadow-md">
        <div>
          <h3 class="text-sm font-bold text-white uppercase tracking-wider">{drawField.drawTitle}</h3>
          <p class="text-[9px] text-slate-400">
            {drawField.isNama ? (
              <>
                <span class="text-amber-400">{t("ui.rotate_phone")}</span> {t("ui.rotate_phone_rest")}
              </>
            ) : (
              t("ui.draw_hint")
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrawField(null)}
          class="text-slate-400 hover:text-white px-3 py-1 bg-slate-800 rounded"
        >
          <Icon name="times" class="mr-1" />
          {t("public.close")}
        </button>
      </div>

      <div class="flex-1 bg-slate-950 p-2 flex items-center justify-center relative touch-none overflow-hidden">
        <div class="absolute inset-4 border-2 border-dashed border-slate-700 pointer-events-none rounded-xl" />
        <canvas
          ref={canvasRef}
          class={`bg-white rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.1)] border-4 border-slate-700 touch-none cursor-crosshair ${
            drawField.isNama ? "w-[92%] max-w-3xl" : "w-[90%] max-w-2xl"
          }`}
          style={{ aspectRatio: `${LOGICAL_W[drawField.isNama ? "nama" : "ttd"]} / ${LOGICAL_H[drawField.isNama ? "nama" : "ttd"]}` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      <div class="px-4 py-4 bg-slate-900 border-t border-slate-800 flex justify-between gap-3 shadow-[0_-5px_15px_rgba(0,0,0,0.3)]">
        <button type="button" onClick={clearCanvas} class="flex-1 py-3.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition">
          <Icon name="eraser" class="mr-1" />
          {t("esign.clear")}
        </button>
        <button type="button" onClick={saveCanvas} class="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition">
          <Icon name="check" class="mr-1" />
          {t("esign.save")}
        </button>
      </div>
    </div>
  );
}
