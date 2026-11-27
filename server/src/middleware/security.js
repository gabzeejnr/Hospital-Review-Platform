import helmet from "helmet";

// Standard security headers for the API (nosniff, frame protection, HSTS, a
// strict Content-Security-Policy, no X-Powered-By, ...).
const apiHelmet = helmet();

// Swagger UI loads inline scripts and styles, which the strict policy would
// block, so the docs pages get everything except the CSP.
const docsHelmet = helmet({ contentSecurityPolicy: false });

export const securityHeaders = (req, res, next) =>
  (req.path.startsWith("/api-docs") ? docsHelmet : apiHelmet)(req, res, next);

// Auth responses contain session tokens: make sure browsers, proxies and CDNs
// never cache them.
export const noStore = (req, res, next) => {
  res.set({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  });
  next();
};