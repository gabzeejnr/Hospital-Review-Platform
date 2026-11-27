// Validates and sanitizes req.body, req.params and req.query with Zod schemas.
//
//   router.post("/register", validate({ body: registerBody }), register);
//   router.get("/hospitals/:id", validate({ params: z.strictObject({ id: uuidSchema("Hospital ID") }) }), ...);
//
// On success the parsed (trimmed, normalized, unknown-fields-free) data replaces
// req.body and req.params. Express 5 makes req.query read-only, so the parsed
// query is available as req.validatedQuery.
// On failure it passes a ValidationError to the central error handler, which
// responds 400 with a list of field errors.

import { ValidationError } from "../utils/ApiError.js";
import { formatZodIssues } from "../utils/formatZodIssues.js";

export const validate =
  ({ body, params, query } = {}) =>
  (req, res, next) => {
    const errors = [];
    const parsed = {};

    const targets = [
      ["body", body, req.body ?? {}],
      ["params", params, req.params ?? {}],
      ["query", query, req.query ?? {}],
    ];

    for (const [source, schema, input] of targets) {
      if (!schema) continue;

      const result = schema.safeParse(input);

      if (result.success) {
        parsed[source] = result.data;
      } else {
        errors.push(...formatZodIssues(result.error.issues, source));
      }
    }

    if (errors.length > 0) {
      return next(new ValidationError(errors));
    }

    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.params !== undefined) req.params = parsed.params;
    if (parsed.query !== undefined) req.validatedQuery = parsed.query;

    next();
  };