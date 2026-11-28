import { randomUUID } from "node:crypto";
import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { recordSecurityEvent, recordSecurityEventOrFail } from "../src/services/audit.service.js";
import {
  createUploadTarget,
  inspectObject,
  createViewUrl,
  removeObjects,
  UPLOAD_LINK_SECONDS,
} from "../src/services/documentStorage.service.js";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_BYTES,
  MAX_DOCUMENTS_PER_SUBMISSION,
  VIEW_LINK_SECONDS,
  presentDocument,
} from "../src/utils/documents.js";
import { DOCUMENT_BUCKET } from "../src/config/storage.js";

// Proof documents for claims and verification requests (task 6c).
//
// How an upload works:
//   1. The frontend asks for an upload link  ->  POST /claims/:id/documents
//      (or /verifications/:id/documents). The server records the file as
//      "awaiting_upload" and returns a one-use link for an exact storage path.
//   2. The browser uploads the file straight to Supabase Storage.
//   3. The frontend confirms                 ->  POST /documents/:id/confirm.
//      The server looks at the real file (size and first bytes) and only then
//      accepts it. A file that is not what it claimed to be is deleted.
//   4. Moderators open files through 5-minute links, and every one is logged.
// Files are deleted some days after a decision by `npm run purge:documents`.

const LIVE = ["awaiting_upload", "uploaded"];

// The two things a document can be attached to.
const PARENTS = {
  claim: {
    folder: "claims",
    field: "claimId",
    notFound: ["CLAIM_NOT_FOUND", "Claim not found"],
    load: (id) =>
      prisma.hospitalClaim.findUnique({
        where: { id },
        select: { id: true, hospitalId: true, status: true, userId: true },
      }),
    ownerId: (row) => row.userId,
  },
  verification: {
    folder: "verifications",
    field: "verificationRequestId",
    notFound: ["VERIFICATION_NOT_FOUND", "Verification request not found"],
    load: (id) =>
      prisma.hospitalVerificationRequest.findUnique({
        where: { id },
        select: { id: true, hospitalId: true, status: true, requestedById: true },
      }),
    ownerId: (row) => row.requestedById,
  },
};

const documentNotFound = () =>
  new ApiError(404, "Document not found", { code: "DOCUMENT_NOT_FOUND" });

// Somebody else's claim or document looks exactly like one that does not exist.
const requireOwnPending = async (kind, id, userId) => {
  const parent = PARENTS[kind];
  const row = await parent.load(id);

  if (!row || parent.ownerId(row) !== userId) {
    throw new ApiError(404, parent.notFound[1], { code: parent.notFound[0] });
  }

  if (row.status !== "pending") {
    throw new ApiError(409, "Documents can only be changed while the submission is waiting for review", {
      code: "SUBMISSION_NOT_PENDING",
    });
  }

  return row;
};

// POST /api/claims/:id/documents  and  POST /api/verifications/:id/documents
const requestUpload = (kind) => async (req, res) => {
  const parent = PARENTS[kind];
  const row = await requireOwnPending(kind, req.params.id, req.user.id);

  const existing = await prisma.hospitalDocument.count({
    where: { [parent.field]: row.id, status: { in: LIVE } },
  });

  if (existing >= MAX_DOCUMENTS_PER_SUBMISSION) {
    throw new ApiError(
      409,
      `You can attach at most ${MAX_DOCUMENTS_PER_SUBMISSION} documents. Delete one to add another.`,
      { code: "TOO_MANY_DOCUMENTS" }
    );
  }

  // The storage path is built only from ids and a fixed extension. The user's
  // own file name is kept for display and never becomes part of a path.
  const id = randomUUID();
  const storagePath = `${parent.folder}/${row.id}/${id}.${ALLOWED_MIME_TYPES[req.body.mimeType]}`;

  const document = await prisma.hospitalDocument.create({
    data: {
      id,
      hospitalId: row.hospitalId,
      uploadedById: req.user.id,
      [parent.field]: row.id,
      documentType: req.body.documentType,
      originalName: req.body.fileName,
      mimeType: req.body.mimeType,
      sizeBytes: req.body.sizeBytes,
      storagePath,
    },
    select: {
      id: true, documentType: true, originalName: true, mimeType: true,
      sizeBytes: true, status: true, uploadedAt: true, createdAt: true,
    },
  });

  let target;
  try {
    target = await createUploadTarget(storagePath);
  } catch (error) {
    await prisma.hospitalDocument.delete({ where: { id } }).catch(() => {});
    throw error;
  }

  return res.status(201).json({
    success: true,
    document: presentDocument(document),
    // Frontend: supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType })
    // then call POST /api/documents/:id/confirm.
    upload: {
      bucket: DOCUMENT_BUCKET,
      path: target.path,
      token: target.token,
      signedUrl: target.signedUrl,
      expiresInSeconds: UPLOAD_LINK_SECONDS,
      maxBytes: MAX_FILE_BYTES,
    },
  });
};

export const requestClaimDocumentUpload = requestUpload("claim");
export const requestVerificationDocumentUpload = requestUpload("verification");

// Loads one of the caller's own documents together with its submission's state.
const loadOwnDocument = async (id, userId) => {
  const document = await prisma.hospitalDocument.findUnique({
    where: { id },
    select: {
      id: true, hospitalId: true, claimId: true, verificationRequestId: true,
      storagePath: true, mimeType: true, sizeBytes: true, status: true,
      claim: { select: { userId: true, status: true } },
      verificationRequest: { select: { requestedById: true, status: true } },
    },
  });

  const ownerId = document?.claim?.userId ?? document?.verificationRequest?.requestedById;
  if (!document || ownerId !== userId) throw documentNotFound();

  return {
    ...document,
    parentStatus: document.claim?.status ?? document.verificationRequest?.status,
  };
};

// Removes the stored file (if any) and the record.
const discard = async (document) => {
  await removeObjects([document.storagePath]);
  await prisma.hospitalDocument.deleteMany({ where: { id: document.id } });
};

// POST /api/documents/:id/confirm
export const confirmDocument = async (req, res) => {
  const document = await loadOwnDocument(req.params.id, req.user.id);

  const select = {
    id: true, documentType: true, originalName: true, mimeType: true,
    sizeBytes: true, status: true, uploadedAt: true, createdAt: true,
  };

  // Confirming twice is harmless.
  if (document.status === "uploaded") {
    const current = await prisma.hospitalDocument.findUnique({ where: { id: document.id }, select });
    return res.status(200).json({ success: true, document: presentDocument(current) });
  }

  if (document.status !== "awaiting_upload" || document.parentStatus !== "pending") {
    throw new ApiError(409, "This document can no longer be changed", { code: "DOCUMENT_LOCKED" });
  }

  const found = await inspectObject(document.storagePath);

  if (!found) {
    throw new ApiError(409, "The file has not arrived yet. Upload it, then confirm again.", {
      code: "UPLOAD_NOT_FOUND",
    });
  }

  let problem = null;
  if (found.size <= 0) problem = "The file is empty";
  else if (found.size > MAX_FILE_BYTES) problem = `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`;
  else if (found.detectedMime !== document.mimeType) {
    problem = "The file is not a genuine PDF, JPEG or PNG, or it is not the type you said it was";
  }

  if (problem) {
    // Do not keep a file that is not what it claimed to be.
    await discard(document);
    throw new ApiError(422, problem, { code: "UPLOAD_INVALID" });
  }

  const result = await prisma.hospitalDocument.updateMany({
    where: { id: document.id, status: "awaiting_upload" },
    data: { status: "uploaded", uploadedAt: new Date(), sizeBytes: found.size },
  });

  const confirmed = await prisma.hospitalDocument.findUnique({ where: { id: document.id }, select });

  if (result.count === 1) {
    void recordSecurityEvent(req.user.id, "HOSPITAL_DOCUMENT_UPLOADED", {
      documentId: document.id,
      hospitalId: document.hospitalId,
    });
  }

  return res.status(200).json({ success: true, document: presentDocument(confirmed) });
};

// DELETE /api/documents/:id  (only while the submission is waiting for review;
// afterwards the retention job deletes the file on schedule)
export const deleteDocument = async (req, res) => {
  const document = await loadOwnDocument(req.params.id, req.user.id);

  if (document.parentStatus !== "pending" || document.status === "purged") {
    throw new ApiError(409, "This document can no longer be changed", { code: "DOCUMENT_LOCKED" });
  }

  await discard(document);

  void recordSecurityEvent(req.user.id, "HOSPITAL_DOCUMENT_DELETED", {
    documentId: document.id,
    hospitalId: document.hospitalId,
  });

  return res.status(200).json({ success: true, message: "Document deleted" });
};

// GET /api/moderation/documents/:id/url   (moderators and admins)
// Hands out a short-lived link and writes who asked, and for what, to the audit log.
export const getDocumentViewUrl = async (req, res) => {
  const document = await prisma.hospitalDocument.findUnique({
    where: { id: req.params.id },
    select: {
      id: true, hospitalId: true, claimId: true, verificationRequestId: true,
      originalName: true, mimeType: true, storagePath: true, status: true,
    },
  });

  if (!document || document.status !== "uploaded") throw documentNotFound();

  // Logged BEFORE the link exists, and a failed log stops the request: no view
  // without a record.
  await recordSecurityEventOrFail(req.user.id, "HOSPITAL_DOCUMENT_VIEWED", {
    documentId: document.id,
    hospitalId: document.hospitalId,
    claimId: document.claimId,
    verificationRequestId: document.verificationRequestId,
  });

  const url = await createViewUrl(document.storagePath, VIEW_LINK_SECONDS);

  return res.status(200).json({
    success: true,
    url,
    expiresInSeconds: VIEW_LINK_SECONDS,
    fileName: document.originalName,
    mimeType: document.mimeType,
  });
};