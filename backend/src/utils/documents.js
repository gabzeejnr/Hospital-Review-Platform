// Shared rules and presentation for uploaded documents (task 6c).

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
export const MAX_FILE_BYTES = 5 * 1024 * 1024; // keep in step with the bucket limit in prisma/supabase-storage-bucket.sql
export const MAX_DOCUMENTS_PER_SUBMISSION = 5;

// How long a document is kept after its claim or request has been decided
// (approved, rejected or withdrawn) before the retention job deletes the file.
export const RETENTION_DAYS_AFTER_DECISION = 30;

// A moderator's view link works for this long.
export const VIEW_LINK_SECONDS = 5 * 60;

// An upload that was never confirmed is cleaned up after this long.
export const UNCONFIRMED_UPLOAD_HOURS = 24;

// File type -> the extension used in storage. The user's own filename is NEVER
// used in a storage path.
export const ALLOWED_MIME_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export const DOCUMENT_TYPES = [
  "registration_certificate", // e.g. CAC certificate
  "operating_licence", // e.g. state ministry or MDCN licence
  "letter_of_authority", // proof the person may act for the hospital
  "staff_id",
  "other",
];

// ---------------------------------------------------------------------------

// What a document looks like in API responses. The storage path is never sent.
export const documentSelect = {
  id: true,
  documentType: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  status: true,
  uploadedAt: true,
  createdAt: true,
};

export const presentDocument = (document) => ({
  id: document.id,
  documentType: document.documentType,
  fileName: document.originalName,
  mimeType: document.mimeType,
  sizeBytes: document.sizeBytes,
  status: document.status,
  uploadedAt: document.uploadedAt,
  createdAt: document.createdAt,
});

// Documents of a submission that still hold a file (or are about to).
export const liveDocuments = {
  where: { status: { in: ["awaiting_upload", "uploaded"] } },
  select: documentSelect,
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
};

// Documents a moderator can open: only confirmed uploads.
export const uploadedDocuments = {
  where: { status: "uploaded" },
  select: documentSelect,
  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
};

// Starts the retention clock on every document of a decided claim or request.
// Call inside the same transaction as the decision.
export const scheduleDocumentDeletion = (tx, where) =>
  tx.hospitalDocument.updateMany({
    where: { ...where, status: { in: ["awaiting_upload", "uploaded"] }, deleteAfter: null },
    data: { deleteAfter: new Date(Date.now() + RETENTION_DAYS_AFTER_DECISION * 24 * 60 * 60 * 1000) },
  });