import { supabase } from "@/lib/supabase";
import { json, notConfigured } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LiveRunner {
  playerId: string;
  name: string;
  score: number;
}

/** Rows older than this are treated as finished runs and simply ignored. */
const FRESH_MS = 10_000;

export async function GET() {
  const db = supabase();
  if (!db) return notConfigured();

  const since = new Date(Date.now() - FRESH_MS).toISOString();
  const { data } = await db
    .from("live_runs")
    .select("player_id, score, players!inner(name, deleted)")
    .gte("updated_at", since)
    .eq("players.deleted", false)
    .order("score", { ascending: false })
    .limit(6);

  const rows = (data ?? []) as unknown as {
    player_id: string;
    score: number;
    players: { name: string } | { name: string }[];
  }[];

  return json({
    ok: true,
    running: rows.map((r) => ({
      playerId: r.player_id,
      name: Array.isArray(r.players) ? r.players[0]?.name : r.players?.name,
      score: r.score,
    })),
  });
}
