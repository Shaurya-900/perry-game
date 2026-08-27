import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client. The service role key never reaches the browser
 * — every table has RLS on with no policies, so the only way in is through a
 * route handler.
 *
 * If the environment is not configured the app still runs: the game is fully
 * playable and scores queue up locally. That keeps `npm run dev` useful
 * without credentials and means a Supabase outage at the booth degrades to
 * "local high score" instead of a broken page.
 */
let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function isConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function isFrozen(db: SupabaseClient): Promise<boolean> {
  if (process.env.LEADERBOARD_FROZEN === "1") return true;
  const { data } = await db
    .from("settings")
    .select("value")
    .eq("key", "leaderboard_frozen")
    .maybeSingle();
  return data?.value === true;
}

export async function logEvent(db: SupabaseClient, name: string): Promise<void> {
  await db.from("events").insert({ name });
}
