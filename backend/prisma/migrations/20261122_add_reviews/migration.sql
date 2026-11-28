-- Reviews and ratings (roadmap task 6b)
-- Run this once in the Supabase SQL editor (Prisma only reads these tables; it does not create them).

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
CREATE TABLE reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  -- NULL after the author deletes their account: the review stays, anonymised.
  user_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  title           varchar(150) NOT NULL,
  comment         text NOT NULL,
  overall_rating  smallint NOT NULL,
  visited_on      date,
  department      varchar(100),
  is_anonymous    boolean NOT NULL DEFAULT false,
  status          varchar(30) NOT NULL DEFAULT 'pending_moderation',
  published_at    timestamptz,
  moderated_by    uuid REFERENCES users(id) ON DELETE SET NULL,
  moderated_at    timestamptz,
  moderation_note varchar(500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reviews_overall_rating_check CHECK (overall_rating BETWEEN 1 AND 5),
  CONSTRAINT reviews_status_check CHECK (status IN ('pending_moderation', 'published', 'rejected', 'removed')),
  CONSTRAINT reviews_title_length_check CHECK (char_length(title) BETWEEN 3 AND 150),
  CONSTRAINT reviews_comment_length_check CHECK (char_length(comment) BETWEEN 20 AND 5000),
  -- A review has a publication time exactly when it is published.
  CONSTRAINT reviews_published_at_check CHECK ((status = 'published') = (published_at IS NOT NULL)),
  -- One review per user per hospital (NULL users, i.e. anonymised ones, are exempt).
  CONSTRAINT reviews_user_hospital_unique UNIQUE (user_id, hospital_id)
);

CREATE INDEX reviews_hospital_status_published_idx ON reviews (hospital_id, status, published_at DESC);
CREATE INDEX reviews_user_idx ON reviews (user_id);
CREATE INDEX reviews_status_created_idx ON reviews (status, created_at);

-- ---------------------------------------------------------------------------
-- review_ratings: optional 1-5 ratings per category
-- ---------------------------------------------------------------------------
CREATE TABLE review_ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id  uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  category   varchar(40) NOT NULL,
  rating     smallint NOT NULL,

  CONSTRAINT review_ratings_category_check CHECK (category IN (
    'staff_professionalism', 'waiting_time', 'cleanliness', 'communication',
    'service_experience', 'facility_quality', 'billing_transparency', 'accessibility')),
  CONSTRAINT review_ratings_rating_check CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT review_ratings_review_category_unique UNIQUE (review_id, category)
);

CREATE INDEX review_ratings_category_idx ON review_ratings (category, rating);

-- ---------------------------------------------------------------------------
-- hospital_rating_stats: one row per hospital, kept up to date by triggers
-- ---------------------------------------------------------------------------
CREATE TABLE hospital_rating_stats (
  hospital_id     uuid PRIMARY KEY REFERENCES hospitals(id) ON DELETE CASCADE,
  review_count    integer NOT NULL DEFAULT 0,
  average_rating  numeric(3, 2) NOT NULL DEFAULT 0,
  -- Used for "top rated" sorting. A damped average, so one 5-star review does
  -- not outrank a hospital with 200 reviews averaging 4.8. 0 when unreviewed.
  ranking_score   numeric(4, 3) NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hospital_rating_stats_ranking_idx ON hospital_rating_stats (ranking_score DESC, review_count DESC);

-- Recalculates one hospital's numbers from its published reviews.
CREATE OR REPLACE FUNCTION refresh_hospital_rating_stats(p_hospital_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_avg numeric;
BEGIN
  -- One recalculation per hospital at a time, so overlapping changes cannot
  -- leave stale numbers behind.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_hospital_id::text, 0));

  SELECT count(*), coalesce(avg(overall_rating), 0)
    INTO v_count, v_avg
    FROM reviews
   WHERE hospital_id = p_hospital_id AND status = 'published';

  INSERT INTO hospital_rating_stats (hospital_id, review_count, average_rating, ranking_score, updated_at)
  VALUES (
    p_hospital_id,
    v_count,
    round(v_avg, 2),
    CASE WHEN v_count = 0 THEN 0 ELSE round((v_count * v_avg + 5 * 3.5) / (v_count + 5), 3) END,
    now()
  )
  ON CONFLICT (hospital_id) DO UPDATE
    SET review_count   = EXCLUDED.review_count,
        average_rating = EXCLUDED.average_rating,
        ranking_score  = EXCLUDED.ranking_score,
        updated_at     = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION reviews_refresh_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_hospital_rating_stats(OLD.hospital_id);
  ELSE
    PERFORM refresh_hospital_rating_stats(NEW.hospital_id);
    IF TG_OP = 'UPDATE' AND NEW.hospital_id <> OLD.hospital_id THEN
      PERFORM refresh_hospital_rating_stats(OLD.hospital_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER reviews_refresh_stats_trg
  AFTER INSERT OR DELETE OR UPDATE OF status, overall_rating, hospital_id ON reviews
  FOR EACH ROW EXECUTE FUNCTION reviews_refresh_stats();

-- Keeps reviews.updated_at honest even when rows are edited directly in SQL.
CREATE OR REPLACE FUNCTION reviews_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reviews_set_updated_at_trg
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION reviews_set_updated_at();

-- Every hospital always has a stats row (zeros until it is reviewed), so
-- sorting by rating never has to deal with missing rows.
CREATE OR REPLACE FUNCTION hospitals_create_rating_stats()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  INSERT INTO hospital_rating_stats (hospital_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NULL;
END;
$$;

CREATE TRIGGER hospitals_create_rating_stats_trg
  AFTER INSERT ON hospitals
  FOR EACH ROW EXECUTE FUNCTION hospitals_create_rating_stats();

-- Rows for the hospitals that already exist.
INSERT INTO hospital_rating_stats (hospital_id)
SELECT id FROM hospitals
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Row level security: like the other tables, closed to direct Supabase API
-- access. The backend connects with a role that bypasses it.
-- ---------------------------------------------------------------------------
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_rating_stats ENABLE ROW LEVEL SECURITY;
