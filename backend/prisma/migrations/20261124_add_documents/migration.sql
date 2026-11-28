-- Document uploads for claims and verification requests.
-- Run this once in the Supabase SQL editor (safe to run twice), AFTER
-- 20261124_add_claims_and_fuzzy_search. Then run prisma/supabase-storage-bucket.sql.
--
-- The files themselves live in a private Supabase Storage bucket. This table
-- only records WHAT was uploaded and WHERE, never the file contents.

CREATE TABLE IF NOT EXISTS "hospital_documents" (
  "id"                      UUID         NOT NULL,
  "hospital_id"             UUID         NOT NULL,
  "uploaded_by"             UUID,
  "claim_id"                UUID,
  "verification_request_id" UUID,
  "document_type"           VARCHAR(40)  NOT NULL,
  "original_name"           VARCHAR(150) NOT NULL,
  "mime_type"               VARCHAR(50)  NOT NULL,
  "size_bytes"              INTEGER      NOT NULL,
  "storage_path"            VARCHAR(300) NOT NULL,
  -- awaiting_upload: row created, file not confirmed yet
  -- uploaded:        file received and checked
  -- purged:          file deleted by the retention job (row kept as a record)
  "status"                  VARCHAR(20)  NOT NULL DEFAULT 'awaiting_upload',
  "uploaded_at"             TIMESTAMPTZ(6),
  -- When the retention job may delete the file. Set when the claim or request is decided.
  "delete_after"            TIMESTAMPTZ(6),
  "purged_at"               TIMESTAMPTZ(6),
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hospital_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "hospital_documents_storage_path_key" UNIQUE ("storage_path"),
  CONSTRAINT "hospital_documents_status_check"
    CHECK ("status" IN ('awaiting_upload', 'uploaded', 'purged')),
  CONSTRAINT "hospital_documents_type_check"
    CHECK ("document_type" IN ('registration_certificate', 'operating_licence', 'letter_of_authority', 'staff_id', 'other')),
  CONSTRAINT "hospital_documents_mime_check"
    CHECK ("mime_type" IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT "hospital_documents_size_check"
    CHECK ("size_bytes" > 0 AND "size_bytes" <= 5242880),
  -- A document belongs to exactly one claim OR one verification request.
  CONSTRAINT "hospital_documents_one_parent_check"
    CHECK (num_nonnulls("claim_id", "verification_request_id") = 1),
  CONSTRAINT "hospital_documents_hospital_fkey"
    FOREIGN KEY ("hospital_id") REFERENCES "hospitals"("id") ON DELETE CASCADE,
  CONSTRAINT "hospital_documents_uploader_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "hospital_documents_claim_fkey"
    FOREIGN KEY ("claim_id") REFERENCES "hospital_claims"("id") ON DELETE CASCADE,
  CONSTRAINT "hospital_documents_verification_fkey"
    FOREIGN KEY ("verification_request_id") REFERENCES "hospital_verification_requests"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "hospital_documents_claim_idx" ON "hospital_documents" ("claim_id");
CREATE INDEX IF NOT EXISTS "hospital_documents_verification_idx" ON "hospital_documents" ("verification_request_id");
-- Used by the retention job: only rows that still hold a file and have a deadline.
CREATE INDEX IF NOT EXISTS "hospital_documents_retention_idx"
  ON "hospital_documents" ("delete_after") WHERE "status" <> 'purged';

-- Supabase's public API must not read this table. The backend connects as the
-- database owner, which is not affected.
ALTER TABLE "hospital_documents" ENABLE ROW LEVEL SECURITY;
