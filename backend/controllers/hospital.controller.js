import prisma from "../src/config/prisma.js";
import { ApiError } from "../src/utils/ApiError.js";
import { boundingBox, distanceKm } from "../src/utils/geo.js";
import { publicHospitalDetails } from "../src/utils/hospitalDetails.js";
import { OWNERSHIP_VALUES } from "../src/validation/hospital.schemas.js";

// Public hospital directory (no sign-in needed). Query strings and the hospital
// ID are already validated and converted by validate()
// (see src/validation/hospital.schemas.js).

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------

const OWNERSHIP_LABELS = {
  federal: "Federal government",
  state: "State government",
  private: "Private",
};

// hospitals.verification_status is an internal workflow with seven values:
// unclaimed, claim_pending, claimed, verification_pending, verified, rejected,
// suspended. The public only sees three, so a rejected claim or a suspension is
// never shown on a hospital's page. Change the mapping here if you disagree.
const PUBLIC_VERIFICATION_STATUS = {
  verified: "verified",
  claimed: "claimed",
  verification_pending: "claimed",
};
const publicVerificationStatus = (status) =>
  PUBLIC_VERIFICATION_STATUS[status] ?? "unclaimed";

const DEFAULT_RADIUS_KM = 25;
const MAX_SEARCH_WORDS = 6;
// Safety cap on how many rows a near-me search will load for exact distance work.
const MAX_GEO_CANDIDATES = 20000;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------
const listSelect = {
  id: true,
  hospital_name: true,
  ownership: true,
  city: true,
  address: true,
  latitude: true,
  longitude: true,
  verification_status: true,
  hospital_types: { select: { id: true, name: true } },
  states: { select: { id: true, name: true } },
  lgas: { select: { id: true, name: true } },
  rating_stats: { select: { reviewCount: true, averageRating: true } },
};

const detailSelect = {
  ...listSelect,
  description: true,
  year_established: true,
  accessibility_information: true,
  hospital_data: true,
  created_at: true,
  updated_at: true,
};

// Prisma returns Decimal objects for coordinates; the API sends plain numbers.
const toNumber = (value) => (value === null || value === undefined ? null : Number(value));

// Average of the published reviews; null until a hospital has been reviewed.
const presentRating = (stats) => ({
  average: stats && stats.reviewCount > 0 ? Number(stats.averageRating) : null,
  count: stats?.reviewCount ?? 0,
});

const presentHospital = (row, distance) => ({
  id: row.id,
  name: row.hospital_name,
  type: row.hospital_types,
  ownership: row.ownership,
  state: row.states,
  lga: row.lgas,
  city: row.city,
  address: row.address,
  latitude: toNumber(row.latitude),
  longitude: toNumber(row.longitude),
  verificationStatus: publicVerificationStatus(row.verification_status),
  rating: presentRating(row.rating_stats),
  ...(distance !== undefined && { distanceKm: distance }),
});

const presentHospitalDetail = (row) => {
  // hospital_data is unvetted imported data: only the strictly cleaned parts
  // chosen in src/utils/hospitalDetails.js ever reach the public.
  const details = publicHospitalDetails(row.hospital_data);

  return {
    ...presentHospital(row),
    description: row.description,
    yearEstablished: row.year_established,
    accessibilityInformation: row.accessibility_information,
    ...(details && { details }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
// Prisma does not escape the LIKE wildcards in text it is given, so a search for
// "mary_ann" or "100%" would treat _ and % as wildcards, and a backslash would
// swallow the next character. Escape them so every character matches literally.
const escapeLike = (text) => text.replace(/[\\%_]/g, "\\$&");

// Every word of the search text must match the hospital's name, city, LGA or
// state (any letter case), so "general hospital ikeja" works.
const buildWhere = ({ q, stateId, lgaId, typeId, ownership }) => {
  const where = {};

  if (stateId) where.state_id = stateId;
  if (lgaId) where.lga_id = lgaId;
  if (typeId) where.hospital_type_id = typeId;
  if (ownership) where.ownership = ownership; // already validated and lower-cased

  if (q) {
    where.AND = q
      .split(" ")
      .slice(0, MAX_SEARCH_WORDS)
      .map((word) => escapeLike(word))
      .map((word) => ({
        OR: [
          { hospital_name: { contains: word, mode: "insensitive" } },
          { city: { contains: word, mode: "insensitive" } },
          { lgas: { is: { name: { contains: word, mode: "insensitive" } } } },
          { states: { is: { name: { contains: word, mode: "insensitive" } } } },
        ],
      }));
  }

  return where;
};

const setCache = (res, scope, seconds) =>
  res.set("Cache-Control", `${scope}, max-age=${seconds}`);

// GET /api/hospitals
export const listHospitals = async (req, res) => {
  const query = req.validatedQuery;
  const { page, limit } = query;

  const where = buildWhere(query);
  const nearMe = query.lat !== undefined;
  const sort = query.sort ?? (nearMe ? "distance" : "name");

  let rows;
  let total;
  const distances = new Map();

  if (!nearMe) {
    // "rating" uses the damped ranking score kept by the database, so a single
    // 5-star review does not outrank a well-reviewed hospital; unreviewed last.
    const orderBy =
      sort === "newest"
        ? [{ created_at: "desc" }, { id: "asc" }]
        : sort === "rating"
          ? [
            { rating_stats: { rankingScore: "desc" } },
            { rating_stats: { reviewCount: "desc" } },
            { hospital_name: "asc" },
            { id: "asc" },
          ]
          : [{ hospital_name: "asc" }, { id: "asc" }];

    [rows, total] = await Promise.all([
      prisma.hospitals.findMany({
        where,
        select: listSelect,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.hospitals.count({ where }),
    ]);
  } else {
    const radius = query.radiusKm ?? DEFAULT_RADIUS_KM;
    const box = boundingBox(query.lat, query.lng, radius);

    // 1. Let the database discard everything outside the rectangle.
    const candidates = await prisma.hospitals.findMany({
      where: {
        ...where,
        latitude: { gte: box.minLat, lte: box.maxLat },
        longitude: { gte: box.minLng, lte: box.maxLng },
      },
      select: {
        id: true,
        hospital_name: true,
        latitude: true,
        longitude: true,
        created_at: true,
        rating_stats: { select: { rankingScore: true, reviewCount: true } },
      },
      take: MAX_GEO_CANDIDATES,
    });

    // 2. Exact distance for what is left; drop the rectangle's corners.
    const nearby = candidates
      .map((row) => ({
        ...row,
        km: distanceKm(query.lat, query.lng, Number(row.latitude), Number(row.longitude)),
      }))
      .filter((row) => row.km <= radius);

    const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

    if (sort === "name") {
      nearby.sort(
        (a, b) =>
          a.hospital_name.localeCompare(b.hospital_name, "en", { sensitivity: "base" }) ||
          byId(a, b)
      );
    } else if (sort === "newest") {
      nearby.sort((a, b) => b.created_at - a.created_at || byId(a, b));
    } else if (sort === "rating") {
      const score = (row) => Number(row.rating_stats?.rankingScore ?? 0);
      const count = (row) => row.rating_stats?.reviewCount ?? 0;

      nearby.sort(
        (a, b) =>
          score(b) - score(a) ||
          count(b) - count(a) ||
          a.hospital_name.localeCompare(b.hospital_name, "en", { sensitivity: "base" }) ||
          byId(a, b)
      );
    } else {
      nearby.sort((a, b) => a.km - b.km || byId(a, b));
    }

    total = nearby.length;

    // 3. Load full details for the requested page only.
    const pageItems = nearby.slice((page - 1) * limit, page * limit);

    for (const item of pageItems) {
      distances.set(item.id, Math.round(item.km * 10) / 10);
    }

    const full =
      pageItems.length === 0
        ? []
        : await prisma.hospitals.findMany({
          where: { id: { in: pageItems.map((item) => item.id) } },
          select: listSelect,
        });

    const fullById = new Map(full.map((row) => [row.id, row]));
    rows = pageItems.map((item) => fullById.get(item.id)).filter(Boolean);
  }

  // A search with the visitor's coordinates in the URL must not sit in shared caches.
  setCache(res, nearMe ? "private" : "public", 60);

  return res.status(200).json({
    success: true,
    hospitals: rows.map((row) => presentHospital(row, distances.get(row.id))),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
};

// GET /api/hospitals/:id
export const getHospital = async (req, res) => {
  const hospital = await prisma.hospitals.findUnique({
    where: { id: req.params.id },
    select: detailSelect,
  });

  if (!hospital) {
    throw new ApiError(404, "Hospital not found", { code: "HOSPITAL_NOT_FOUND" });
  }

  setCache(res, "public", 60);

  return res.status(200).json({
    success: true,
    hospital: presentHospitalDetail(hospital),
  });
};

// GET /api/hospitals/filters: the choices for the search filters.
export const getHospitalFilters = async (req, res) => {
  const [types, ownerships] = await Promise.all([
    prisma.hospital_types.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { hospitals: true } } },
    }),
    prisma.hospitals.groupBy({
      by: ["ownership"],
      _count: { _all: true },
      orderBy: { ownership: "asc" },
    }),
  ]);

  const ownershipCounts = new Map(
    ownerships.map((row) => [row.ownership, row._count._all])
  );

  setCache(res, "public", 3600);

  return res.status(200).json({
    success: true,
    types: types.map((type) => ({
      id: type.id,
      name: type.name,
      hospitalCount: type._count.hospitals,
    })),
    // Every allowed value is listed, even one with no hospitals yet.
    ownerships: OWNERSHIP_VALUES.map((value) => ({
      value,
      label: OWNERSHIP_LABELS[value],
      hospitalCount: ownershipCounts.get(value) ?? 0,
    })),
  });
};