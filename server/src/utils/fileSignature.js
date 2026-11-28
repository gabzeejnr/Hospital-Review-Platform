// Works out what a file REALLY is from its first bytes. A filename or a
// Content-Type header is only what the sender claims; the first bytes are what
// the file is. Used to refuse, say, a program renamed to "licence.pdf".

const startsWith = (bytes, signature) =>
  signature.every((byte, index) => bytes[index] === byte);

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

// Returns "application/pdf", "image/png", "image/jpeg", or null if unrecognised.
export const detectMime = (bytes) => {
  if (!bytes || bytes.length < 3) return null;
  if (startsWith(bytes, PDF)) return "application/pdf";
  if (startsWith(bytes, PNG)) return "image/png";
  if (startsWith(bytes, JPEG)) return "image/jpeg";
  return null;
};