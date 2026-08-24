import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Run tokens: HMAC-SHA256 over {runId, playerId, issuedAt}.
 *
 * This is not meant to stop a determined attacker — with the game running on
 * the player's own device, nothing can. It stops the devtools-console kid at a
 * club fair, which is the realistic threat: you cannot POST a score without a
 * token the server issued, you cannot use one twice (the run id is the primary
 * key of the runs table), and you cannot use a stale one.
 */
const MAX_AGE_MS = 10 * 60 * 1000;

function secret(): string {
  return process.env.RUN_TOKEN_SECRET || "dev-only-insecure-secret";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export interface RunClaims {
  runId: string;
  playerId: string;
  iat: number;
  seed: number;
}

export function signRunToken(claims: RunClaims): string {
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; claims: RunClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyRunToken(token: string): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expected = b64url(createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  let claims: RunClaims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    typeof claims?.runId !== "string" ||
    typeof claims?.playerId !== "string" ||
    typeof claims?.iat !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() - claims.iat > MAX_AGE_MS) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}
