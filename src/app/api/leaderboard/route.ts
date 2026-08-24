import { supabase, isFrozen } from "@/lib/supabase";
import { json, notConfigured } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface LeaderboardRow {
  rank: number;
  name: string;
  score: number;
  playerId: string;
}

export interface LeaderboardPayload {
  ok: true;
  top: LeaderboardRow[];
  totalPlayers: number;
  playersToday: number;
  frozen: boolean;
  me: { rank: number; score: number; toTopTen: number } | null;
}

/** Five second cache, shared by every phone and the booth display. */
let cache: { at: number; body: Omit<LeaderboardPayload, "me"> } | null = null;
const TTL = 5000;

export async function GET(req: Request) {
  const db = supabase();
  if (!db) return notConfigured();
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");

  if (!cache || Date.now() - cache.at > TTL) {
    const [top, total, today, frozen] = await Promise.all([
      db
        .from("leaderboard")
        .select("rank, player_id, name, best_score")
        .order("rank", { ascending: true })
        .limit(20),
      db
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("deleted", false)
        .gt("best_score", 0),
      db
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("deleted", false)
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString()),
      isFrozen(db),
    ]);
    cache = {
      at: Date.now(),
      body: {
        ok: true,
        top: (top.data ?? []).map((r) => ({
          rank: Number(r.rank),
          name: r.name as string,
          score: r.best_score as number,
          playerId: r.player_id as string,
        })),
        totalPlayers: total.count ?? 0,
        playersToday: today.count ?? 0,
        frozen,
      },
    };
  }

  let me: LeaderboardPayload["me"] = null;
  if (playerId) {
    const { data: p } = await db
      .from("players")
      .select("best_score")
      .eq("id", playerId)
      .eq("deleted", false)
      .maybeSingle();
    if (p) {
      const { count: ahead } = await db
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("deleted", false)
        .gt("best_score", p.best_score);
      const rank = (ahead ?? 0) + 1;
      const tenth = cache.body.top[9]?.score ?? 0;
      me = {
        rank,
        score: p.best_score,
        toTopTen: rank > 10 ? Math.max(1, tenth - p.best_score + 1) : 0,
      };
    }
  }

  return json(
    { ...cache.body, me },
    { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } },
  );
}
