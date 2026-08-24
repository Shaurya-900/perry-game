import { NextResponse } from "next/server";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function bad(reason: string, status = 400) {
  return NextResponse.json({ ok: false, error: reason }, { status });
}

/** Used when Supabase is not configured — the client keeps playing offline. */
export function notConfigured() {
  return NextResponse.json(
    { ok: false, error: "not_configured", configured: false },
    { status: 503 },
  );
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
