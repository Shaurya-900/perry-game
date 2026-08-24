import { supabase } from "@/lib/supabase";
import { bad, json, notConfigured, readJson } from "@/lib/http";
import { signRunToken } from "@/lib/token";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands out a signed session token for one run. The seed comes from the
 * server so a run is reproducible from its record.
 */
export async function POST(req: Request) {
  const body = await readJson<{ playerId?: string }>(req);
  const playerId = body?.playerId;
  if (!playerId) return bad("missing_player");

  const db = supabase();
  if (!db) return notConfigured();

  const { data: player } = await db
    .from("players")
    .select("id, deleted")
    .eq("id", playerId)
    .maybeSingle();
  if (!player || player.deleted) return bad("unknown_player", 404);

  const runId = randomUUID();
  const seed = Math.floor(Math.random() * 0xffffffff);
  const token = signRunToken({ runId, playerId, iat: Date.now(), seed });
  return json({ ok: true, token, runId, seed });
}
