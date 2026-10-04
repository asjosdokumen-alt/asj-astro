/**
 * schemas.ts — Zod validation schemas for all forms
 * Per PDF Fase 9: "Create strict Zod validation schemas"
 *
 * Validates data BEFORE sending to backend.
 * Prevents bad data (WA with letters, invalid email, etc.)
 */
import { z } from 'zod';
import { normalizeWa } from '../../shared/wa-rules';

// ─── Candidate Registration / Login ───

/**
 * WA number — flexible format:
 * - Indonesia: 628xx (12-15 digit)
 * - Japan (+81): 81xx (10-15 digit)
 * - Internasional lain: 10-15 digit (tanpa spasi/simbol)
 */
/**
 * Normalisasi WA — delegasi ke SATU sumber kebenaran `shared/wa-rules.ts`.
 *
 * Dulu blok ini adalah SALINAN KETIGA dari aturan yang sama, dan salinan itu
 * tertinggal dari perbaikan backend: `080…` (mobile Jepang) dipetakan ke `62…`
 * dan `070…` 12-digit dipetakan balik ke `628170…` — jadi satu orang bisa
 * menjadi dua baris kandidat. Sekarang ia hanya meneruskan, sehingga tidak ada
 * lagi tempat kedua yang bisa menyimpang tanpa terlihat.
 *
 * B01 fix (historis): dulu klien punya regex RUSAK (huruf 'd' literal, bukan
 * digit) sehingga 8xx tanpa nol selalu ditolak.
 */
export const normalizeWaInput: (v: string) => string = normalizeWa;

/** Validasi format WA — mirror isValidWaFormat backend (ID 628xx 12-15, JP 81xx 10-15). */
function isWaValid(v: string): boolean {
  const n = normalizeWaInput(v);
  if (!n) return false;
  if (n.startsWith('628')) {
    const after = n.slice(3);
    return after.length >= 9 && after.length <= 12;
  }
  if (n.startsWith('81')) {
    const after = n.slice(2);
    return after.length >= 8 && after.length <= 12;
  }
  return false;
}

/** WA valid = kanonik Indonesia (628xx) atau Jepang (81xx) — parity backend. */
export const waSchema = z.string()
  .refine(isWaValid, 'Nomor WA tidak valid. Gunakan format 08xx/628xx (Indonesia) atau 090/070/080/81xx (Jepang).');

/** Email (optional) */
export const emailSchema = z.string()
  .email('Format email tidak valid')
  .optional()
  .or(z.literal(''));

/** Password: 4-20 chars, no spaces */
export const passwordSchema = z.string()
  .min(4, 'Password minimal 4 karakter')
  .max(20, 'Password maksimal 20 karakter')
  .regex(/^[^\s]+$/, 'Password tidak boleh mengandung spasi');

// ─── Candidate Profile ───

export const candidateProfileSchema = z.object({
  nama: z.string().min(2, 'Nama minimal 2 karakter'),
  gender: z.enum(['LAKI-LAKI', 'PEREMPUAN'], { errorMap: () => ({ message: 'Gender harus LAKI-LAKI atau PEREMPUAN' }) }),
  usia: z.number().min(16, 'Usia minimal 16 tahun').max(50, 'Usia maksimal 50 tahun'),
  tb: z.number().min(130, 'Tinggi minimal 130 cm').max(220, 'Tinggi maksimal 220 cm'),
  bb: z.number().min(35, 'Berat minimal 35 kg').max(150, 'Berat maksimal 150 kg'),
  email: emailSchema,
  alamat: z.string().min(5, 'Alamat minimal 5 karakter'),
});

// ─── Kandidat Login ───

export const kandidatLoginSchema = z.object({
  wa: waSchema,
  password: passwordSchema,
});

// ─── Admin Login ───

export const adminMasterPinSchema = z.object({
  pin: z.string().min(1, 'PIN harus diisi'),
});

export const adminPersonalPinSchema = z.object({
  name: z.string().min(1, 'Nama admin harus diisi'),
  pin: z.string().min(1, 'PIN harus diisi'),
});

// ─── Registration ───

export const registerSchema = z.object({
  nama: z.string().min(2, 'Nama minimal 2 karakter'),
  wa: waSchema,
});

// ─── Type exports ───

export type CandidateProfile = z.infer<typeof candidateProfileSchema>;
export type KandidatLogin = z.infer<typeof kandidatLoginSchema>;
export type Register = z.infer<typeof registerSchema>;

// ─── Validation helper ───

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    errors: result.error.errors.map(e => e.message),
  };
}
