// Throw these from controllers or middleware; the central error handler turns
// them into a consistent JSON response.
//
//   throw new ApiError(404, "Hospital not found");
//   throw new ApiError(409, "You have already reviewed this hospital", { code: "ALREADY_REVIEWED" });

const STATUS_CODES_TO_NAMES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "UNPROCESSABLE_ENTITY",
  429: "RATE_LIMITED",
  500: "INTERNAL_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

export const codeForStatus = (status) =>
  STATUS_CODES_TO_NAMES[status] ?? (status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST");

export class ApiError extends Error {
  /**
   * @param {number} status   HTTP status code
   * @param {string} message  Safe, user-facing message (never put internals here)
   * @param {object} [options]
   * @param {string} [options.code]     Machine-readable code, e.g. "NOT_FOUND"
   * @param {Array}  [options.errors]   Field errors: [{ field, message }]
   * @param {object} [options.headers]  Extra response headers, e.g. { "Retry-After": "5" }
   * @param {unknown} [options.cause]   Original error, kept for logs only
   */
  constructor(status, message, { code, errors, headers, cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.status = status;
    this.code = code ?? codeForStatus(status);
    this.errors = errors;
    this.headers = headers;
  }
}

export class ValidationError extends ApiError {
  constructor(errors, message = "Validation failed") {
    super(400, message, { code: "VALIDATION_ERROR", errors });
    this.name = "ValidationError";
  }
}