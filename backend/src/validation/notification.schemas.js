import { z } from "zod";
import { uuidSchema, queryIntSchema } from "./common.js";

export const notificationParams = z.strictObject({ id: uuidSchema("Notification ID") });

export const notificationsQuery = z.strictObject({
  // ?unread=true shows only notifications not yet read.
  unread: z.enum(["true", "false"], { error: "unread must be true or false" }).optional(),
  page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
  limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 20 }),
});