/**
 * Fixed-window counter, in memory.
 *
 * ponytail: per-instance and per-IP, which is the honest ceiling. Vercel may
 * run several lambdas, and the whole fair sits behind campus NAT - so every
 * limit here is set generously enough that a queue of real students never
 * trips it, and tight enough that a script cannot mint thousands of rows.
 * Move to a Postgres or Upstash counter if a fair actually gets attacked.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Cheap sweep: the map only holds active windows, so it stays small.
  if (windows.size > 5000) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  const cur = windows.get(key);
  if (!cur || cur.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  cur.count++;
  return cur.count <= limit;
}

/** Vercel sets x-forwarded-for; everything else falls back to one bucket. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
