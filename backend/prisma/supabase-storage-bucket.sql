-- Creates the PRIVATE bucket that holds claim and verification documents.
-- Run once in the Supabase SQL editor. Safe to run twice.
--
-- Private:  nothing in it can be opened without a short-lived signed link, which
--           only this backend creates (and only for the uploader, or for a
--           moderator who is then logged).
-- Limits:   Storage itself refuses files over 5 MB or of any other type, as a
--           second line of defence behind the checks in the backend.
-- No policies are added on purpose: with row level security on and no policy,
-- the public API can neither list nor read these files.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
