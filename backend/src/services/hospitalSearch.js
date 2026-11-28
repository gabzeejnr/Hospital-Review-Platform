import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

// Typo-tolerant hospital search, used only when the normal (exact) search finds
// nothing. It relies on the PostgreSQL pg_trgm extension, which compares the
// three-letter pieces of two words, so "hosptial", "ibadn" and "lagoss" still
// find "Hospital", "Ibadan" and "Lagos". Enable it once with the SQL in
// prisma/migrations/20261124_add_claims_and_fuzzy_search/migration.sql.

// ---------------------------------------------------------------------------
// Settings you may want to change
// ---------------------------------------------------------------------------
export const MAX_SEARCH_WORDS = 6;

// Words shorter than this must match exactly (a typo in "oyo" is a different word).
const FUZZY_MIN_LENGTH = 4;

// How close a word must be, from 0 to 1. Short words are stricter, because a
// one-letter slip changes a larger share of their letters.
const SHORT_WORD_LENGTH = 6;
const SHORT_WORD_THRESHOLD = 0.6;
const LONG_WORD_THRESHOLD = 0.4;

// Safety cap on how many close matches are loaded.
const MAX_CLOSE_MATCHES = 2000;

// Weight of each place a word can match in. A hit in the name counts most.
const FIELD_WEIGHT = { name: 1, city: 0.9, lga: 0.8, state: 0.8 };

// ---------------------------------------------------------------------------

// A "%", "_" or "\" typed by a user must match literally in LIKE patterns.
export const escapeLike = (text) => text.replace(/[\\%_]/g, "\\$&");

export const searchWords = (q) => q.split(" ").filter(Boolean).slice(0, MAX_SEARCH_WORDS);

const FIELDS = {
  name: Prisma.sql`h.hospital_name`,
  city: Prisma.sql`h.city`,
  lga: Prisma.sql`coalesce(l.name, '')`,
  state: Prisma.sql`s.name`,
};

// SQL for how well one search word matches one place: 1 for a plain substring
// match, the trigram similarity for a close match, 0 for no match.
const fieldScore = (word, field, weight) => {
  const column = FIELDS[field];
  const like = `%${escapeLike(word)}%`;

  if (word.length < FUZZY_MIN_LENGTH) {
    return Prisma.sql`(CASE WHEN ${column} ILIKE ${like} THEN ${weight}::float8 ELSE 0 END)`;
  }

  const threshold = word.length >= SHORT_WORD_LENGTH ? LONG_WORD_THRESHOLD : SHORT_WORD_THRESHOLD;

  return Prisma.sql`(CASE
    WHEN ${column} ILIKE ${like} THEN ${weight}::float8
    WHEN word_similarity(${word}, ${column}) >= ${threshold}
      THEN word_similarity(${word}, ${column})::float8 * ${weight}::float8
    ELSE 0 END)`;
};

const wordScore = (word) =>
  Prisma.sql`GREATEST(${Prisma.join(
    Object.entries(FIELD_WEIGHT).map(([field, weight]) => fieldScore(word, field, weight)),
    ", "
  )})`;

// Returns [{ id, score }] for hospitals where EVERY word matches the name, city,
// LGA or state at least closely, best matches first. Filters are applied here so
// the cap above cannot hide results the visitor filtered for. Never throws: if
// the extension is not installed, it logs and returns nothing, and the visitor
// simply sees the (empty) exact result.
export const findCloseMatches = async ({ q, stateId, lgaId, typeId, ownership }) => {
  const words = searchWords(q);
  if (words.length === 0) return [];

  const conditions = [Prisma.sql`TRUE`];
  if (stateId) conditions.push(Prisma.sql`h.state_id = ${stateId}`);
  if (lgaId) conditions.push(Prisma.sql`h.lga_id = ${lgaId}`);
  if (typeId) conditions.push(Prisma.sql`h.hospital_type_id = ${typeId}`);
  if (ownership) conditions.push(Prisma.sql`h.ownership = ${ownership}`);

  // Columns s1, s2, ... hold each word's score, so each is worked out once.
  const scoreColumns = words.map((word, i) => Prisma.sql`${wordScore(word)} AS ${Prisma.raw(`s${i + 1}`)}`);
  const mustMatch = words.map((_, i) => Prisma.raw(`s${i + 1} > 0`));
  const average = Prisma.raw(`(${words.map((_, i) => `s${i + 1}`).join(" + ")}) / ${words.length}`);

  try {
    const rows = await prisma.$queryRaw`
      SELECT id, ${average}::float8 AS score
      FROM (
        SELECT h.id, h.hospital_name, ${Prisma.join(scoreColumns, ", ")}
        FROM hospitals h
        JOIN states s ON s.id = h.state_id
        LEFT JOIN lgas l ON l.id = h.lga_id
        WHERE ${Prisma.join(conditions, " AND ")}
      ) matches
      WHERE ${Prisma.join(mustMatch, " AND ")}
      ORDER BY score DESC, hospital_name ASC, id ASC
      LIMIT ${MAX_CLOSE_MATCHES}`;

    return rows.map((row) => ({ id: row.id, score: Number(row.score) }));
  } catch (error) {
    console.error("Close-match search failed (is the pg_trgm extension enabled?):", error.message);
    return [];
  }
};