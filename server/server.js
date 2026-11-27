import "dotenv/config";
import express from "express";
import swaggerUi from "swagger-ui-express";
import authRoutes from "./src/routes/authRoutes.js";
import userRoutes from "./src/routes/userRoutes.js";
import hospitalRoutes from "./src/routes/hospitalRoutes.js";
import locationRoutes from "./src/routes/locationRoutes.js";
import reviewRoutes from "./src/routes/reviewRoutes.js";
import moderationRoutes from "./src/routes/moderationRoutes.js";
import { apiLimiter } from "./src/middleware/rateLimiter.js";
import { requestId } from "./src/middleware/requestId.js";
import { securityHeaders, noStore } from "./src/middleware/security.js";
import { corsMiddleware } from "./src/config/cors.js";
import { notFoundHandler, errorHandler } from "./src/middleware/errorHandler.js";

import swaggerSpec from "./src/config/swagger.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a reverse proxy (Render, Railway, Nginx...) set TRUST_PROXY=1 so rate
// limits see each visitor's real IP instead of the proxy's. Leave unset locally.
const trustProxyHops = Number(process.env.TRUST_PROXY);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

// Give every request an ID (used in logs and error responses)
app.use(requestId);

// Security headers (Helmet), then CORS limited to the allowed frontend origins
app.use(securityHeaders);
app.use(corsMiddleware);

// Middleware
// Reject oversized bodies early (10 KB is plenty for this API)
app.use(express.json({ limit: "10kb" }));

// Swagger documentation: always on locally; in production only when
// ENABLE_API_DOCS=true
if (
  process.env.NODE_ENV !== "production" ||
  process.env.ENABLE_API_DOCS === "true"
) {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      explorer: true,
      customSiteTitle: "Hospital Review Platform API Docs",
    })
  );
}

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to Hospital Review Platform",
    status: "Backend is running successfully",
    documentation: "/api-docs",
  });
});

// Rate limit every API route
app.use("/api", apiLimiter);

// Public hospital directory and the states / LGAs used by its filters
app.use("/api/hospitals", hospitalRoutes);
app.use("/api/states", locationRoutes);

// Reviews (edit / delete your own) and moderation (moderators and admins only)
app.use("/api/reviews", noStore, reviewRoutes);
app.use("/api/moderation", noStore, moderationRoutes);

// Auth responses carry session tokens: never let them be cached
app.use("/api/auth", noStore, authRoutes);

// Profile and preferences (personal data: never cached)
app.use("/api/users", noStore, userRoutes);

// Unknown routes -> 404, then the central error handler (must stay last)
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Swagger docs at http://localhost:${PORT}/api-docs`);
});