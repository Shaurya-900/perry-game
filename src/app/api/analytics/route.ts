import { supabase } from "@/lib/supabase";
import { readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = new Set([
  "qr_open",
  "onboard_start",
  "onboard_complete",
  "first_run",
  "run_start",
  "run_end",
  "share",
  "share_fallback",
  "challenge_open",
  "challenge_accepted",
  "leaderboard_view",
]);

/** Fire-and-forget funnel counters. Never blocks the game. */
export async function POST(req: Request) {
  const body = await readJson<{ name?: string }>(req);
  const name = body?.name;
  const db = supabase();
  if (db && name && ALLOWED.has(name)) {
    await db.from("events").insert({ name });
  }
  return new Response(null, { status: 204 });
}
