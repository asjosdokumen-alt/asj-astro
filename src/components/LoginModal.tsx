/**
 * LoginModal.tsx — Auth forms (login/register/admin)
 *
 * - Kandidat login/register: bridge-links API (server-side)
 * - Admin 2-step login: Netlify functions (master pin + personal pin)
 */
import { useState, useEffect } from 'preact/hooks';
import { useStore } from '@nanostores/preact';
import { authStore, loginAsAdmin, loginAsKandidat } from '../store/authReactive';
import { showToast } from './Toast';
import { validate, normalizeWaInput, registerSchema, kandidatLoginSchema, adminMasterPinSchema, adminPersonalPinSchema } from '../lib/schemas';
import { t, langStore } from '../store/i18n';
import Icon from './ui/Icon';
import { useOverlay } from './ui/useOverlay';
import { getEndpoint } from '../lib/apiEndpoint';

type ModalMode = "closed" | "login" | "daftar";
type AdminStep = 0 | 1 | 2 | 3;

interface Props {
  mode: ModalMode;
  onClose: () => void;
  onSwitchMode: (m: ModalMode) => void;
}

export default function LoginModal({ mode, onClose, onSwitchMode }: Props) {
  const _lang = useStore(langStore);
  const $user = useStore(authStore);
  const [adminStep, setAdminStep] = useState<AdminStep>(0);
  const [selectedAdmin, setSelectedAdmin] = useState("");
  const [loading, setLoading] = useState(false);
  const [regNama, setRegNama] = useState("");
  const [regWa, setRegWa] = useState("");
  const [logWa, setLogWa] = useState("");
  const [logPass, setLogPass] = useState("");
  const [masterPin, setMasterPin] = useState("");
  const [personalPin, setPersonalPin] = useState("");

  // Listen for admin login trigger from App.tsx
  useEffect(() => {
    const h = () => { setAdminStep(1); setSelectedAdmin(""); setMasterPin(""); setPersonalPin(""); };
    window.addEventListener("asj-admin-login", h);
    const k = () => { setAdminStep(0); };
    window.addEventListener("asj-kandidat-login", k);
    return () => { window.removeEventListener("asj-admin-login", h); window.removeEventListener("asj-kandidat-login", k); };
    // cleanup handled below
  }, []);

  // B01 fix: dulu onClose() dipanggil SAAT RENDER (side-effect dalam render).
  const loggedIn = $user.isLoggedIn;
  useEffect(() => {
    if (loggedIn) onClose();
  }, [loggedIn, onClose]);

  if (loggedIn || mode === "closed") return null;

  // ─── Admin API (routes to surface-specific endpoints) ───
  async function api(action: string, args: unknown[] = []) {
    const r = await fetch(getEndpoint(action), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload: args }),
    });
    if (!r.ok) throw new Error(t('login.api_error').replace('{s}', String(r.status)));
    return r.json();
  }

  // Terjemahkan pesan error schema (zod, hard-coded id) ke i18n — parity toast
  // legacy (toastWaFormat / alert.mandatory). Pesan tak dikenal → asli.
  function tErr(msg: string): string {
    const map: Record<string, string> = {
      'Nomor WA tidak valid. Gunakan format 08xx/628xx (Indonesia) atau 090/070/080/81xx (Jepang).': 'login.wa_invalid',
      'Password minimal 4 karakter': 'login.pass_min',
      'Password maksimal 20 karakter': 'login.pass_max',
      'Password tidak boleh mengandung spasi': 'login.pass_nospace',
      'Nama minimal 2 karakter': 'login.nama_min',
      'PIN harus diisi': 'login.pin_required',
      'Nama admin harus diisi': 'login.admin_name_required',
    };
    const k = map[msg];
    return k ? t(k) : msg;
  }

  // ─── Register ───
  async function handleReg() {
    const vr = validate(registerSchema, { nama: regNama, wa: regWa });
    if (!vr.success) { showToast(tErr(vr.errors[0]), 'error'); return; }
    setLoading(true);
    try {
      const waNorm = normalizeWaInput(regWa);
      const password = waNorm.slice(-4);
      const r = await api('daftarKandidat', [regNama, waNorm, password]);
      if (r.success) {
        showToast(r.message || t('login.reg_ok'), 'success');
        onSwitchMode('login');
      } else {
        showToast(r.error || t('login.reg_failed'), 'error');
      }
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  // ─── Login ───
  async function handleLogin() {
    const vl = validate(kandidatLoginSchema, { wa: logWa, password: logPass });
    if (!vl.success) { showToast(tErr(vl.errors[0]), 'error'); return; }
    setLoading(true);
    try {
      const waNorm = normalizeWaInput(logWa);
      const r = await api('loginKandidat', [waNorm, logPass]);
      if (r.success) {
        const name = r.nama || r.name || logWa;
        loginAsKandidat(name, r.wa || waNorm, r.token || r.sessionToken || '', r.refreshToken || '');
        showToast(t('login.selamat_datang') + name + '!', 'success');
        onClose();
      } else {
        showToast(r.error || t('login.failed'), 'error');
      }
    } catch (e: any) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  // ─── Admin Master PIN ───
  async function handleMaster() {
    const vm = validate(adminMasterPinSchema, { pin: masterPin });
    if (!vm.success) { showToast(tErr(vm.errors[0]), "error"); return; }
    setLoading(true);
    try {
      // B01 fix: dulu kirim [pin, token-klien] (pola legacy) — kernel
      // z.tuple([pinField]) ARITY EKSAK → login admin SELALU gagal validasi.
      // Kontrak Astro: [pin] saja; token bukan bagian payload.
      const r = await api("checkAdminMaster", [masterPin]);
      if (r.success) setAdminStep(2);
      else showToast(r.error || t('login.pin_salah'), "error");
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : String(e), "error"); }
    finally { setLoading(false); }
  }

  function selectAdmin(n: string) { setSelectedAdmin(n); }

  // ─── Admin Personal PIN ───
  async function handlePersonal() {
    const vp = validate(adminPersonalPinSchema, { name: selectedAdmin, pin: personalPin });
    if (!vp.success) { showToast(tErr(vp.errors[0]), "error"); return; }
    setLoading(true);
    try {
      // B01 fix: arity eksak [name, pin] (kernel tuple) — token-klien legacy dihapus.
      const r = await api("checkAdminPersonal", [selectedAdmin, personalPin]);
      if (r.success) {
        loginAsAdmin(selectedAdmin, r.token || r.sessionToken || "", r.refreshToken || "");
        showToast(t('login.selamat_datang') + selectedAdmin + "!", "success");
        onClose();
        window.location.reload();
      } else {
        showToast(r.error || t('login.pin_salah'), "error");
      }
    } catch (e: unknown) { showToast(e instanceof Error ? e.message : String(e), "error"); }
    finally { setLoading(false); }
  }

  // ─── Render ───
  const { containerRef, onBackdropClick } = useOverlay({ open: true, onClose });

  return (
    <div class="fixed inset-0 u-modal-shell bg-black/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
      <div class="glass-panel p-8 rounded-[2rem] w-full max-w-sm shadow-2xl relative">
        <button onClick={onClose} class="absolute top-5 right-6 text-slate-400 hover:text-white z-[100]">
          <Icon name="times" class="text-2xl" />
        </button>

        {/* ── Register ── */}
        {mode === "daftar" && (
          <div>
            <h3 class="text-xl font-bold text-emerald-400 mb-6 border-b border-emerald-900/50 pb-4 text-center">
              <Icon name="user-plus" class="mr-2" /> {t('header.register')}
            </h3>
            <label class="block text-sm font-bold text-slate-400 mb-1.5">{t('login.nama_label')}</label>
            <input type="text" value={regNama} onInput={(e) => setRegNama((e.target as HTMLInputElement).value)}
              placeholder={t("login.nama_ph")}
              class="w-full p-3.5 rounded-2xl bg-black/60 border border-slate-600 text-sm text-white mb-4 outline-none focus:border-emerald-500" />
            <label class="block text-sm font-bold text-slate-400 mb-1.5">{t('login.wa_label')}</label>
            <input type="tel" value={regWa} onInput={(e) => setRegWa((e.target as HTMLInputElement).value)}
              placeholder={t("login.wa_ph")}
              class="w-full p-3.5 rounded-2xl bg-black/60 border border-slate-600 text-sm text-white mb-4 outline-none focus:border-emerald-500" />
            <div class="px-4 py-3 rounded-2xl bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold mb-6 text-center">
              {t('login.pass_hint_reg')}
            </div>
            <button onClick={handleReg} disabled={loading}
              class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full font-bold shadow-lg disabled:opacity-50">
              {loading ? t("login.btn_daftar_loading") : t("login.btn_daftar")}
            </button>
            <p class="text-sm text-center mt-5 text-slate-400">
              {t('login.have_account')}{" "}
              <button onClick={() => onSwitchMode("login")} class="text-emerald-400 underline font-bold">{t('login.btn_masuk')}</button>
            </p>
          </div>
        )}

        {/* ── Kandidat Login ── */}
        {mode === "login" && adminStep === 0 && (
          <div>
            <h3 class="text-xl font-bold text-sky-400 mb-6 border-b border-sky-900/50 pb-4 text-center">
              <Icon name="sign-in-alt" class="mr-2" /> {t("login.title_kandidat")}
            </h3>
            <label class="block text-sm font-bold text-slate-400 mb-1.5">{t('login.wa_label')}</label>
            <input type="tel" value={logWa} onInput={(e) => setLogWa((e.target as HTMLInputElement).value)}
              placeholder={t("login.wa_ph")}
              class="w-full p-3.5 rounded-2xl bg-black/60 border border-slate-600 text-sm text-white mb-4 outline-none focus:border-sky-500" />
            <label class="block text-sm font-bold text-slate-400 mb-1.5">{t('login.pass_label')}</label>
            <input type="password" value={logPass} onInput={(e) => setLogPass((e.target as HTMLInputElement).value)}
              placeholder={t("login.pass_ph")}
              class="w-full p-3.5 rounded-2xl bg-black/60 border border-slate-600 text-sm text-white mb-6 outline-none focus:border-sky-500" />
            <button onClick={handleLogin} disabled={loading}
              class="w-full py-4 bg-sky-600 hover:bg-sky-500 text-white rounded-full font-bold shadow-lg disabled:opacity-50">
              {loading ? t("login.btn_masuk_loading") : t("login.btn_masuk")}
            </button>
            <p class="text-sm text-center mt-5 text-slate-400">
              {t('login.no_account')}{" "}
              <button onClick={() => onSwitchMode("daftar")} class="text-sky-400 underline font-bold">{t('login.btn_daftar')}</button>
            </p>
          </div>
        )}

        {/* ── Admin Step 1: Master PIN + Account Select ── */}
        {mode === "login" && adminStep === 1 && (
          <div class="text-center">
            <Icon name="shield-alt" class="text-5xl text-red-500 mb-5 drop-shadow-lg" />
            <h3 class="text-xl font-bold text-white mb-6 tracking-wide">{t("admin.auth_title")}</h3>
            <label class="block text-sm font-bold text-slate-400 mb-1.5 text-left">{t("admin.pin_master")}</label>
            <input type="password" value={masterPin} onInput={(e) => setMasterPin((e.target as HTMLInputElement).value)}
              placeholder={t("admin.pin_master")}
              class="w-full p-4 rounded-2xl bg-black/60 border border-slate-600 text-center text-2xl tracking-widest text-white mb-6 outline-none focus:border-red-500 transition"
              onKeyPress={(e: KeyboardEvent) => { if (e.key === "Enter") handleMaster(); }} />
            <button onClick={handleMaster} disabled={loading}
              class="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-full font-bold transition shadow-[0_0_15px_rgba(220,38,38,0.5)] text-lg hover:-translate-y-1 disabled:opacity-50">
              {loading ? t("ui.checking") : t("button.verify")}
            </button>
            <p class="text-sm text-center mt-5 text-slate-400">
              <button onClick={() => { onSwitchMode("login"); setAdminStep(0); setMasterPin(""); }} class="text-sky-400 underline font-bold">
                {t("header.login")}
              </button>
            </p>
          </div>
        )}

        {/* ── Admin Step 2: Personal PIN ── */}
        {mode === "login" && adminStep === 2 && (
          <div class="text-center">
            <Icon name="users-cog" class="text-5xl text-sky-500 mb-5 drop-shadow-lg" />
            <h3 class="text-lg font-bold text-white mb-6 tracking-wide">{t("admin.select_account")}</h3>
            <div class="grid grid-cols-2 gap-4">
              {["SACHOU", "AYOK", "KHOLIS", "KHOCI"].map(name => (
                <button key={name} onClick={() => { setSelectedAdmin(name); setAdminStep(3); }}
                  class="py-4 bg-white/10 hover:bg-sky-600 border border-white/20 rounded-2xl font-bold text-white transition shadow-md hover:-translate-y-1">
                  {name}
                </button>
              ))}
            </div>
            <p class="text-sm text-center mt-5 text-slate-400">
              <button onClick={() => { setAdminStep(1); setMasterPin(""); }} class="text-amber-400 underline font-bold">
                {t('login.back')}
              </button>
            </p>
          </div>
        )}

        {mode === "login" && adminStep === 3 && (
          <div class="text-center">
            <Icon name="lock" class="text-5xl text-amber-500 mb-4 drop-shadow-lg" />
            <h3 class="text-lg font-bold text-white mb-1">{t("admin.auth_title")} {selectedAdmin}</h3>
            <p class="text-sm text-slate-400 mb-6">{t("admin.enter_pin")}</p>
            <label class="block text-sm font-bold text-slate-400 mb-1.5 text-left">{t("admin.pin_personal")}</label>
            <input type="password" value={personalPin} onInput={(e) => setPersonalPin((e.target as HTMLInputElement).value)}
              placeholder={t("admin.pin_personal")}
              class="w-full p-4 rounded-2xl bg-black/60 border border-slate-600 text-center text-2xl tracking-widest text-white mb-6 outline-none focus:border-amber-500 transition"
              onKeyPress={(e: KeyboardEvent) => { if (e.key === "Enter") handlePersonal(); }} />
            <button onClick={handlePersonal} disabled={loading}
              class="w-full py-4 bg-amber-600 hover:bg-amber-500 text-white rounded-full font-bold transition shadow-[0_0_15px_rgba(217,119,6,0.5)] text-lg hover:-translate-y-1 disabled:opacity-50">
              {loading ? t("ui.checking") : t("button.enter_portal")}
            </button>
            <p class="text-sm text-center mt-5 text-slate-400">
              <button onClick={() => { setAdminStep(2); setPersonalPin(""); }} class="text-amber-400 underline font-bold">
                {t('login.back')}
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
