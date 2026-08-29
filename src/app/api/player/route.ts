import { supabase } from "@/lib/supabase";
import { bad, json, notConfigured, readJson } from "@/lib/http";
import { isSnuDomain, looksLikeEmail, normaliseEmail } from "@/lib/validate";
import { checkName } from "@/lib/name";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  clientId?: string;
  name?: string;
  email?: string;
  optedIn?: boolean;
}

/**
 * How many NEW players one address may create in ten minutes. A whole queue of
 * students shares the campus NAT, so this is set well above a real booth rate
 * (a busy fair onboards ~20 people in ten minutes) and only bites a script.
 * Returning players are not counted - they are already in the table.
 */
const NEW_PLAYERS_PER_IP = 40;

/** Upsert on email: one human, one leaderboard row, no login. */
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  if (!body) return bad("invalid_body");
  const verdict = checkName(body.name ?? "");
  const email = normaliseEmail(body.email ?? "");
  if (!verdict.ok) return bad(verdict.reason);
  const name = verdict.name;
  if (!looksLikeEmail(email)) return bad("invalid_email");
  // The form blocks this too, but the form is not the boundary.
  if (!isSnuDomain(email)) return bad("not_snu_email");

  const db = supabase();
  if (!db) return notConfigured();

  const { data: existing } = await db
    .from("players")
    .select("id, best_score, runs, opted_in, client_id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    // Anyone can guess a classmate's address, and nothing here verifies it, so
    // the first device to claim a row owns the name on it. A second phone still
    // lands on the same row and still scores - it just cannot rename the board.
    const owns = !existing.client_id || existing.client_id === body.clientId;
    await db
      .from("players")
      .update({
        ...(owns ? { name, client_id: body.clientId ?? null } : {}),
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

  if (!rateLimit(`player:${clientIp(req)}`, NEW_PLAYERS_PER_IP, 10 * 60 * 1000)) {
    return bad("rate_limited", 429);
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
