# Netlify environment setup — asjosdokumen-alt/asj-astro

Names and sources only. **No secret values appear in this file**, and none should
ever be written into this repo. Fill them in the Netlify dashboard, or run
`netlify env:set` locally from your own `.env.local`.

Source of truth for what is required: `scripts/ci/verify-env.mjs` → `PROFILES.production`.

---

## 1. Site setup

| Step | Action |
|---|---|
| New site | Netlify → **Add new site** → **Import an existing project** → GitHub → `asjosdokumen-alt/asj-astro` |
| Branch to deploy | `main` |
| Build command | comes from `netlify.toml` — leave the UI default alone so the file stays authoritative |
| Functions dir | comes from `netlify.toml` — do not override in the UI |
| Node version | set `NODE_VERSION` env var (see below) if the build complains |

> Do **not** paste env vars into the repo to make the build work. Netlify injects
> them at build and runtime; a committed secret is permanent in git history.

---

## 2. Required — the build will fail or ship a broken bundle without these

`PUBLIC_*` values are **inlined into client JS at build time**. A missing or wrong
one does not throw — it produces a bundle that silently cannot reach Supabase.

| Variable | Where to get the value |
|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `SUPABASE_URL` | same Project URL as above |
| `SUPABASE_ANON_KEY` | same anon key as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (**server-only — never expose**) |
| `SESSION_SECRET` | generate fresh: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

`SESSION_SECRET` should be **new for this deployment**, not copied from the old
repo. If it ever leaked, rotating it invalidates existing sessions — which is the
correct outcome.

---

## 3. Required by the deploy tooling (not by the app at runtime)

| Variable | Where to get the value |
|---|---|
| `NETLIFY_AUTH_TOKEN` | Netlify → User settings → Applications → Personal access tokens |
| `NETLIFY_SITE_ID` | Netlify → Site configuration → Site information → Site ID |

Note: this Netlify token is for **this** account. Your old repo's Netlify token
being exhausted (as you mentioned) does not affect these.

---

## 4. Optional — app degrades gracefully without them

| Variable | What breaks if unset |
|---|---|
| `GEMINI_API_KEY` | AI CV / chat features fail |
| `XAI_API_KEY` | Grok fallback for AI chat unavailable |
| `FONNTE_TOKEN` | WhatsApp sends fail (offer blasts, notifications) |
| `CLOUDINARY_URL` | Document upload fails |
| `CLOUDINARY_UPLOAD_URL` | Direct unsigned uploads fail |
| `SUPABASE_STORAGE_BUCKET` | Storage bucket defaults may be wrong |
| `NETLIFY_SITE_URL` | Outbound links in emails/messages may be wrong |
| `ADMIN_MASTER_PIN` | Master admin PIN gate unavailable |
| `GROQ_API_KEY` | Additional AI provider unavailable |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase push notifications fail |
| `LOG_DRAIN_TOKEN` | Log drain auth (only if a drain is configured) |
| `SENTRY_DSN` | Error reporting to Sentry disabled |

Admin PINs (`PIN_KHOCI`, `PIN_SACHOU`, `PIN_AYOK`, `PIN_KHOLIS`) are read by the
runtime whitelist. Set them if your admin flows use per-person PINs.

---

## 5. After deploying

Run these against the live URL — this is the step that unblocks the remaining work:

```bash
# 1. Clean env in the build environment
npm run verify:env -- --profile production

# 2. THE BLOCKER — verifies every netlify.toml alias resolves on the real site.
#    Needs a real deploy; this is what gates deleting the 11 catch-alls (~7.6 MB).
BASE_URL=https://<your-site>.netlify.app npm run verify:aliases

# 3. Smoke test the public surface
BASE_URL=https://<your-site>.netlify.app npm run smoke
```

`verify:aliases` must report **all aliases resolve**. Only then is it safe to
delete the catch-all entry points — deleting them before that risks breaking live
QR codes for real applicants.

---

## 6. Security notes

- Never paste tokens into chat or into files in this repo. `.gitignore` now blocks
  `asj-astro.txt`, `*-token*.txt`, `*-credentials.txt`, and all `.env*` files.
- Use `git config --global credential.helper manager` and let Git prompt once —
  the credential is then stored by Windows Credential Manager, encrypted, and
  never appears in a transcript or a commit.
- Any token that has been pasted into a chat or written to a file **must be
  revoked**, even if it appears unused: https://github.com/settings/tokens
