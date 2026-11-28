import { z } from "zod";
import { normalizePhone, E164 } from "./phone.js";

// hospitals.hospital_data is imported, unvetted data. It has been seen to hold
// spam image links on hijacked domains, social-media links belonging to an
// unrelated company, and placeholder text such as "TBD - TBD" and "unknown".
//
// This module is the ONLY route from that column to the public API. It builds
// the strictly checked `contact`, `services` and `info` parts of a hospital and
// ignores everything else. Images and social-media links are deliberately never
// read: social media comes back only for claimed hospitals, typed in by the
// hospital itself (task 6c).

const MAX_ITEMS = 30;
const MAX_TEXT = 100;
const CONTROL_CHARS = /[\p{Cc}\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;

// "TBD", "unknown", "N/A", "none", "-" and combinations such as "TBD - TBD".
const PLACEHOLDER =
  /^(?:tbd|unknown|n\/a|na|none|null|undefined|nil|not available|not specified|-+)(?:[\s–-]+(?:tbd|unknown|n\/a|na|none|null|undefined|nil))*$/i;

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

// Plain text only: no markup characters, no placeholders, a sensible length.
const cleanText = (value, max = MAX_TEXT) => {
  if (typeof value !== "string") return null;

  const text = value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();

  if (!text || text.length > max) return null;
  if (/[<>]/.test(text) || PLACEHOLDER.test(text)) return null;

  return text;
};

const cleanPhone = (value) => {
  if (typeof value !== "string" && typeof value !== "number") return null;

  const phone = normalizePhone(value, { allowLandline: true });

  return E164.test(phone) ? phone : null;
};

const emailCheck = z.email();

const cleanEmail = (value) => {
  if (typeof value !== "string") return null;

  const email = value.trim().toLowerCase();

  return email.length <= 254 && emailCheck.safeParse(email).success ? email : null;
};

// http(s) only, no embedded passwords, must look like a real host name.
const cleanWebsite = (value) => {
  if (typeof value !== "string") return null;

  let text = value.trim();

  if (!text || text.length > 2048 || PLACEHOLDER.test(text)) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = "https://" + text;

  try {
    const url = new URL(text);

    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (!url.hostname.includes(".")) return null;

    const plain = url.pathname === "/" && !url.search && !url.hash;

    return plain ? url.origin : url.href;
  } catch {
    return null;
  }
};

const byLetters = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });

// Accepts an array (or a single value), cleans each item, removes duplicates
// regardless of letter case, optionally sorts A-Z, and caps the length.
const cleanList = (value, clean = cleanText, { sort = false } = {}) => {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  const seen = new Set();
  const result = [];

  for (const item of items.slice(0, 500)) {
    const cleaned = clean(item);
    if (cleaned === null) continue;

    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  if (sort) result.sort(byLetters);

  return result.slice(0, MAX_ITEMS);
};

// Always returns the same three keys, so the frontend never has to check
// whether a part exists. Missing text is null and missing lists are [].
// The lists keep the names used in the approved shape (phoneNumber, email,
// insurance, accreditation) but are arrays, because a hospital can have several.
export const publicHospitalDetails = (data) => {
  const source = isObject(data) ? data : {};
  const contact = isObject(source.contact) ? source.contact : {};
  const info = isObject(source.info) ? source.info : {};

  return {
    contact: {
      phoneNumber: cleanList(contact.phone_number, cleanPhone),
      email: cleanList(contact.email, cleanEmail),
      website: cleanWebsite(contact.website),
    },
    services: cleanList(source.services),
    info: {
      hours: cleanText(info.hours, 200),
      facilities: cleanList(info.facilities, cleanText, { sort: true }),
      insurance: cleanList(info.insurance),
      accreditation: cleanList(info.accreditation),
    },
  };
};