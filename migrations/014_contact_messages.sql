-- =============================================================================
-- 2026-09-21 — Migration 014: storage for the public contact form
-- -----------------------------------------------------------------------------
-- WHY
--   The landing page's "Hubungi Kami" section showed an address, two phone
--   numbers and an email, and nothing else. A visitor with a question had no way
--   to ask it without leaving the page — the brief for that section asks for a
--   contact form, and the page could not honour it.
--
--   `database_asj_form` was the tempting destination and is the wrong one. That
--   table is the MAIL INBOX: every row is a candidate's application or document
--   package, keyed on (no_wa, code_job) and carrying review state an admin works
--   through. A stranger asking "berapa biaya pelatihannya?" is not an applicant,
--   has no candidate record, and would corrupt the inbox's meaning if inserted
--   there — the same class of mistake migration 013 exists to undo, where one
--   column held two independent verdicts.
--
--   So: its own table, one purpose.
--
-- WHAT AN ADMIN DOES WITH A ROW
--   `status` is deliberately a three-state read/unread flag, NOT an approval
--   verdict. Nothing about a contact message is approvable — there is no
--   candidate behind it and no selection decision to record. It exists so the
--   inbox can show which enquiries are new, and it is written only by an admin
--   reading them.
--
-- ON THE NAME
--   `database_asj_kontak`, following `database_asj_form` and `database_candidate`.
--   The repo's public-facing identifiers are Indonesian; `contact` would be the
--   only English table name a visitor's data lands in.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.database_asj_kontak (
  id          text        PRIMARY KEY,
  nama        text        NOT NULL,
  no_wa       text        NOT NULL,
  subjek      text        NOT NULL,
  pesan       text        NOT NULL,
  status      text        NOT NULL DEFAULT 'BARU',
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT database_asj_kontak_status_check
    CHECK (status IN ('BARU', 'DIBACA')),

  -- Length ceilings enforced at the database, not only in the handler. The
  -- handler bound is the first line; this one holds if a future caller reaches
  -- the table another way. Generous relative to the handler's limits so a
  -- tightening there never starts rejecting rows that are already legal.
  CONSTRAINT database_asj_kontak_nama_len   CHECK (char_length(nama)   <= 200),
  CONSTRAINT database_asj_kontak_subjek_len CHECK (char_length(subjek) <= 300),
  CONSTRAINT database_asj_kontak_pesan_len  CHECK (char_length(pesan)  <= 8000)
);

-- The two queries that actually run against this table:
--   1. the rate limiter — count rows for one number since a timestamp
--   2. the admin inbox  — newest first
CREATE INDEX IF NOT EXISTS database_asj_kontak_wa_created_idx
  ON public.database_asj_kontak (no_wa, created_at DESC);

CREATE INDEX IF NOT EXISTS database_asj_kontak_created_idx
  ON public.database_asj_kontak (created_at DESC);

-- RLS, matching the posture of the other 16 tables (migration 012): enabled with
-- no permissive policy, i.e. fail-closed for anon/authenticated roles. Every
-- write goes through the service role in the function runtime, which bypasses
-- RLS — so the form keeps working while the table stays unreadable directly.
-- This is the same deliberate choice recorded in MEMORY: "RLS with no policy =
-- fail-closed, not exposure."
ALTER TABLE public.database_asj_kontak ENABLE ROW LEVEL SECURITY;

COMMIT;

-- PostgREST resolves the table list at startup. Without this the new table is
-- invisible to the handler until the next restart, and the contact form would
-- answer PGRST205 for hours while looking correctly written.
NOTIFY pgrst, 'reload schema';
