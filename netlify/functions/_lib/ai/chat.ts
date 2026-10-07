import { normalizeWa, supabaseJson } from '../db/client.ts';
import { AI_SUBMISSION_COLS } from '../db/projections.ts';
import * as session from '../session';
import { requireRole } from '../../contexts/identity';
import {
  buildRingkasData,
  findMasterByWa,
  findCandidateByWaOrNull,
  findCandidateByIdOrNull,
  findAdminAiCandidateContext,
} from './cv';
import { geminiGenerate, parseJsonLoose } from './providers';
import { isVipCatatan, unwrapPayloadArgs, lastHistory, sanitizePromptField } from './interview-shared';
import { AppError, safeError } from '../kernel/errors';

/**
 * Turn an AI-layer failure into the outcome the client sees.
 *
 * The friendly Indonesian copy stays; what was missing is the CODE. Without it
 * a client cannot tell "the AI provider is down" from "your request was
 * rejected", so no banner is possible and monitoring has no signal at all.
 * `providers.ts` attaches deliberate, user-safe copy to AI_UNAVAILABLE, so that
 * message is preferred over the generic fallback when the code is known.
 */
function aiFailure(e: unknown, fallback: string): { error: string; code?: string; retryAfter?: number } {
  if (e instanceof AppError && e.code === 'AI_UNAVAILABLE') {
    // `safeError` is the sanctioned accessor for AppError copy — it returns
    // `detail || message`, both of which this codebase authors. Reading
    // `e.message` directly would trip the leak-guard in kernel/errors.test.ts,
    // and rightly so: that guard cannot tell deliberate copy from a library's
    // runtime text. Going through the helper keeps the guard meaningful
    // instead of teaching it an exception.
    return { error: safeError('', e), code: 'AI_UNAVAILABLE', retryAfter: e.retryAfter ?? 5 };
  }
  return { error: fallback };
}

/**
 * The chat-shaped failure. These surfaces render `reply` directly, so the
 * friendly copy stays there — but `success: false` is set as well, so an
 * outage answers **503** rather than 200. A code the transport contradicts is
 * a code no client can act on, and `outcomeStatusCode` only reads `code` when
 * `success === false`.
 */
function aiReplyFailure(e: unknown, fallback: string) {
  const f = aiFailure(e, fallback);
  return {
    success: false,
    reply: f.error,
    error: f.error,
    ...(f.code ? { code: f.code, retryAfter: f.retryAfter } : {}),
  };
}

// ---------------------------------------------------------------------------
// Auto-translate: isi field _jp yang kosong dari field _id (terjemahan ID→JP).
// Satu panggilan Gemini untuk semua field sekaligus supaya cepat & hemat kuota.
// ---------------------------------------------------------------------------
const AI_ID_JP_PAIRS: Array<{
  idPath: string[];
  jpPath: string[];
}> = [
  // medis
  { idPath: ['medis', 'alergi_id'], jpPath: ['medis', 'alergi_jp'] },
  { idPath: ['medis', 'riwayat_medis_id'], jpPath: ['medis', 'riwayat_medis_jp'] },
  { idPath: ['medis', 'riwayat_kecelakaan_id'], jpPath: ['medis', 'riwayat_kecelakaan_jp'] },
  // wawancara — keys must match buildMasterNested output exactly
  { idPath: ['wawancara', 'promosi_id'], jpPath: ['wawancara', 'promosi_jp'] },
  { idPath: ['wawancara', 'kelebihan_id'], jpPath: ['wawancara', 'kelebihan_jp'] },
  { idPath: ['wawancara', 'kekurangan_id'], jpPath: ['wawancara', 'kekurangan_jp'] },
  { idPath: ['wawancara', 'hobi_id'], jpPath: ['wawancara', 'hobi_jp'] },
  { idPath: ['wawancara', 'keahlian_id'], jpPath: ['wawancara', 'keahlian_jp'] },
  { idPath: ['wawancara', 'motivasi_id'], jpPath: ['wawancara', 'motivasi_jp'] },

  { idPath: ['wawancara', 'motivasi_ke_jepang'], jpPath: ['wawancara', 'motivasi_ke_jepang_jp'] },
  { idPath: ['wawancara', 'alasan_bidang_id'], jpPath: ['wawancara', 'alasan_bidang_jp'] },

  { idPath: ['wawancara', 'alasan_memilih_bidang'], jpPath: ['wawancara', 'alasan_memilih_bidang_jp'] },
  { idPath: ['wawancara', 'rencana_pulang_id'], jpPath: ['wawancara', 'rencana_pulang_jp'] },

  { idPath: ['wawancara', 'rencana_setelah_pulang'], jpPath: ['wawancara', 'rencana_setelah_pulang_jp'] },
  { idPath: ['wawancara', 'keinginan_id'], jpPath: ['wawancara', 'keinginan_jp'] },
  { idPath: ['wawancara', 'tujuan_ke_jepang'], jpPath: ['wawancara', 'tujuan_ke_jepang_jp'] },
  // identitas
  { idPath: ['identitas', 'tempat_lahir'], jpPath: ['identitas', 'tempat_lahir_jp'] },
  { idPath: ['identitas', 'agama'], jpPath: ['identitas', 'agama_jp'] },
  { idPath: ['identitas', 'status_nikah'], jpPath: ['identitas', 'status_nikah_jp'] },
  { idPath: ['identitas', 'alamat'], jpPath: ['identitas', 'alamat_jp'] },
  // kenalan_jepang
  { idPath: ['kenalan_jepang', 'nama_id'], jpPath: ['kenalan_jepang', 'nama_jp'] },
  { idPath: ['kenalan_jepang', 'hubungan_id'], jpPath: ['kenalan_jepang', 'hubungan_jp'] },
  { idPath: ['kenalan_jepang', 'pekerjaan_id'], jpPath: ['kenalan_jepang', 'pekerjaan_jp'] },
  { idPath: ['kenalan_jepang', 'alamat_id'], jpPath: ['kenalan_jepang', 'alamat_jp'] },
];;
function getNested(obj: any, path: string[]): string {
  let cur = obj;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return '';
    cur = cur[k];
  }
  return cur !== undefined && cur !== null ? String(cur) : '';
}

function setNested(obj: any, path: string[], val: string): void {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]] || typeof cur[path[i]] !== 'object') cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = val;
}

async function autoTranslateMissingJp(data: Record<string, any>): Promise<void> {
  const NL = String.fromCharCode(10);
  const pairs: Array<{ index: number; idText: string; jpPath: string[] }> = [];
  for (let i = 0; i < AI_ID_JP_PAIRS.length; i++) {
    const pair = AI_ID_JP_PAIRS[i];
    const idVal = getNested(data, pair.idPath).trim();
    const jpVal = getNested(data, pair.jpPath).trim();
    if (idVal && !jpVal) {
      pairs.push({ index: pairs.length, idText: idVal, jpPath: pair.jpPath });
    }
  }
  const arrayFieldPairs: Array<{ type: string; idKey: string; jpKey: string }> = [
    { type: 'pendidikan', idKey: 'sekolah', jpKey: 'sekolah_jp' },
    { type: 'pendidikan', idKey: 'jurusan_id', jpKey: 'jurusan_jp' },
    { type: 'pekerjaan', idKey: 'perusahaan', jpKey: 'perusahaan_jp' },
    { type: 'pekerjaan', idKey: 'jabatan', jpKey: 'jabatan_jp' },
    { type: 'keluarga', idKey: 'hubungan_id', jpKey: 'hubungan_jp' },
    { type: 'keluarga', idKey: 'pekerjaan', jpKey: 'pekerjaan_jp' },
  ];
  for (const afp of arrayFieldPairs) {
    const arr = Array.isArray(data[afp.type]) ? data[afp.type] : [];
    for (let i = 0; i < arr.length; i++) {
      const idVal = String((arr[i] && arr[i][afp.idKey]) || '').trim();
      const jpVal = String((arr[i] && arr[i][afp.jpKey]) || '').trim();
      if (idVal && !jpVal) {
        pairs.push({ index: pairs.length, idText: idVal, jpPath: [afp.type, String(i), afp.jpKey] });
      }
    }
  }
  if (pairs.length === 0) return;
  console.log('[autoTranslate] Translating ' + pairs.length + ' fields: ' + pairs.map(p => p.jpPath.join('.')).join(', '));
  const lines = pairs.map((p) => p.index + 1 + '. ' + p.idText).join(NL);
  const prompt = 'Terjemahkan Bahasa Indonesia ke Bahasa Jepang untuk CV kerja.' + NL + 'Kembalikan JSON: ' + String.fromCharCode(123) + '"0":"jp0","1":"jp1",...' + String.fromCharCode(125) + ' tanpa teks lain.' + NL + NL + lines;
  try {
    // `bestEffort: true` — WAJIB, dan bukan sekadar penanda kosmetik:
    //
    //   1. Terjemahan ini dipanggil LEBIH DULU daripada balasan chat, dan
    //      `breaker.check()` dipanggil sinkron sebelum await pertama. Dengan
    //      kunci breaker `gemini` yang sama, saat breaker `open` melewati
    //      cooldown, TERJEMAHAN yang mengambil probe `half-open` — lalu balasan
    //      yang ditunggu pengguna ditolak `SERVICE_UNAVAILABLE` ("Circuit
    //      breaker probing") padahal providernya sehat.
    //   2. Satu giliran yang gagal menyumbang DUA kegagalan pada ambang 3.
    //   3. Provider cadangan Grok disisakan untuk balasan, bukan untuk
    //      pekerjaan latar yang bisa disusulkan giliran berikutnya.
    //
    // Anggarannya juga lebih kecil dan tanpa hedge, karena `await translation`
    // di bawah membuat waktu balas ditentukan oleh yang LEBIH LAMBAT dari dua
    // panggilan.
    const r = await geminiGenerate(prompt, [], { bestEffort: true });
    const text = String(r && r.reply ? r.reply : '').trim();
    if (!text) { console.log('[autoTranslate] Empty response from Gemini'); return; }
    const parsed = parseJsonLoose(text);
    if (!parsed || typeof parsed !== 'object') return;
    for (let i = 0; i < pairs.length; i++) {
      const jp = String(parsed[String(i)] || '').trim();
      if (jp) setNested(data, pairs[i].jpPath, jp);
    }
  } catch (e) {
    console.error('[autoTranslateMissingJp] error:', (e as { message?: string })?.message || e);
  }
}

// ai/chat.js — domain AI chat & wawancara: Qween Jeklin (chat kandidat master),
// Jeklin copilot admin, Dede Jeklin (siswa baru), wawancara kerja (mensetsu)

// VIP / KELAS feature gate — imported from interview-shared (parity legacy
// js/03_candidate.ts isVipCatatan TIGHTENED: only literal [VIP] or [KELAS x];
// the old broad /\[[A-Z0-9]+\]/ regex matched ANY bracketed tag like [MCU]).
// SYNC legacy comment: js/03_candidate.ts:108 says backend must match.

// Skema data yang DIISI OTOMATIS ke form ai_form (kunci persis fieldPaths di
// js/pages/ai_form.js). AI diminta mengembalikan JSON {reply, data} — tanpa ini
// form tidak pernah terisi (dulu AI cuma balas teks).
const AI_FORM_DATA_INSTRUCTION =
  '\n\nPENTING — jawab SELALU dalam SATU objek JSON valid (tanpa teks lain, tanpa ```):\n' +
  '{"reply": "<balasan ramah untuk kandidat, dalam bahasa percakapan>", "data": <objek data di bawah>}\n' +
  'data harus berisi SEMUA data kandidat yang diketahui dari SELURUH percakapan, dengan kunci persis:\n' +
  '{"identitas": {"nama_lengkap","katakana","panggilan","panggilan_katakana","tempat_lahir","tgl_lahir","umur","gender","agama","golongan_darah","status_nikah","anak","email","alamat","hp","hp_darurat","ktp","paspor","sim"}, ' +
  '"fisik": {"tb","bb","topi","baju","sepatu","tangan_dominan","tahan_ac"}, ' +
  '"medis": {"mata_kiri","mata_kanan","kacamata","buta_warna","tato","rokok","alkohol","alergi_id","alergi_jp","riwayat_medis_id","riwayat_medis_jp","riwayat_kecelakaan_id","riwayat_kecelakaan_jp"}, ' +
  '"sertifikasi": {"bahasa_jepang","nilai","lisensi"}, ' +
  '"wawancara": {"keinginan_id","keinginan_jp","tujuan_ke_jepang","tujuan_ke_jepang_jp","riwayat_jepang","promosi_id","promosi_jp","kelebihan_id","kelebihan_jp","kekurangan_id","kekurangan_jp","hobi_id","hobi_jp","keahlian_id","keahlian_jp","motivasi_id","motivasi_jp","alasan_bidang_id","alasan_bidang_jp","rencana_pulang_id","rencana_pulang_jp","lama_di_jepang","harapan_gaji","harapan_tabungan"}, ' +
  '"kenalan_jepang": {"nama_id","nama_jp","hubungan_id","hubungan_jp","pekerjaan_id","pekerjaan_jp","usia","alamat_id","alamat_jp"}, ' +
  '"pendidikan": [{"tingkat","sekolah_id","sekolah_jp","jurusan_id","jurusan_jp","masuk","lulus"}], ' +
  '"pekerjaan": [{"perusahaan_id","perusahaan_jp","jabatan_id","jabatan_jp","masuk","keluar","gaji"}], ' +
  '"keluarga": [{"hubungan_id","hubungan_jp","nama","katakana","umur","pekerjaan_id","pekerjaan_jp","gaji"}]}\n' +
  'Aturan data: isi hanya field yang benar-benar diketahui dari percakapan (nilai bukan null, string kosong "" untuk yang belum); ' +
  'gender SELALU dinormalisasi ke "LAKI-LAKI" atau "PEREMPUAN"; ' +
  'JANGAN menebak/mengarang data yang tidak disebut kandidat; sertakan juga data yang sudah ada di DATA KANDIDAT SAAT INI.\n' +
  'Aturan bahasa field: field berakhiran "_id" = Bahasa Indonesia, field berakhiran "_jp" = Bahasa Jepang. ' +
  'Contoh: kelebihan_id = \"Disiplin\" (ID), kelebihan_jp = \"基準がある\" (JP). ' +
  'PROMOSI, KEBERHASILAN, KELEBIHAN, KEKURANGAN, HOBI, KEAHLIAN, MOTIVASI, ALASAN BIDANG, RENCANA PULANG: ' +
  'WAJIB isi KEDUANYA (_id DAN _jp) — jangan kosongkan salah satu.\n' +
  'TERJEMAHAN: Jika kandidat meminta terjemahkan/translate, WAJIB kembalikan JSON dengan SEMUA field _jp terisi dari _id. ' +
  'Contoh: kelebihan_id = \"Disiplin\" → kelebihan_jp = \"建局がある\". ' +
  'Untuk array (pendidikan, pekerjaan, keluarga): terjemahkan SEMUA baris.\n';

async function handleProcessAIChat(payload: unknown, sessionToken?: string) {
  // H4 FIX: require valid session for ALL flows — prevents free Gemini quota burn.
  const t = session.verifyToken(sessionToken);
  if (!t || (t.role !== 'admin' && t.role !== 'kandidat')) {
    return { success: false, sessionInvalid: true, message: 'Sesi tidak valid' };
  }
  // apiClient mengirim `payload: [args]`; legacy GAS mengirim objeknya langsung.
  // Membaca `p.history` dari sebuah ARRAY menghasilkan `undefined`, jadi Jeklin
  // kehilangan seluruh riwayat percakapan DAN blok "DATA KANDIDAT SAAT INI" pada
  // setiap giliran — persis lubang yang A16 tutup untuk processAiInterview.
  const p = unwrapPayloadArgs(payload);
  const flow = String(p.flow || 'master');
  // LOCK VIP (AGENTS.md §6): AI CV Master (flow=master) hanya untuk admin ATAU
  // kandidat ber-tag VIP/KELAS. Keputusan FINAL di server — jangan mengandalkan
  // guard frontend saja (bisa di-bypass dengan memanggil action langsung).
  if (flow === 'master') {
    const guard = requireRole(sessionToken as string, 'admin');
    const isAdmin = !guard.error;
    if (!isAdmin) {
      // H5 fix: source WA from the verified session claim (t.wa), never from
      // client-supplied currentData — a non-VIP could otherwise impersonate a
      // VIP number to open flow=master and burn Gemini quota.
      const wa = normalizeWa(String(t.wa || ''));
      if (wa) {
        let lookupError = false;
        let catatan = '';
        try {
          // `findCandidateByWaOrNull` juga mencatat saat lookup-nya TIDAK BISA
          // JALAN (skema bergeser) — dulu keadaan itu tidak terbedakan dari
          // "catatan kandidat memang kosong", sehingga gate VIP gagal-terbuka
          // tanpa jejak.
          const cand = await findCandidateByWaOrNull(wa);
          if (cand) {
            catatan = String(cand.catatan_internal || cand.catatan_int || cand.catatan_admin || '');
          } else {
            // Fallback: kandidat yang CV-nya cuma ada di master_database_candidate.
            const m = await findMasterByWa(wa);
            catatan = m
              ? String(m.catatan_internal || m.catatan_int || m.catatan || m.catatan_admin || '')
              : '';
          }
        } catch (_e) {
          // Error lookup → jangan blokir (fail-open, sama seperti guard frontend).
          lookupError = true;
        }
        if (!lookupError && !isVipCatatan(catatan)) {
          return {
            success: false,
            error:
              'Fitur AI CV Master eksklusif untuk Siswa ASJ (VIP / Kelas LPK). Hubungi Admin untuk akses.',
          };
        }
      }
    }
  }
  // Riwayat di-cap di SERVER, bukan hanya di klien. Frontend (AiCvForm,
  // AdminAiCopilot, SiswaBaruForm) memang sudah mengirim `.slice(-20)`, tapi itu
  // janji klien — dan klien bisa diganti. Tanpa cap di sini, riwayat yang panjang
  // membengkakkan prompt pada SETIAP giliran: latensi naik, biaya token naik,
  // dan akhirnya permintaan ditolak karena melewati jendela konteks model.
  // processAiInterview sudah memakai lastHistory sejak A16; tiga handler ini
  // belum, jadi aturannya berbeda-beda per alur.
  const history = lastHistory(p.history);
  const lang = String(p.lang || 'id');
  // `currentData` keluar sebagai `unknown` dari normalizer, sedangkan bentuk yang
  // diharapkan buildRingkasData/autoTranslateMissingJp adalah objek bersarang.
  // Disempitkan SEKALI di sini supaya tiga pemakaian di bawah tidak perlu cast.
  const currentData = (p.currentData && typeof p.currentData === 'object'
    ? p.currentData
    : {}) as Record<string, unknown>;
  const ringkas = buildRingkasData(currentData);
  const system =
    'Kamu adalah Qween Jeklin, HRD Virtual LPK ASJ (PT Amanah Sakura Japan), perusahaan penyalur kerja ke Jepang. ' +
    'Tugasmu membantu kandidat melengkapi data Master (identitas, fisik, medis, pendidikan, pekerjaan, keluarga, ' +
    'sertifikasi, wawancara) untuk CV kerja Jepang. Balas ramah & singkat dalam bahasa ' +
    (lang === 'jp' ? 'Jepang' : 'Indonesia') +
    '. Jika kandidat memberi data baru, konfirmasi dan minta data berikutnya yang kurang. Flow aktif: ' +
    flow +
    '.' +
    (ringkas
      ? '\n\nDATA KANDIDAT SAAT INI (sudah terisi di database):\n' +
        ringkas +
        '\n\nAturan: JANGAN menanyakan ulang data yang sudah terisi di atas, dan jangan mengaku data itu kosong. ' +
        'Kalau kandidat bertanya tentang data yang sudah ada, jawab pakai data tersebut. ' +
        'Tanyakan hanya data yang TIDAK tercantum di atas.'
      : '') +
    AI_FORM_DATA_INSTRUCTION;
  try {
    // Terjemahan field _jp dan balasan chat TIDAK saling bergantung: prompt
    // terjemahan dibangun dari `currentData`, bukan dari jawaban model. Menjalankan
    // keduanya berurutan berarti menjumlahkan latensinya — di jalur terburuk
    // 4 dtk (chat) + 4 dtk (terjemahan) = 8 dtk dari deadline 12 dtk — padahal
    // keduanya bisa tumpang tindih. Sekarang dijalankan paralel.
    //
    // autoTranslateMissingJp sudah menangkap error-nya sendiri (dan tidak
    // memanggil provider sama sekali kalau tidak ada field _jp yang kosong).
    // `catch` di sini hanya jaring supaya promise yang tidak sempat di-await —
    // saat balasan chat kosong — tidak menjadi unhandled rejection.
    const translation = autoTranslateMissingJp(currentData).catch(() => {});
    const r = await geminiGenerate(system, history);
    const text = String(r && r.reply ? r.reply : '').trim();
    if (text) {
      try {
        const parsed = parseJsonLoose(text);
        if (parsed && typeof parsed === 'object' && parsed.reply) {
          const aiData = parsed.data && typeof parsed.data === 'object' ? parsed.data : undefined;
          // Auto-translate: isi field _jp yang kosong dari field _id
          // Run on p.currentData (full form data from DB+AI) — not just aiData,
          // because AI often returns only _id without _jp for some fields.
          // autoTranslateMissingJp only calls Gemini for fields where _id exists
          // but _jp is empty, so no duplicate translations.
          await translation;
          // Merge translated JP fields from p.currentData back into aiData
          // so the frontend receives the translated values.
          if (aiData) {
            for (const pair of AI_ID_JP_PAIRS) {
              const jpVal = getNested(currentData, pair.jpPath);
              if (jpVal && !getNested(aiData, pair.jpPath)) {
                setNested(aiData, pair.jpPath, jpVal);
              }
            }
          }
          return {
            // `success: true` disengaja: `handlers.ts` mencatat
            // `handler.end { action, success: out?.success }`, dan tanpa kunci ini
            // log-nya menulis `undefined` untuk aksi AI yang paling ramai —
            // satu-satunya aksi yang statusnya tidak terbaca dari log.
            success: true,
            reply: String(parsed.reply),
            data: aiData || {},
          };
        }
      } catch (_e) {
        /* bukan JSON — fallback balas teks biasa */
      }
      return { success: true, reply: text };
    }
    return { success: true, reply: String(r?.reply || '') };
  } catch (e) {
    // Jangan bocorkan detail error mentah ke user — log detailnya di server saja.
    console.error('[AI] processAIChat error:', (e as { message?: string })?.message || e);
    return aiReplyFailure(e, 'Maaf, asisten AI sedang sibuk. Coba lagi beberapa saat ya!');
  }
}

async function handleProcessAdminAIChat(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken as string, 'admin');
  if (guard.error) return guard.error;
  const d = ((payload && payload[0]) || {}) as Record<string, any>;
  // Cap riwayat SEBELUM giliran baru disisipkan, supaya pesan yang baru diketik
  // admin tidak pernah ikut terpotong. Lihat catatan cap di handleProcessAIChat.
  //
  // PENTING — `d.message` disisipkan HANYA kalau riwayat tidak memuatnya di
  // ujung. Klien (`AdminAiCopilot.handleSend`) memasukkan bubble admin ke state
  // LEBIH DULU lalu mengirim `history: messages.slice(-20)` *dan* `message`
  // terpisah; tanpa pemeriksaan ini giliran terakhir muncul DUA KALI di prompt
  // (dua entri role 'user' berurutan), karena `trimTrailingModelTurn` hanya
  // membuang giliran `model` di ujung.
  const history = lastHistory(d.history);
  const lastMsg = d.message ? String(d.message) : '';
  const tail = history.length ? history[history.length - 1] : undefined;
  const tailContent = tail ? String((tail as Record<string, unknown>).content ?? '') : '';
  if (lastMsg && !(tailContent === lastMsg && (tail as Record<string, unknown>).role === 'user')) {
    history.push({ role: 'user', content: lastMsg });
  }

  // Data kandidat yang sedang dibahas.
  //
  // Dulu satu-satunya yang sampai ke model adalah ID-nya — padahal system prompt
  // di bawah MEMINTA "bantu analisis data kandidat". Model diminta menganalisis
  // data yang tidak pernah diterimanya, jadi setiap jawabannya generik walaupun
  // panggilan providernya tetap dibayar. Klien (`AdminAiCopilot.tsx:151`) memang
  // hanya mengirim `candidateId`, jadi datanya harus diambil di sini — dan
  // mesinnya sudah ada: `findAdminAiCandidateContext` + `buildRingkasData`,
  // yang justru sudah dipakai alur CV.
  //
  // Best-effort: kegagalan lookup TIDAK boleh menggagalkan chat. Dan blok
  // konteksnya ABSEN kalau kandidatnya tidak bisa dibaca — bukan kosong —
  // karena blok kosong akan membuat model menyangka kandidatnya memang tidak
  // punya data sama sekali.
  let ringkasKandidat = '';
  if (d.candidateId || d.wa) {
    try {
      const ctx = await findAdminAiCandidateContext(d as Record<string, unknown>);
      if (ctx) ringkasKandidat = buildRingkasData(ctx);
    } catch {
      /* konteks opsional — chat tetap jalan */
    }
  }

  // `adminName` dan `candidateId` SAMA-SAMA datang dari klien dan ditempel ke
  // system prompt, jadi keduanya lewat `sanitizePromptField` seperti nilai klien
  // lain di berkas ini. Sebelumnya keduanya mentah: adminName bisa memuat baris
  // baru dan memalsukan blok instruksi (persis yang dicegah di alur siswa), dan
  // candidateId adalah satu-satunya nilai klien di prompt admin yang belum
  // melewati gerbang.
  const system =
    'Kamu adalah Jeklin, asisten HRD admin ASJ (PT Amanah Sakura Japan). Admin: ' +
    sanitizePromptField(d.adminName) +
    '. ' +
    'Kandidat yang sedang dibahas ID: ' +
    (sanitizePromptField(d.candidateId) || '-') +
    '. ' +
    'Bantu analisis data kandidat, saran rekrutmen, dan jawaban profesional. Balas singkat & jelas dalam Bahasa Indonesia.' +
    (ringkasKandidat
      ? // Batas eksplisit antara INSTRUKSI dan DATA (lihat blok siswa untuk alasan
        // yang sama). Delimiter membuat model tidak memperlakukan isi field sebagai
        // lanjutan perintah. Isi field tetap ada — yang dijamin STRUCTURE-nya.
        '\n\nDATA KANDIDAT SAAT INI (sudah terisi di database):\n<<<DATA\n' +
        ringkasKandidat +
        '\nDATA>>>\n\nAturan: pakai data di atas sebagai dasar analisis. Jangan mengarang field yang tidak tercantum.'
      : '');
  try {
    const r = await geminiGenerate(system, history);
    // `suggestedActions`/`analysis` DULU di sini sebagai literal `[]`/`null`.
    // Tidak ada satu pun jalur yang mengisinya, sementara klien
    // (`AdminAiCopilot.tsx`) membacanya dan merendernya sebagai chip tombol —
    // janji dua sisi yang tidak pernah diproduksi di sisi mana pun. Field-nya
    // dihapus dari kontrak, bukan dibiarkan sebagai `null` yang menyamar fitur.
    return { success: true, reply: r.reply };
  } catch (e) {
    // Jangan bocorkan detail error mentah ke admin — log detailnya di server saja.
    console.error('[AI] processAdminAIChat error:', (e as { message?: string })?.message || e);
    return { success: false, ...aiFailure(e, 'Asisten AI sedang sibuk. Coba lagi beberapa saat ya!') };
  }
}

/**
 * Ringkasan data siswa baru untuk system prompt Dede Jeklin.
 *
 * Klien (`SiswaBaruForm.tsx:196`) SUDAH mengirim `currentData` berisi field yang
 * baru diisi, dan handler ini dulu MEMBUANGNYA — sehingga Dede menanyakan ulang
 * data yang baru saja diisi siswa. Alur CV menyuntikkan `buildRingkasData`
 * sebagai "DATA KANDIDAT SAAT INI"; alur siswa tidak menyuntikkan apa pun.
 *
 * Bentuknya berbeda dari alur CV: payload siswa itu snake_case DATAR
 * (`toSnakePayload(biodata)`), bukan bersarang, jadi ia butuh formatter sendiri
 * alih-alih `buildRingkasData` yang mengharapkan `identitas.nama_lengkap` dsb.
 *
 * Field kosong DILEWATI, bukan ditulis sebagai label menggantung: "Nama: " tanpa
 * nilai akan membuat model mengira fieldnya ada dan kosong.
 */
const SISWA_FIELDS: Array<[string, string]> = [
  ['nama', 'Nama'],
  ['ttl', 'Tempat/tanggal lahir'],
  ['gender', 'Gender'],
  ['agama', 'Agama'],
  ['alamat', 'Alamat'],
  ['email', 'Email'],
  ['pendidikan', 'Pendidikan'],
  ['wa_siswa', 'WA siswa'],
  ['wa_ortu', 'WA orang tua'],
];

function buildSiswaRingkas(cur: unknown): string {
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return '';
  const rec = cur as Record<string, unknown>;
  const lines: string[] = [];
  for (const [key, label] of SISWA_FIELDS) {
    // `sanitizePromptField`: nilai ini datang dari KLIEN di alur yang PUBLIK,
    // jadi ia tidak boleh bisa memecah baris di dalam prompt (lihat catatan di
    // interview-shared.ts).
    const s = sanitizePromptField(rec[key]);
    if (s && s !== '-') lines.push(`${label}: ${s}`);
  }
  return lines.join('\n');
}

async function handleProcessSiswaAIChat(payload: unknown) {
  // Sama seperti processAIChat: apiClient membungkus argumen jadi array, jadi
  // `p.history` harus di-unwrap dulu atau Dede Jeklin kehilangan riwayatnya.
  const p = unwrapPayloadArgs(payload);
  // `currentData` yang dikirim klien ikut masuk prompt. Bloknya ABSEN kalau
  // tidak ada field yang terisi — bukan blok kosong.
  const ringkasSiswa = buildSiswaRingkas(p.currentData);
  const system =
    'Kamu adalah Dede Jeklin, asisten pendaftaran siswa baru LPK ASJ. Bantu siswa/orang tua melengkapi form ' +
    '(nama, TTL, gender, agama, alamat, email, pendidikan, WA siswa, WA ortu). Balas ramah dan singkat dalam Bahasa Indonesia.' +
    (ringkasSiswa
      ? '\n\nDATA SISWA SAAT INI (sudah diisi di form):\n' +
        ringkasSiswa +
        '\n\nAturan: JANGAN menanyakan ulang data yang sudah terisi di atas.'
      : '') +
    '\n' +
    'PENTING — jawab SELALU dalam SATU objek JSON valid (tanpa teks lain, tanpa ```):\n' +
    '{"reply": "<balasan ramah>", "data": {"nama": "...", "ttl": "...", "gender": "LAKI-LAKI atau PEREMPUAN", "agama": "...", "alamat": "...", "email": "...", "pendidikan": "...", "wa_siswa": "...", "wa_ortu": "..."}}\n' +
    'Isi hanya field yang diketahui dari percakapan; yang belum diketahui biarkan "" (string kosong). ' +
    'Normalisasi gender SELALU ke "LAKI-LAKI" atau "PEREMPUAN" (jangan L/P).';
  try {
    // Cap riwayat di server (paritas processAIChat/processAdminAIChat).
    const r = await geminiGenerate(system, lastHistory(p.history));
    const text = String(r && r.reply ? r.reply : '').trim();
    if (text) {
      try {
        const parsed = parseJsonLoose(text);
        if (parsed && typeof parsed === 'object' && parsed.reply) {
          return {
            success: true,
            reply: String(parsed.reply),
            data: parsed.data && typeof parsed.data === 'object' ? parsed.data : undefined,
          };
        }
      } catch (_e) {
        /* bukan JSON — fallback balas teks biasa */
      }
      return { success: true, reply: text };
    }
    return { success: true, reply: String(r?.reply || '') };
  } catch (e) {
    return aiReplyFailure(e, 'Maaf, jaringan AI sedang sibuk. Coba lagi ya!');
  }
}

// ---------------------------------------------------------------------------
// Model wawancara per bidang SSW (Tokutei Ginou) — gaya dokumen isian
// wawancara tim (14 pertanyaan: ID + romaji + panduan jawaban).
// ---------------------------------------------------------------------------
const BIDANG_INTERVIEW = {
  kaigo: {
    label: 'Kaigo (介護)',
    extra: [
      'Apa saja tugas utama seorang kaigo / caregiver? Jelaskan dengan contoh.',
      'Bagaimana cara menghadapi lansia yang sedang marah, bingung, atau susah diatur?',
      'Apa yang kamu ketahui tentang sertifikat Kaigo Fukushishi / ujian Kouka Shiken di Jepang?',
      'Apakah kamu punya pengalaman merawat anggota keluarga yang lanjut usia? Ceritakan.',
    ],
  },
  shokuhin: {
    label: 'Shokuhin Seizou (食品製造)',
    extra: [
      'Pernahkah kamu bekerja di produksi/pengolahan makanan? Ceritakan pengalamanmu.',
      'Apa yang kamu ketahui tentang kebersihan dan keamanan pangan (food safety)?',
      'Bagaimana perasaanmu bekerja shift malam atau lembur?',
      'Apakah kamu bisa bekerja cepat, teliti, dan mengikuti SOP dengan disiplin?',
    ],
  },
  nougyou: {
    label: 'Nougyou (農業)',
    extra: [
      'Apakah kamu pernah bekerja di sawah/ladang? Ceritakan pengalamanmu.',
      'Bagaimana perasaanmu bekerja di luar ruangan dengan cuaca panas/dingin?',
      'Apakah fisikmu kuat untuk kerja lapangan yang berat?',
      'Apa yang kamu ketahui tentang teknologi pertanian Jepang?',
    ],
  },
  kensetsu: {
    label: 'Kensetsu (建設)',
    extra: [
      'Apakah kamu pernah bekerja di proyek bangunan? Ceritakan pengalamanmu.',
      'Apa yang kamu ketahui tentang keselamatan kerja (anzen) di lokasi konstruksi?',
      'Bagaimana perasaanmu bekerja di ketinggian atau di luar ruangan?',
      'Apakah kamu bisa bekerja dengan alat berat / mesin?',
    ],
  },
  jidousha: {
    label: 'Jidousha Seibi (自動車整備)',
    extra: [
      'Apakah kamu punya pengalaman di bengkel atau perawatan kendaraan? Ceritakan.',
      'Apa yang kamu ketahui tentang alat-alat bengkel dan keselamatan kerjanya?',
      'Apakah kamu teliti dan sabar mengerjakan detail mekanik?',
      'Apakah kamu bisa membaca manual / mengikuti instruksi teknis?',
    ],
  },
  binbou: {
    label: 'Binbou (ビルクリーニング)',
    extra: [
      'Apakah kamu pernah bekerja cleaning service? Ceritakan pengalamanmu.',
      'Apa yang kamu ketahui tentang cara membersihkan bangunan/gedung secara profesional?',
      'Apakah kamu teliti dan bertanggung jawab dengan detail kecil?',
      'Bagaimana perasaanmu bekerja sendiri di malam hari?',
    ],
  },
  sougou: {
    label: 'Sougou Service (総合サービス)',
    extra: [
      'Apakah kamu punya pengalaman melayani pelanggan? Ceritakan.',
      'Bagaimana cara kamu menghadapi pelanggan yang sedang komplain?',
      'Apa itu omotenashi? Bagaimana kamu menerapkannya?',
      'Apakah kamu bisa ramah dan sopan dalam bahasa Jepang?',
    ],
  },
};
const BIDANG_DEFAULT = {
  label: 'SSW (Tokutei Ginou)',
  extra: [
    'Apakah kamu punya pengalaman kerja di bidang ini? Ceritakan secara detail.',
    'Apa yang kamu ketahui tentang pekerjaan SSW yang kamu lamar?',
    'Menurutmu apa yang paling berat dari bidang ini? Bagaimana kamu mengatasinya?',
    'Kenapa kamu memilih bidang pekerjaan ini?',
  ],
};

function normalizeBidang(raw: unknown) {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (/kaigo|kaig|caregiver|perawat.?lansia|care.?giving/.test(s)) return BIDANG_INTERVIEW.kaigo;
  if (/shokuhin|syokuhin|food|makanan|ryouri|seizou/.test(s)) return BIDANG_INTERVIEW.shokuhin;
  if (/nougyou|noukou|agricultur|pertanian|sawah|farming/.test(s)) return BIDANG_INTERVIEW.nougyou;
  if (/kensetsu|konstruksi|construction|bangunan/.test(s)) return BIDANG_INTERVIEW.kensetsu;
  if (/jidousha|seibi|otomotif|automotif|auto.?maint/.test(s)) return BIDANG_INTERVIEW.jidousha;
  if (/binbou|cleaning|kebersihan|sapu|bencah/.test(s)) return BIDANG_INTERVIEW.binbou;
  if (/sougou|service|pelayanan|omotenashi|restoran|hotel/.test(s)) return BIDANG_INTERVIEW.sougou;
  return null;
}

// Resolve bidang + nama kandidat dari WA (master dulu, fallback kandidat).
async function resolveProfilKandidat(wa: string) {
  const want = normalizeWa(String(wa || ''));
  if (!want) return null;
  let nama = '';
  let bidangRaw = '';
  try {
    const m = await findMasterByWa(want);
    if (m) {
      nama = String(m.nama_lengkap || '');
      bidangRaw = String(m.bidangssw || m.ssw || m.bidang || m.lisensi || '');
    }
  } catch (_e) {
    /* opsional */
  }
  if (!nama || !bidangRaw) {
    try {
      // `findCandidateByWaOrNull` membedakan "tidak ada" dari "lookup tidak bisa
      // jalan" dan MENCATAT yang kedua — lihat catatannya di cv.ts. Pola lama
      // (`findCandidates()` sebagai fallback) tidak pernah bisa menemukan apa pun.
      const c = await findCandidateByWaOrNull(want);
      if (c) {
        if (!nama) nama = String(c.nama || c.nama_lengkap || '');
        if (!bidangRaw) bidangRaw = String(c.bidang || c.ssw || c.bidangssw || '');
      }
    } catch (_e2) {
      /* opsional */
    }
  }
  return { wa: want, nama, bidang: normalizeBidang(bidangRaw) || BIDANG_DEFAULT, bidangRaw };
}

function buildInterviewSystem(profil: { nama?: string; bidang?: { label: string; extra: string[] } }, kota: string) {
  const b = profil.bidang || BIDANG_DEFAULT;
  const lines = [
    'Kamu adalah Jeklin Sensei, pewawancara kerja (mensetsu) Jepang untuk LPK ASJ (PT Amanah Sakura Japan).',
    'Kandidat: ' + (profil.nama || 'Kandidat') + '-san. Bidang SSW: ' + b.label + '.',
    'Kota penempatan: ' + (kota || 'belum ditentukan') + '.',
    'LAKUKAN WAWANCARA SEPERTI PEWAWANCARA ASLI (bukan kuesioner, bukan dokumen isian):',
    '- Buka dengan sapaan hangat singkat, lalu minta perkenalan singkat (jikoshoukai).',
    '- Tanyakan SATU pertanyaan per pesan dengan bahasa alami; untuk kalimat kunci, tambahkan romaji singkat dalam kurung (mis. "Hobi kamu apa? (shumi wa nandesu ka?)").',
    '- DENGARKAN jawaban kandidat, beri reaksi natural (puji/klarifikasi), lalu follow-up untuk menggali lebih dalam bila perlu.',
    '- JANGAN PERNAH menampilkan nomor pertanyaan, daftar/urutan, atau format "1. 2. 3.".',
    '- Wajib gali topik berikut secara alami bila belum terjawab (dalam urutan wajar seperti pewawancara sungguhan):',
    '  • Perkenalan & alasan melamar (kenapa bidang ' + b.label + ').',
    '  • Hobi / aktivitas fisik.',
    '  • Pengalaman kerja terkait bidang (detail!).',
    '  • Kelebihan & kekurangan.',
    '  • Motivasi ke Jepang, berapa lama ingin bekerja (target 5 tahun+, sertifikat/bahasa).',
    '  • Pengetahuan tentang kota penempatan.',
    '  • Pengetahuan tentang pekerjaan ' + b.label + ' dan hal terberatnya.',
    '  • Rencana setelah pulang ke Indonesia.',
    '  • Pertanyaan balik untuk perusahaan.',
    'Topik khas bidang ' + b.label + ' (tanyakan dengan santai):',
  ];
  lines.push.apply(
    lines,
    b.extra.map((q, i) => '  • ' + (i + 1) + ') ' + q),
  );
  lines.push(
    'TUTUP wawancara dengan sopan (doumo arigatou gozaimasu + semangat) ketika semua topik inti sudah terjawab ATAU kandidat menutup pembicaraan.',
    'Di pesan PENUTUP, setelah teks terima kasih, tambahkan baris persis "===HASIL===" lalu JSON TUNGGAL tanpa teks lain:',
    '{ "score": 0-10, "nilai": "A/B/C", "rekomendasi": "...", "biodata": { kunci camelCase — hanya field yang KANDIDAT sebutkan: nama, furigana, tempatLahir, tglLahir, alamat, email, gender, hobi, kelebihan, kekurangan, motivasiJepang, tujuanJepang, keinginan, rencanaPulang, promosi, keahlianKhusus, eksJepang, gajiYen, tabungan, bhsJepang, nilai, lisensi, ssw, noPaspor, noCoe, daruratNama, daruratWa, pendidikan: [{tingkat, namaSekolah, jurusan, tahunMasuk, tahunLulus}], pekerjaan: [{namaPerusahaan, jabatan, tahunMasuk, tahunKeluar}] }, "catatan": "..." }',
    'Balas dalam Bahasa Indonesia, ramah dan profesional seperti sensei asli.',
  );
  return lines.join('\n');
}

async function handleProcessAiInterview(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken as string, 'kandidat');
  if (guard.error) return guard.error;
  // Legacy GAS sent an OBJECT {wa,...}; apiClient/job queue send an ARRAY of
  // args — unwrap both (A16: every sibling handler unwraps payload[0]; this
  // one did not, so wa/candidateName/history were dropped on every turn).
  const p = unwrapPayloadArgs(payload);
  const profil = await resolveProfilKandidat(String(p.wa || p.waTarget || ''));
  const system = buildInterviewSystem(
    profil || {
      nama: String(p.candidateName || ''),
      bidang: normalizeBidang(p.bidang) || BIDANG_DEFAULT,
    },
    String(p.kota || p.jobKota || ''),
  );
  try {
    return await geminiGenerate(system, lastHistory(p.history));
  } catch (e) {
    return aiReplyFailure(e, 'Maaf, jaringan AI sedang sibuk. Coba lagi ya!');
  }
}

// ---------------------------------------------------------------------------
// generateWawancaraModel — admin: hasilkan DOKUMEN model wawancara lengkap
// (14 pertanyaan: ID + romaji + panduan jawaban ID/romaji/kanji) per kandidat
// sesuai bidang SSW-nya — bisa langsung disalin ke Google Sheet kandidat.
// ---------------------------------------------------------------------------
async function handleGenerateWawancaraModel(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken as string, 'admin');
  if (guard.error) return guard.error;
  const d = ((payload && payload[0]) || {}) as Record<string, any>;
  // Resolve WA dari candidateId (sama seperti parseDokumenBiodata) atau wa eksplisit.
  let wa = normalizeWa(String(d.wa || ''));
  if (!wa && d.candidateId) {
    const cand = await findCandidateByIdOrNull(String(d.candidateId));
    if (cand) wa = normalizeWa(String(cand.no_wa || ''));
  }
  if (!wa) {
    return {
      success: false,
      error: 'Nomor WA kandidat tidak ditemukan — pilih kandidat dulu atau isi nomor WA.',
    };
  }
  const profil = await resolveProfilKandidat(wa);
  // Bidang bisa di-override admin (berguna untuk kandidat yang belum terdaftar
  // di DB — mis. Herlina belum daftar, admin tinggal ketik bidangnya).
  const b = normalizeBidang(d.bidang) || (profil && profil.bidang) || BIDANG_DEFAULT;
  const kota = String(d.kota || d.jobKota || '');
  const system =
    'Kamu adalah Jeklin, asisten HRD LPK ASJ (PT Amanah Sakura Japan).' +
    'Buatkan MODEL WAWANCARA KERJA JEPANG untuk kandidat ' +
    ((profil && profil.nama) || 'kandidat') +
    ' (bidang SSW: ' +
    b.label +
    (kota ? ', kota penempatan: ' + kota : '') +
    '), format PERSIS seperti dokumen isian yang dibagikan tim ke kandidat:' +
    '\n- 14 pertanyaan bernomor 1-14.' +
    '\n- Setiap pertanyaan: judul Bahasa Indonesia + pertanyaan romaji dalam kurung (contoh: "Hobi kamu apa? (shumi wa nandesu ka?)").' +
    '\n- Di bawahnya: "jawaban translate kanji alfabet (watashiwa):" lalu panduan jawaban romaji, kemudian arti Indonesia.' +
    '\n- Untuk kalimat kunci sertakan kanji di akhir sebagai catatan "kanji wajib di isi boleh menyusul".' +
    '\n- Masukkan pertanyaan khusus bidang ' +
    b.label +
    ' (pengalaman kerja bidang, hal terberat, pengetahuan pekerjaan, kenapa memilih bidang ini).' +
    '\n- Nomor 14: pertanyaan ke perusahaan (2 pertanyaan) + penutup (doumo arigatou gozaimasu + ojigi).' +
    '\n- Tambahkan juga instruksi di awal dokumen: "SILAHKAN ISI DI DRIVE INI (TANPA DOWNLOAD FILE)" dan catatan bahwa jawaban akan diperbaiki sensei.' +
    '\nKembalikan HANYA teks dokumen lengkap siap salin, tanpa penjelasan tambahan.';
  try {
    const r = await geminiGenerate(system, []);
    return {
      success: true,
      model: r.reply,
      bidang: b.label,
      nama: (profil && profil.nama) || '',
      wa,
    };
  } catch (e) {
    console.error('[AI] generateWawancaraModel error:', (e as { message?: string })?.message || e);
    return { success: false, ...aiFailure(e, 'Gagal membuat model wawancara. Coba lagi beberapa saat ya!') };
  }
}

// ---------------------------------------------------------------------------
// boundTranscript — batasi transkrip wawancara yang ditempel ke system prompt.
//
// Satu-satunya tempat di lapisan AI yang sengaja TIDAK memakai cap berbasis
// jumlah giliran: di sini transkrip adalah MUATAN-nya, bukan konteks tambahan,
// jadi memotong per giliran berarti membuang isi wawancara. Tapi tanpa batas
// sama sekali, wawancara 60 giliran menempel utuh ke system prompt pada satu
// permintaan — prompt yang membengkak, dan akhirnya penolakan karena melewati
// jendela konteks.
//
// Jendela KEPALA + EKOR, bukan ekor saja: bagian awal berisi jikoshoukai dan
// biodata (nama, TTL, pendidikan, pengalaman) yang justru paling sering masuk
// ke `biodata` di hasil rangkuman, sementara bagian akhir berisi jawaban
// terbaru. Yang dibuang hanya bagian tengah, dan pembuangannya DITANDAI di
// dalam prompt supaya model tahu ada bagian yang tidak dibacanya — bukan
// menyangka wawancaranya memang sependek itu.
const TRANSCRIPT_HEAD_CHARS = 4000;
const TRANSCRIPT_TAIL_CHARS = 8000;

function boundTranscript(text: string): string {
  const budget = TRANSCRIPT_HEAD_CHARS + TRANSCRIPT_TAIL_CHARS;
  if (text.length <= budget) return text;
  const dropped = text.length - budget;
  return (
    text.slice(0, TRANSCRIPT_HEAD_CHARS) +
    `\n\n[... ${dropped} karakter bagian tengah transkrip dipotong agar muat ...]\n\n` +
    text.slice(-TRANSCRIPT_TAIL_CHARS)
  );
}

// ---------------------------------------------------------------------------
// selesaikanWawancara — kandidat: dari TRANSCRIPT wawancara yang sudah jalan,
// buat JSON hasil wawancara {score, nilai, rekomendasi, biodata, catatan}.
// Dipanggil saat kandidat klik "Selesai & Kirim Hasil" (deterministik, tidak
// bergantung AI menulis marker di tengah chat).
// ---------------------------------------------------------------------------
async function handleSelesaikanWawancara(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken as string, 'kandidat');
  if (guard.error) return guard.error;
  const d = ((payload && payload[0]) || {}) as Record<string, any>;
  const profil = await resolveProfilKandidat(d.wa || '');
  const b = (profil && profil.bidang) || BIDANG_DEFAULT;
  const history = Array.isArray(d.history) ? d.history : [];
  const transkrip = boundTranscript(
    history
      .map((h) => {
        const role = h && h.role === 'assistant' ? 'Jeklin' : 'Kandidat';
        return role + ': ' + String((h && h.content) || '');
      })
      .join('\n'),
  );
  const system =
    'Kamu adalah Jeklin Sensei, pewawancara kerja Jepang untuk LPK ASJ. Kandidat: ' +
    (profil && profil.nama ? profil.nama + '-san' : 'kandidat') +
    ', bidang SSW: ' +
    b.label +
    '.\nDi bawah ini TRANSCRIPT wawancara:\n---\n' +
    (transkrip || '(kandidat belum menjawab apa pun)') +
    '\n---\nBuat RINGKASAN HASIL WAWANCARA dalam JSON TUNGGAL (tanpa teks lain):\n' +
    '{ "score": 0-10, "nilai": "A/B/C", "rekomendasi": "saran perbaikan singkat", "biodata": { kunci camelCase — HANYA data yang kandidat SEBUTKAN: nama, furigana, tempatLahir, tglLahir, alamat, email, gender, hobi, kelebihan, kekurangan, motivasiJepang, tujuanJepang, keinginan, rencanaPulang, promosi, keahlianKhusus, eksJepang, gajiYen, tabungan, bhsJepang, nilai, lisensi, ssw, noPaspor, noCoe, daruratNama, daruratWa, pendidikan: [{tingkat, namaSekolah, jurusan, tahunMasuk, tahunLulus}], pekerjaan: [{namaPerusahaan, jabatan, tahunMasuk, tahunKeluar}] }, "catatan": "hal yang perlu diperbaiki kandidat" }';
  try {
    const r = await geminiGenerate(system, []);
    const hasil = parseJsonLoose(r.reply);
    if (!hasil || typeof hasil !== 'object' || Array.isArray(hasil)) {
      return { success: false, error: 'AI gagal merangkum hasil wawancara. Coba lagi.' };
    }
    return { success: true, hasil };
  } catch (e) {
    console.error('[AI] selesaikanWawancara error:', (e as { message?: string })?.message || e);
    return { success: false, ...aiFailure(e, 'Gagal merangkum hasil wawancara. Coba lagi beberapa saat ya!') };
  }
}

// ---------------------------------------------------------------------------
// simpanHasilWawancara — kandidat: simpan hasil wawancara AI (JSON dari
// penutup wawancara, format {score, nilai, rekomendasi, biodata, catatan})
// ke ai_form_submissions (submitted_via='interview') supaya admin bisa lihat
// & update biodata dari hasil wawancara.
// ---------------------------------------------------------------------------
async function handleSimpanHasilWawancara(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken as string, 'kandidat');
  if (guard.error) return guard.error;
  const d = ((payload && payload[0]) || {}) as Record<string, any>;
  // IDOR fix: hasil wawancara selalu di-scope ke WA dari sesi, bukan payload klien.
  const wa = normalizeWa(String((guard.token && guard.token.wa) || ''));
  if (!wa) return { success: false, error: 'Nomor WA tidak ditemukan.' };
  const hasil = d.hasil || {};
  if (!hasil || typeof hasil !== 'object' || Array.isArray(hasil)) {
    return { success: false, error: 'Hasil wawancara kosong/tidak valid.' };
  }
  try {
    const rows = await supabaseJson('GET', 'ai_form_submissions', {
      query: { select: AI_SUBMISSION_COLS, wa: 'eq.' + wa, submitted_via: 'eq.interview', limit: 100 },
    });
    // Discriminator: submitted_via='interview' (mode/status tabel ini punya
    // CHECK constraint — pakai nilai yang diizinkan: AI_MASTER/MENUNGGU).
    const existing = (Array.isArray(rows) ? rows : []).find(
      (r) =>
        normalizeWa(String(r.wa || '')) === wa && String(r.submitted_via || '') === 'interview',
    );
    const bio = (hasil.biodata || {}).nama || '';
    const body = {
      wa,
      mode: 'AI_MASTER',
      job_code: 'UMUM',
      bidang: '-',
      status: 'MENUNGGU',
      submitted_via: 'interview',
      ai_data_json: JSON.stringify(hasil),
      nama_lengkap: bio,
      updated_at: new Date().toISOString(),
    };
    if (existing && existing.id !== undefined) {
      await supabaseJson('PATCH', 'ai_form_submissions', {
        query: { id: 'eq.' + existing.id },
        body,
        headers: { Prefer: 'return=minimal' },
      });
    } else {
      await supabaseJson('POST', 'ai_form_submissions', {
        body: Object.assign({ created_at: new Date().toISOString() }, body),
        headers: { Prefer: 'return=minimal' },
      });
    }
    return { success: true };
  } catch (_e) {
    return { success: false, message: 'Gagal menyimpan hasil wawancara. Silakan coba lagi.' };
  }
}

// ---------------------------------------------------------------------------
// getHasilWawancara — admin: ambil hasil wawancara terakhir kandidat
// (mode='wawancara' di ai_form_submissions) untuk dilihat / update biodata.
// ---------------------------------------------------------------------------
async function handleGetHasilWawancara(payload: unknown[], sessionToken?: string) {
  const guard = requireRole(sessionToken as string, 'admin');
  if (guard.error) return guard.error;
  const d = ((payload && payload[0]) || {}) as Record<string, any>;
  let wa = normalizeWa(String(d.wa || ''));
  if (!wa && d.candidateId) {
    const cand = await findCandidateByIdOrNull(String(d.candidateId));
    if (cand) wa = normalizeWa(String(cand.no_wa || ''));
  }
  if (!wa) {
    return {
      success: false,
      error: 'Nomor WA kandidat tidak ditemukan — pilih kandidat dulu atau isi nomor WA.',
    };
  }
  try {
    const rows = await supabaseJson('GET', 'ai_form_submissions', {
      query: { select: AI_SUBMISSION_COLS, wa: 'eq.' + wa, submitted_via: 'eq.interview', limit: 100 },
    });
    const row = (Array.isArray(rows) ? rows : []).find(
      (r) =>
        normalizeWa(String(r.wa || '')) === wa && String(r.submitted_via || '') === 'interview',
    );
    if (!row) return { success: true, hasil: null };
    let hasil: Record<string, any> = {};
    try {
      hasil = JSON.parse(row.ai_data_json || '{}');
    } catch (_e) {
      hasil = { catatan: String(row.ai_data_json || '').slice(0, 2000) };
    }
    return {
      success: true,
      hasil,
      wa,
      updatedAt: String(row.updated_at || ''),
      nama: String(row.nama_lengkap || (hasil.biodata && hasil.biodata.nama) || ''),
    };
  } catch (_e) {
    return { success: false, error: 'Terjadi kesalahan. Silakan coba lagi.' };
  }
}

export {
  boundTranscript,
  buildInterviewSystem,
  normalizeBidang,
  resolveProfilKandidat,
  handleProcessAIChat,
  handleProcessAdminAIChat,
  handleProcessSiswaAIChat,
  handleProcessAiInterview,
  handleGenerateWawancaraModel,
  handleSelesaikanWawancara,
  handleSimpanHasilWawancara,
  handleGetHasilWawancara,
};
