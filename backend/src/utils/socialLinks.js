// Social-media links typed in by a hospital's own representatives (task 6c).
//
// Anything a user can type into a public page is a risk (phishing, spam, links
// to gambling sites), so only profile pages on the platforms listed below are
// accepted, always over https, with passwords, ports, query strings and
// fragments removed. The same checker validates what is saved AND what is shown,
// so a bad value could never reach the public even if the database was edited.

// Platform -> the hostnames it may use (a leading www., m. or web. is ignored).
const PLATFORMS = {
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
};

export const SOCIAL_PLATFORMS = Object.keys(PLATFORMS);

export const SOCIAL_LABELS = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
};

const MAX_LENGTH = 300;
const SAFE_PATH = /^\/[\w.~%@+/-]*$/;

// Returns the cleaned address (https://host/path) or null if it is not acceptable.
export const cleanSocialUrl = (platform, value) => {
  const hosts = PLATFORMS[platform];
  if (!hosts || typeof value !== "string") return null;

  const input = value.trim();
  if (input.length === 0 || input.length > MAX_LENGTH) return null;

  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }

  // "javascript:", "data:", "ftp:" and similar are refused here.
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;

  const host = url.hostname.toLowerCase().replace(/^(www|m|web|mobile)\./, "");
  if (!hosts.includes(host)) return null;

  const path = url.pathname.replace(/\/+$/, "");

  // Facebook pages without a custom name are addressed by number.
  if (platform === "facebook" && path === "/profile.php") {
    const id = url.searchParams.get("id");
    return /^\d{5,20}$/.test(id ?? "") ? `https://${host}${path}?id=${id}` : null;
  }

  // A real page is required, not the platform's home page.
  if (path === "" || !SAFE_PATH.test(path)) return null;

  return `https://${host}${path}`;
};

// Cleans a stored { platform: url } object for public display: unknown platforms
// and invalid links are dropped. Always returns a plain object.
export const cleanSocialMedia = (value) => {
  const result = {};
  if (value === null || typeof value !== "object" || Array.isArray(value)) return result;

  for (const platform of SOCIAL_PLATFORMS) {
    const cleaned = cleanSocialUrl(platform, value[platform]);
    if (cleaned) result[platform] = cleaned;
  }

  return result;
};