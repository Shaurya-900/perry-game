import { supabase } from "@/lib/supabase";
import { readJson } from "@/lib/http";
import { verifyRunToken } from "@/lib/token";
import { MAX_SCORE_RATE } from "@/game/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  token?: string;
  score?: number;
}

/**
 * Heartbeat from a run in progress, so the booth display can show a score
 * climbing in real time.
 *
 * Always answers 204: this fires every couple of seconds during play and must
 * never surface an error to the player or block the game. The run token gates
 * it, so nobody can push an arbitrary name and score onto the stall monitor.
 */
export async function POST(req: Request) {
  const done = new Response(null, { status: 204 });
  const body = await readJson<Body>(req);
  if (!body?.token) return done;

  const db = supabase();
  if (!db) return done;

  const verified = verifyRunToken(body.token);
  if (!verified.ok) return done;

  // Bound by the same ceiling the submit route uses, so a tampered heartbeat
  // cannot put an impossible number on the wall even briefly.
  const elapsed = Math.max(1, (Date.now() - verified.claims.iat) / 1000);
  const raw = Math.trunc(Number(body.score));
  if (!Number.isFinite(raw) || raw < 0) return done;
  const score = Math.min(raw, Math.ceil(MAX_SCORE_RATE * elapsed));

  await db.from("live_runs").upsert({
    player_id: verified.claims.playerId,
    score,
    updated_at: new Date().toISOString(),
  });
  return done;
}
