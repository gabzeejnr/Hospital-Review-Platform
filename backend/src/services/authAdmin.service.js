import { createClient } from "@supabase/supabase-js";

// Supabase's side of suspending an account (task 7).
//
// The real control is this app's own database: a suspended account has
// is_active = false, and both sign-in and every API request check it, so the
// person is locked out on their very next request. This call adds a second lock
// inside Supabase itself, so a suspended person also cannot get new tokens from
// Supabase directly. It needs SUPABASE_SERVICE_ROLE_KEY and is BEST EFFORT: if the
// key is missing or Supabase is unreachable it logs and returns false, and the
// suspension still stands.

let client;

const getAuthAdmin = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !process.env.SUPABASE_URL) return null;

  client ??= createClient(process.env.SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });

  return client.auth.admin;
};

// ~100 years, Supabase's way of saying "banned until further notice".
const BAN_FOR = "876000h";

// blocked = true stops Supabase issuing tokens to this person; false lifts it.
// Returns whether Supabase was updated.
export const setSignInBlocked = async (userId, blocked) => {
  const admin = getAuthAdmin();
  if (!admin) return false;

  try {
    const { error } = await admin.updateUserById(userId, { ban_duration: blocked ? BAN_FOR : "none" });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error(
      `Could not ${blocked ? "block" : "unblock"} sign-in at Supabase (the account is still ${blocked ? "suspended" : "reactivated"} here):`,
      error.message
    );
    return false;
  }
};