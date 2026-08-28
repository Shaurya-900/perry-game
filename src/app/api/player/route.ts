import { supabase } from "@/lib/supabase";
import { bad, json, notConfigured, readJson } from "@/lib/http";
import { looksLikeEmail, normaliseEmail, validName } from "@/lib/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  clientId?: string;
  name?: string;
  email?: string;
  optedIn?: boolean;
}

/** Upsert on email: one human, one leaderboard row, no login. */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return bad("invalid_body");
  const name = (body.name ?? "").trim();
  const email = normaliseEmail(body.email ?? "");
  if (!validName(name)) return bad("invalid_name");
  if (!looksLikeEmail(email)) return bad("invalid_email");

  const db = supabase();
  if (!db) return notConfigured();

  const { data: existing } = await db
    .from("players")
    .select("id, best_score, runs, opted_in")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    await db
      .from("players")
      .update({
        name,
        client_id: body.clientId ?? null,
        // Never silently downgrade a yes to a no, but always honour a new yes.
        opted_in: body.optedIn ? true : existing.opted_in,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return json({
      ok: true,
      playerId: existing.id,
      best: existing.best_score,
      runs: existing.runs,
      returning: true,
    });
  }

  const { data, error } = await db
    .from("players")
    .insert({
      name,
      email,
      client_id: body.clientId ?? null,
      opted_in: Boolean(body.optedIn),
    })
    .select("id, best_score, runs")
    .single();

  if (error || !data) return bad("insert_failed", 500);
  await db.from("events").insert({ name: "onboard_complete" });
  return json({ ok: true, playerId: data.id, best: 0, runs: 0, returning: false });
}
