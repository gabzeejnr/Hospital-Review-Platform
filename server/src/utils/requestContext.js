import { AsyncLocalStorage } from "node:async_hooks";

// Holds per-request details (request ID, client IP, user agent) so that code
// deep inside a request, such as audit logging, can read them without having to
// pass `req` around.
const storage = new AsyncLocalStorage();

export const runWithRequestContext = (context, callback) =>
  storage.run(context, callback);

export const getRequestContext = () => storage.getStore();