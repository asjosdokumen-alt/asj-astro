/**
 * applyDocs.ts — C01/A4 parity (2026-09-05): the required-document set for the
 * apply upload cards comes from the SERVER job (dokumenShare in the public
 * getAppData payload), not from a hardcoded two-code table.
 *
 * PARITY_QA A4: "Dokumen wajib per job berasal dari dokumen_share server; Astro
 * hardcode JOB_PARAMS utk 2 kode ... UI perlu ambil syarat dari getAppData/job
 * agar kartu benar". Backend handleSubmitApply gates on the same dokumen_share
 * set (CV/JFT/SSW enforced), so the card set must mirror it. Pure + testable.
 */

export interface ApplyDocSpec {
  /** uploads-map key: photo | cv | jft | ssw | extra_<TOKEN> */
  key: string;
  /** canonical uppercase token (CV / JFT / SSW / KTP / SIM A / ...) */
  token: string;
  /** core = photoFile/cvFile/jftFile/sswFile; extra = extraFiles[] payload */
  core: boolean;
}

const CORE_TOKENS: Record<string, { key: string; token: string }> = {
  CV: { key: 'cv', token: 'CV' },
  JFT: { key: 'jft', token: 'JFT' },
  SSW: { key: 'ssw', token: 'SSW' },
};

// Tokens that mean the photo card — the form always shows it.
const PHOTO_ALIASES = new Set([
  'PAS PHOTO', 'PHOTO', 'PAS FOTO', 'FOTO', 'FOTO 2X3', 'PASFOTO',
]);

// Backend handleSubmitApply / handleShareData default when a job has no
// dokumen_share (demo rows and share view both fall back to CV,JFT,SSW).
export const DEFAULT_REQUIRED: readonly string[] = ["CV", "JFT", "SSW"];

function normalizeToken(raw: string): string {
  return String(raw || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Derive the upload-card set from the server job. Empty/missing/ALL dokumenShare
 * falls back to CV,JFT,SSW (parity backend default). Photo is intentionally not
 * returned — the form renders the photo card unconditionally.
 */
export function requiredDocsFromJob(job: { dokumenShare?: string | null } | null | undefined): ApplyDocSpec[] {
  const raw = String(job && job.dokumenShare ? job.dokumenShare : '').trim();
  let tokens: string[] = raw && raw !== '-' ? raw.split(/[,;]+/).map(normalizeToken).filter(Boolean) : [];
  if (!tokens.length || tokens.includes('ALL')) tokens = [...DEFAULT_REQUIRED];
  const seen = new Set<string>();
  const specs: ApplyDocSpec[] = [];
  for (const token of tokens) {
    if (PHOTO_ALIASES.has(token)) continue;
    const core = CORE_TOKENS[token];
    if (core) {
      if (seen.has(core.key)) continue;
      seen.add(core.key);
      specs.push({ key: core.key, token: core.token, core: true });
    } else {
      const key = 'extra_' + token.replace(/[^A-Z0-9_-]/g, '_');
      if (seen.has(key)) continue;
      seen.add(key);
      specs.push({ key, token, core: false });
    }
  }
  return specs;
}

