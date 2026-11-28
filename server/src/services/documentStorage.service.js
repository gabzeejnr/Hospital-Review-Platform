import path from "node:path";
import { getDocumentBucket } from "../config/storage.js";
import { ApiError } from "../utils/ApiError.js";
import { detectMime } from "../utils/fileSignature.js";

// The only place that talks to Supabase Storage. Everything else (controllers,
// the retention job) goes through these four functions.
//
// The browser uploads straight to Supabase with a one-use signed link, so file
// contents never pass through this server. The server then checks the result
// (confirmDocument) before accepting the file.

export const UPLOAD_LINK_SECONDS = 2 * 60 * 60; // Supabase's fixed signed-upload lifetime

const storageError = (action, error) => {
  console.error(`Document storage ${action} failed:`, error?.message ?? error);

  return new ApiError(502, "File storage is not responding. Please try again.", {
    code: "STORAGE_ERROR",
  });
};

// A one-use link the browser can upload ONE file to, at exactly this path.
export const createUploadTarget = async (objectPath) => {
  const { data, error } = await getDocumentBucket().createSignedUploadUrl(objectPath);
  if (error || !data) throw storageError("signing an upload", error);

  return { path: objectPath, token: data.token, signedUrl: data.signedUrl };
};

// Looks at an uploaded file without downloading it all. Returns null if nothing
// was uploaded, otherwise its real size and the type its first bytes show.
export const inspectObject = async (objectPath) => {
  const bucket = getDocumentBucket();
  const folder = path.posix.dirname(objectPath);
  const name = path.posix.basename(objectPath);

  const { data: files, error: listError } = await bucket.list(folder, { limit: 1, search: name });
  if (listError) throw storageError("listing", listError);

  const file = files?.find((item) => item.name === name);
  if (!file) return null;

  const { data: signed, error: signError } = await bucket.createSignedUrl(objectPath, 60);
  if (signError || !signed) throw storageError("signing a read", signError);

  // Only the first few bytes are needed to recognise the file type.
  const response = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-15" } });
  if (!response.ok) throw storageError("reading", `HTTP ${response.status}`);

  const bytes = new Uint8Array(await response.arrayBuffer()).subarray(0, 16);

  return { size: Number(file.metadata?.size ?? 0), detectedMime: detectMime(bytes) };
};

// A link that opens the file for a short time. Only moderators get one, and each
// one handed out is written to the audit log by the caller.
export const createViewUrl = async (objectPath, seconds) => {
  const { data, error } = await getDocumentBucket().createSignedUrl(objectPath, seconds);
  if (error || !data) throw storageError("signing a read", error);

  return data.signedUrl;
};

// Deletes files. A file that is already gone is not an error.
export const removeObjects = async (objectPaths) => {
  if (objectPaths.length === 0) return;

  const { error } = await getDocumentBucket().remove(objectPaths);
  if (error) throw storageError("removing", error);
};