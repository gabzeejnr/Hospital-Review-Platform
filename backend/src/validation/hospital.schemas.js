import { z } from "zod";
import { typed, uuidSchema, intIdParamSchema, queryIntSchema } from "./common.js";

// Query strings arrive as text, so numbers are checked and converted here.

// The values the database allows in hospitals.ownership (a CHECK constraint).
export const OWNERSHIP_VALUES = ["federal", "state", "private"];

const CONTROL_CHARS = /[\p{Cc}\u200B\u2060\uFEFF\u202A-\u202E\u2066-\u2069]/gu;

// Free-text search: control characters removed, spaces collapsed, 2-100 characters.
const searchTextSchema = z
  .string(typed("Search text"))
  .transform((value) => value.replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(2, "Search text must be at least 2 characters")
      .max(100, "Search text must not exceed 100 characters")
  );

const coordinateSchema = (label, limit) =>
  z
    .string(typed(label))
    .regex(/^-?\d{1,3}(\.\d{1,10})?$/, `${label} must be a number`)
    .transform(Number)
    .refine((value) => Math.abs(value) <= limit, `${label} must be between -${limit} and ${limit}`);

// Hospital list / search / near-me.
export const listHospitalsQuery = z
  .strictObject({
    q: searchTextSchema.optional(),
    stateId: intIdParamSchema("State ID").optional(),
    lgaId: intIdParamSchema("LGA ID").optional(),
    typeId: intIdParamSchema("Type ID").optional(),
    ownership: z
      .string(typed("Ownership"))
      .trim()
      .toLowerCase()
      .pipe(
        z.enum(OWNERSHIP_VALUES, {
          error: `Ownership must be one of: ${OWNERSHIP_VALUES.join(", ")}`,
        })
      )
      .optional(),
    lat: coordinateSchema("Latitude", 90).optional(),
    lng: coordinateSchema("Longitude", 180).optional(),
    radiusKm: queryIntSchema("Radius", { min: 1, max: 100 }),
    sort: z
      .enum(["name", "newest", "rating", "distance", "relevance"], {
        error: "Sort must be name, newest, rating, distance or relevance",
      })
      .optional(),
    page: queryIntSchema("Page", { min: 1, max: 100000, fallback: 1 }),
    limit: queryIntSchema("Limit", { min: 1, max: 50, fallback: 20 }),
  })
  .refine((value) => (value.lat === undefined) === (value.lng === undefined), {
    message: "Latitude and longitude must be provided together",
    path: ["lat"],
  })
  .refine((value) => value.radiusKm === undefined || value.lat !== undefined, {
    message: "Radius needs latitude and longitude",
    path: ["radiusKm"],
  })
  .refine((value) => value.sort !== "distance" || value.lat !== undefined, {
    message: "Sorting by distance needs latitude and longitude",
    path: ["sort"],
  });

export const hospitalParams = z.strictObject({
  id: uuidSchema("Hospital ID"),
});

export const stateParams = z.strictObject({
  stateId: intIdParamSchema("State ID"),
});