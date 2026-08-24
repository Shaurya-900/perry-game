import { supabase } from "@/lib/supabase";
import { bad, json, notConfigured, readJson } from "@/lib/http";
import { verifyRunToken } from "@/lib/token";
import {
  MAX_SUBMISSIONS_PER_WINDOW,
  SUBMISSION_WINDOW_MS,
  checkScore,
} from "@/lib/validate";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  token?: string;
  score?: number;
  durationMs?: number;
  fedoras?: number;
}

async function reject(
  db: SupabaseClient,
  playerId: string | null,
  reason: string,
  detail: unknown,
) {
  await db.from("rejected_submissions").insert({
    player_id: playerId,
    reason,
    detail: detail as Record<string, unknown>,
  });
  return bad(reason, 422);
}

export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body?.token) return bad("missing_token");

  const db = supabase();
  if (!db) return notConfigured();

  const verified = verifyRunToken(body.token);
  if (!verified.ok) return reject(db, null, `token_${verified.reason}`, body);
  const { runId, playerId, iat, seed } = verified.claims;

  const sub = {
    score: Math.trunc(Number(body.score)),
    durationMs: Math.trunc(Number(body.durationMs)),
    fedoras: Math.trunc(Number(body.fedoras ?? 0)),
  };
  const verdict = checkScore(sub, Date.now() - iat);
  if (!verdict.ok) return reject(db, playerId, verdict.reason, { ...body, runId });

  const since = new Date(Date.now() - SUBMISSION_WINDOW_MS).toISOString();
  const { count } = await db
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("player_id", playerId)
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_WINDOW) {
    return reject(db, playerId, "rate_limited", { count });
  }

  // The run id is the primary key, so a replayed token collides here.
  const { error: insertError } = await db.from("runs").insert({
    id: runId,
    player_id: playerId,
    score: sub.score,
    duration_ms: sub.durationMs,
    fedoras: sub.fedoras,
    seed,
  });
  if (insertError) {
    if (insertError.code === "23505") {
      return reject(db, playerId, "token_reused", { runId });
    }
    return bad("insert_failed", 500);
  }

  const { data: player } = await db
    .from("players")
    .select("best_score, runs")
    .eq("id", playerId)
    .maybeSingle();

  const previousBest = player?.best_score ?? 0;
  const isBest = sub.score > previousBest;
  await db
    .from("players")
    .update({
      best_score: Math.max(previousBest, sub.score),
      runs: (player?.runs ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", playerId);

  const best = Math.max(previousBest, sub.score);
  const { count: ahead } = await db
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("deleted", false)
    .gt("best_score", best);
  const { count: total } = await db
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("deleted", false)
    .gt("best_score", 0);

  return json({
    ok: true,
    best,
    isBest,
    rank: (ahead ?? 0) + 1,
    totalPlayers: total ?? 0,
  });
}
