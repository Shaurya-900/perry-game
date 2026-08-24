import { supabase, isFrozen } from "@/lib/supabase";
import { adminAuthorised, keyFrom } from "@/lib/admin";
import { bad, json, notConfigured } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AdminStats {
  ok: true;
  players: number;
  optedIn: number;
  runsTotal: number;
  runsToday: number;
  rejected: number;
  frozen: boolean;
  funnel: Record<string, number>;
  runsPerHour: { hour: string; runs: number }[];
  recent: { id: string; name: string; email: string; best: number; runs: number }[];
}

export async function GET(req: Request) {
  if (!adminAuthorised(keyFrom(req))) return bad("unauthorised", 401);
  const db = supabase();
  if (!db) return notConfigured();

  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [players, optedIn, runsTotal, runsToday, rejected, recentRuns, events, recent, frozen] =
    await Promise.all([
      db.from("players").select("id", { count: "exact", head: true }).eq("deleted", false),
      db
        .from("players")
        .select("id", { count: "exact", head: true })
        .eq("deleted", false)
        .eq("opted_in", true),
      db.from("runs").select("id", { count: "exact", head: true }),
      db.from("runs").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
      db.from("rejected_submissions").select("id", { count: "exact", head: true }),
      db.from("runs").select("created_at").gte("created_at", dayAgo).limit(20000),
      db.from("events").select("name").gte("created_at", dayAgo).limit(20000),
      db
        .from("players")
        .select("id, name, email, best_score, runs")
        .eq("deleted", false)
        .order("created_at", { ascending: false })
        .limit(25),
      isFrozen(db),
    ]);

  const buckets = new Map<string, number>();
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3600 * 1000);
    buckets.set(`${String(d.getUTCHours()).padStart(2, "0")}:00`, 0);
  }
  for (const r of recentRuns.data ?? []) {
    const d = new Date(r.created_at as string);
    const k = `${String(d.getUTCHours()).padStart(2, "0")}:00`;
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }

  const funnel: Record<string, number> = {};
  for (const e of events.data ?? []) {
    const n = e.name as string;
    funnel[n] = (funnel[n] ?? 0) + 1;
  }

  const payload: AdminStats = {
    ok: true,
    players: players.count ?? 0,
    optedIn: optedIn.count ?? 0,
    runsTotal: runsTotal.count ?? 0,
    runsToday: runsToday.count ?? 0,
    rejected: rejected.count ?? 0,
    frozen,
    funnel,
    runsPerHour: [...buckets].map(([hour, runs]) => ({ hour, runs })),
    recent: (recent.data ?? []).map((p) => ({
      id: p.id as string,
      name: p.name as string,
      email: p.email as string,
      best: p.best_score as number,
      runs: p.runs as number,
    })),
  };
  return json(payload);
}
