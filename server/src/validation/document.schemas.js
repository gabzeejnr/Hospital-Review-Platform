import { z } from "zod";
import { bodyObject, typed, uuidSchema } from "./common.js";
import { oneLine } from "./review.schemas.js";
import { ALLOWED_MIME_TYPES, DOCUMENT_TYPES, MAX_FILE_BYTES } from "../utils/documents.js";

// Only the file's NAME, TYPE and SIZE are described here; the file itself goes
// straight to Supabase Storage. The type and size given here are promises that
// the server later checks against the real file (see confirmDocument).

const MIME_TYPES = Object.keys(ALLOWED_MIME_TYPES);

// "C:\\Users\\me\\licence.pdf" and "../../x.pdf" both become just the last part.
const fileNameSchema = z
  .string(typed("File name"))
  .transform((value) => oneLine(value.split(/[\\/]/).pop() ?? ""))
  .pipe(
    z
      .string()
      .min(1, "File name is required")
      .max(150, "File name must not exceed 150 characters")
      .refine((value) => !/[<>]/.test(value), "File name must not contain < or >")
  );

export const createDocumentBody = bodyObject({
  documentType: z
    .string(typed("Document type"))
    .trim()
    .toLowerCase()
    .pipe(
      z.enum(DOCUMENT_TYPES, {
        error: `Document type must be one of: ${DOCUMENT_TYPES.join(", ")}`,
      })
    ),
  fileName: fileNameSchema,
  mimeType: z
    .string(typed("File type"))
    .trim()
    .toLowerCase()
    .pipe(z.enum(MIME_TYPES, { error: "Only PDF, JPEG and PNG files are accepted" })),
  sizeBytes: z
    .number(typed("File size"))
    .int("File size must be a whole number of bytes")
    .min(1, "The file is empty")
    .max(MAX_FILE_BYTES, `Files must be ${MAX_FILE_BYTES / 1024 / 1024} MB or smaller`),
});

export const documentParams = z.strictObject({ id: uuidSchema("Document ID") });