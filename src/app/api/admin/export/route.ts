import { supabase } from "@/lib/supabase";
import { adminAuthorised, keyFrom } from "@/lib/admin";
import { bad, notConfigured } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The lead list. The stored column is still `opted_in`, but the box it now
 * records is "I want to join E-Cell" — the club already has every student's
 * email, so interest is the only part worth collecting. Exported under its
 * real meaning so nobody reads the CSV as a mailing consent.
 */
export async function GET(req: Request) {
  if (!adminAuthorised(keyFrom(req))) return bad("unauthorised", 401);
  const db = supabase();
  if (!db) return notConfigured();

  const optedOnly = new URL(req.url).searchParams.get("optedIn") === "1";
  let q = db
    .from("players")
    .select("name, email, opted_in, best_score, runs, created_at")
    .eq("deleted", false)
    .order("best_score", { ascending: false });
  if (optedOnly) q = q.eq("opted_in", true);
  const { data, error } = await q;
  if (error) return bad("query_failed", 500);

  const header = "name,email,wants_to_join,best_score,runs,created_at";
  const rows = (data ?? []).map((p) =>
    [p.name, p.email, p.opted_in, p.best_score, p.runs, p.created_at]
      .map(csvCell)
      .join(","),
  );
  const csv = [header, ...rows].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ecell-players-${stamp}.csv"`,
    },
  });
}
