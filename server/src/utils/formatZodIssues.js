// Turns Zod issues into [{ field, message }].
// Submitted values are never included, so a password can't leak into a response or a log.

const fieldName = (path) => path.map(String).join(".");

export const formatZodIssues = (issues, source = "body") => {
  const errors = [];

  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        errors.push({
          field: fieldName([...issue.path, key]),
          message: "Unexpected field",
        });
      }
    } else {
      // A body that is not an object arrives with an empty path.
      errors.push({
        field: issue.path.length === 0 ? source : fieldName(issue.path),
        message: issue.message,
      });
    }
  }

  // Drop exact duplicates (same field + same message).
  const seen = new Set();
  return errors.filter(({ field, message }) => {
    const key = `${field}|${message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};