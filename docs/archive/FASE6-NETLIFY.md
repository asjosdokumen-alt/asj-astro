> **Last updated:** 2026-09-03 — Phase completed. This document is historical reference.

# FASE 6: Konfigurasi Netlify Build — DEEP Analysis

## Status: ✅ COMPLETE

## File Created

| File | Purpose |
|------|---------|
| `netlify.toml` | Build config + Cache-Control headers |

## Cache Strategy

```
┌─────────────────────────────────────────────────────┐
│ FILE TYPE          │ CACHE HEADER                   │
├─────────────────────────────────────────────────────┤
│ *.html             │ no-cache, no-store, must-reval │
│ /sw.js             │ no-cache, no-store, must-reval │
│ /_astro/*          │ max-age=31536000, immutable    │
│ /manifest.webmanifest │ max-age=86400 (1 day)      │
└─────────────────────────────────────────────────────┘
```

## Why This Works

1. **HTML + SW never cached** → Browser always checks server for latest
2. **Vite-hashed assets cached forever** → Same hash = same content, safe to cache
3. **Manifest cached 1 day** → Balance between freshness and performance

## Anti-Cache Triple Layer

```
Layer 1: netlify.toml headers → Browser HTTP cache
Layer 2: sw.js skipWaiting → SW activates immediately
Layer 3: ASJ_FORCE_RELOAD → Auto-refresh all tabs
```

## Build Pipeline

```
git push → Netlify detects change
  ↓
npm run build → astro build (Vite)
  ↓
dist/ → Published to CDN
  ↓
Headers applied per netlify.toml rules
```

## Deployment Checklist

- [x] netlify.toml with build command
- [x] Cache-Control headers for HTML/SW/assets
- [x] SW with skipWaiting + force reload
- [x] PWA manifest for installability
- [x] Connect Netlify site to GitHub repo → `khoci280-arch/asj-astro`
- [x] Set environment variables (Supabase, Netlify)
- [x] Test deploy on Netlify

## Live Deployment

| Resource | URL |
|----------|-----|
| **GitHub** | https://github.com/khoci280-arch/asj-astro |
| **Netlify** | https://incredible-starship-054a78.netlify.app |
| **Admin** | https://app.netlify.com/projects/incredible-starship-054a78 |

## Deploy Commands

```bash
# Build
npm run build

# Zip dist folder (Windows)
powershell -Command "Compress-Archive -Path 'dist\*' -DestinationPath 'deploy.zip'"

# Upload to Netlify
#
# ⛔ TOKEN REDACTED 2026-10-08. This block used to carry a real
# `nfp_…` personal access token in plaintext, committed in 8280792 while this
# repository is PUBLIC. It is still present in git history — redacting it here
# removes it from the working tree, NOT from the past.
#
#   ACTION REQUIRED BY THE OWNER: revoke that token in Netlify
#   (User settings → Applications → Personal access tokens). Until it is
#   revoked, anyone who reads the history can use it.
#
# This whole manual-upload flow is obsolete anyway: deploys now run from the
# GitHub integration (`git push` → Netlify build), so no token belongs here.
# Pass it through the environment instead: `-H "Authorization: Bearer $NETLIFY_AUTH_TOKEN"`.
curl -X POST "https://api.netlify.com/api/v1/sites/${NETLIFY_SITE_ID}/deploys" \
  -H "Authorization: Bearer ${NETLIFY_AUTH_TOKEN}" \
  -H "Content-Type: application/zip" \
  --data-binary @deploy.zip
```
