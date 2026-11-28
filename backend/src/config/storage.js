import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "../utils/ApiError.js";

// Access to the PRIVATE Supabase Storage bucket for claim and verification
// documents. It needs the project's service-role key, which can do anything in
// the project: keep it in .env on the server only, never in the frontend, never
// in git. Without it the rest of the app still runs; only document routes answer
// 503 DOCUMENTS_UNAVAILABLE.

export const DOCUMENT_BUCKET = process.env.DOCUMENT_BUCKET || "verification-documents";

let client;

export const getDocumentBucket = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!key || !process.env.SUPABASE_URL) {
    throw new ApiError(503, "Document uploads are not available right now", {
      code: "DOCUMENTS_UNAVAILABLE",
    });
  }

  client ??= createClient(process.env.SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  return client.storage.from(DOCUMENT_BUCKET);
};