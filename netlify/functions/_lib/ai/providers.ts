import { env } from '../env.ts';
import { breaker } from '../kernel/resilience';
import { Errors } from '../kernel/errors';
// ai/providers.js — lapisan PROVIDER AI (Gemini) + helper parsing output AI.

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------
// Timeout per-model (ms): model yang menggantung tidak boleh menghabiskan
// jatah waktu permintaan (limit sinkron Netlify sebenarnya 60 dtk, tapi
// permintaan kita dibatasi 12 dtk oleh kernel/deadline.ts) — kalau model
// pertama lambat/hang, langsung fallback ke model berikutnya.
const MODEL_TIMEOUT_MS = 4000;
// P1 fix: rantai AI harus muat di dalam deadline permintaan, bukan di dalam
// plafon platform. Gemini race (4s) + Grok fallback (5s) = 9s worst case,
// menyisakan ~3s dari deadline 12s (kernel/deadline.ts) untuk rate limiting,
// persistensi, dan penyusunan respons.
//
// Angka ini adalah batas OKUPANSI, bukan batas platform. Plafon sinkron
// Netlify 60 dtk, dan sengaja menghabiskannya berarti menahan slot fungsi 6x
// lebih lama saat beban tinggi — kebalikan dari "bound the load". Jangan
// dinaikkan hanya karena plafonnya masih longgar.
const TOTAL_AI_BUDGET_MS = 9000;

// Model saat ini (Agt 2026): gemini-1.5-flash & 2.0-flash sudah dihapus Google (404),
// gemini-2.5-flash & 2.5-pro sudah tidak tersedia untuk key baru (404),
// gemini-flash-latest sering 503 "high demand" (lambat), gemini-3.5-flash
// respons 7-29 dtk (sering kena timeout Netlify 502). Pakai model LITE yang
// stabil & cepat (~0,6-1,3 dtk, dibuktikan 2026-08-16 vs Netlify lama
// asjportal.netlify.app yang respons ~1 dtk): gemini-3.5-flash-lite (pin,
// lolos SEMUA tes, paling stabil) dulu, lalu alias flash-lite-latest (ikut
// model terbaru; sesekali 503), terakhir flash penuh sebagai jaring pengaman.
const MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];

// Gemini API menolak request yang berakhiran giliran model ("Requests ending
// with a model turn are not supported") — buang giliran model di akhir history
// sebelum dikirim (bisa terjadi kalau history frontend terakumulasi asinkron).
function trimTrailingModelTurn(contents: Array<{ role: string }>) {
  const out = contents.slice();
  while (out.length > 1 && out[out.length - 1].role === 'model') out.pop();
  return out;
}

async function fetchGemini(model: string, key: string, contents: Array<{ role: string }>) {
  breaker.check('gemini');
  try {
    // S11 fix: Use header instead of URL query string for API key.
    // Query strings appear in access logs and error reports.
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': key,
        },
        body: JSON.stringify({ contents }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      breaker.failure('gemini');
      throw new Error('Gemini HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
    }
    breaker.success('gemini');
    const j = await res.json();
    return j &&
      j.candidates &&
      j.candidates[0] &&
      j.candidates[0].content &&
      j.candidates[0].content.parts
      ? j.candidates[0].content.parts.map((p: { text?: unknown }) => p.text || '').join('')
      : '';
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Gemini HTTP')) throw e;
    breaker.failure('gemini');
    throw e;
  }
}


// ---------------------------------------------------------------------------
// Grok (xAI) — fallback when all Gemini models fail
// API is OpenAI-compatible: https://api.x.ai/v1/chat/completions
// ---------------------------------------------------------------------------
const GROK_TIMEOUT_MS = 10000;

async function fetchGrok(key: string, systemPrompt: string, history: Array<{ role?: string; content?: unknown }>) {
  breaker.check('grok');
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const h of Array.isArray(history) ? history : []) {
    const role = h && h.role === 'assistant' ? 'assistant' : 'user';
    if (h && h.content) messages.push({ role, content: String(h.content) });
  }
  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages,
        max_tokens: 2048,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(GROK_TIMEOUT_MS),
    });
    if (!res.ok) {
      breaker.failure('grok');
      throw new Error('Grok HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120));
    }
    breaker.success('grok');
    const j = await res.json();
    return j?.choices?.[0]?.message?.content || '';
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Grok HTTP')) throw e;
    breaker.failure('grok');
    throw e;
  }
}

async function grokGenerate(systemPrompt: string, history: Array<{ role?: string; content?: unknown }>) {
  const key = env('XAI_API_KEY');
  if (!key) return null;
  try {
    const text = await fetchGrok(key, systemPrompt, history);
    if (text) return { reply: text };
  } catch { /* fallback failed */ }
  return null;
}

async function geminiGenerate(systemPrompt: string, history: Array<{ role?: string; content?: unknown }>) {
  const key = env('GEMINI_API_KEY');
  if (!key) {
    // Used to RETURN a friendly reply, which made "the AI is not configured"
    // indistinguishable from "the AI answered" — no code, no banner, no signal.
    // Now it is a typed failure; the chat handlers render the same kind of copy
    // but with `code: 'AI_UNAVAILABLE'`.
    throw Errors.aiUnavailable('Asisten AI belum dikonfigurasi di server. Hubungi admin ya!');
  }
  const contents = [{ role: 'user', parts: [{ text: systemPrompt }] }];
  for (const h of Array.isArray(history) ? history : []) {
    const role = h && h.role === 'assistant' ? 'model' : 'user';
    if (h && h.content) contents.push({ role, parts: [{ text: String(h.content) }] });
  }
  const body = trimTrailingModelTurn(contents);

  // P1 fix: Race all Gemini models in parallel with Promise.any() instead of
  // sequential fallback. Cuts worst case from 3×7s=21s to 4s (single timeout).
  const geminiStart = Date.now();
  try {
    const text = await Promise.any(
      MODELS.map(model => fetchGemini(model, key, body))
    );
    if (text) return { reply: text };
  } catch (aggregateErr) {
    // All Gemini models failed — try Grok as fallback if budget remains
    const elapsed = Date.now() - geminiStart;
    if (elapsed < TOTAL_AI_BUDGET_MS - 5000) {
      const grokResult = await grokGenerate(systemPrompt, history);
      if (grokResult) return grokResult;
    }
    // Re-throw AggregateError or last error
    const lastErr = aggregateErr instanceof AggregateError
      ? aggregateErr.errors[aggregateErr.errors.length - 1]
      : aggregateErr;
    throw Errors.aiUnavailable(undefined, 5, lastErr);
  }
  throw Errors.aiUnavailable(undefined, 5, new Error('Gemini returned empty response'));
  }

async function geminiParseFile(systemPrompt: string, file: { mimeType?: string; data?: unknown }) {
  const key = env('GEMINI_API_KEY');
  if (!key) {
    throw Errors.aiUnavailable('Fitur AI belum dikonfigurasi di server.');
  }
  const contents = [
    {
      role: 'user',
      parts: [{ inlineData: { mimeType: file.mimeType, data: file.data } }, { text: systemPrompt }],
    },
  ];
  // P1 fix: Race Gemini models in parallel.
  try {
    const text = await Promise.any(
      MODELS.map(model => fetchGemini(model, key, contents))
    );
    if (text) return text;
  } catch (aggregateErr) {
    const lastErr = aggregateErr instanceof AggregateError
      ? aggregateErr.errors[aggregateErr.errors.length - 1]
      : aggregateErr;
    throw Errors.aiUnavailable(undefined, 5, lastErr);
  }
  throw Errors.aiUnavailable(undefined, 5, new Error('Gemini returned empty response'));
}

function parseJsonLoose(text: unknown) {
  let t = String(text || '').trim();
  t = t
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch (e2) {
        /* fallthrough */
      }
    }
    throw e;
  }
}

export { geminiGenerate, geminiParseFile, grokGenerate, parseJsonLoose };
