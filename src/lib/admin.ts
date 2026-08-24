import { timingSafeEqual } from "node:crypto";

/** Plain shared-secret gate — no user accounts exist anywhere in this app. */
export function adminAuthorised(key: string | null): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected || !key) return false;
  const a = Buffer.from(key);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function keyFrom(req: Request): string | null {
  return new URL(req.url).searchParams.get("key");
}
