import { randomUUID } from "node:crypto";
import { runWithRequestContext } from "../utils/requestContext.js";

// Gives every request an ID (req.id), returns it in the X-Request-Id header and
// stores it, with the client IP and user agent, in the request context used by
// audit logging. Error responses and server logs include the ID, so a user's
// error report can be matched to the exact log line and audit events.
// A client-supplied ID is only accepted when it looks safe; otherwise a new one
// is generated.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export const requestId = (req, res, next) => {
  const incoming = req.get("x-request-id");

  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.set("X-Request-Id", req.id);

  runWithRequestContext(
    {
      requestId: req.id,
      ip: req.ip,
      userAgent: req.get("user-agent")?.slice(0, 255),
    },
    next
  );
};