import { supabase } from "@/lib/supabase";
import { adminAuthorised, keyFrom } from "@/lib/admin";
import { bad, json, notConfigured, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  action?: "soft_delete" | "restore" | "freeze" | "unfreeze";
  playerId?: string;
}

export async function POST(req: Request) {
  if (!adminAuthorised(keyFrom(req))) return bad("unauthorised", 401);
  const db = supabase();
  if (!db) return notConfigured();
  const body = await readJson<Body>(req);

  switch (body?.action) {
    case "soft_delete":
    case "restore": {
      if (!body.playerId) return bad("missing_player");
      const { error } = await db
        .from("players")
        .update({ deleted: body.action === "soft_delete" })
        .eq("id", body.playerId);
      if (error) return bad("update_failed", 500);
      return json({ ok: true });
    }
    case "freeze":
    case "unfreeze": {
      const { error } = await db
        .from("settings")
        .upsert({ key: "leaderboard_frozen", value: body.action === "freeze" });
      if (error) return bad("update_failed", 500);
      return json({ ok: true, frozen: body.action === "freeze" });
    }
    default:
      return bad("unknown_action");
  }
}
