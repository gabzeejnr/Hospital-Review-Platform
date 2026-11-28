-- Task 7: account management (suspension details) and the "last administrator"
-- safeguard. Run this once in the Supabase SQL editor (safe to run twice), after
-- the earlier migrations.

-- ---------------------------------------------------------------------------
-- When an administrator suspended an account, and why. The account's `is_active`
-- flag is what actually blocks sign-in and API access; these two columns only
-- explain it. Both are empty for an active account.
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMPTZ(6);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "suspension_reason" VARCHAR(500);

-- ---------------------------------------------------------------------------
-- The last active administrator can never be demoted, deactivated or deleted,
-- whoever tries and however (this app, the Supabase table editor, a SQL
-- statement). Without an administrator nobody could manage roles any more.
--
-- The advisory lock makes two simultaneous attempts queue up: the second one
-- sees the first one's result, so two administrators cannot remove each other
-- at the same moment and leave none.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION protect_last_admin() RETURNS trigger AS $$
DECLARE
  removing boolean;
BEGIN
  IF OLD.role = 'ADMIN' AND OLD.is_active THEN
    IF TG_OP = 'DELETE' THEN
      removing := true;
    ELSE
      removing := (NEW.role <> 'ADMIN' OR NOT NEW.is_active);
    END IF;

    IF removing THEN
      PERFORM pg_advisory_xact_lock(884100);

      IF NOT EXISTS (
        SELECT 1 FROM users WHERE role = 'ADMIN' AND is_active AND id <> OLD.id
      ) THEN
        RAISE EXCEPTION 'last_admin: the last active administrator cannot be removed, demoted or deactivated';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_protect_last_admin ON "users";
CREATE TRIGGER users_protect_last_admin
  BEFORE UPDATE OF role, is_active OR DELETE ON "users"
  FOR EACH ROW EXECUTE FUNCTION protect_last_admin();
