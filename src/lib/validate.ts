import { MAX_SCORE_RATE } from "@/game/constants";

/** Loose on purpose: catching typos, not policing edge cases. */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * An address, any domain — visiting students, staff, and typos in the domain
 * all still get to play. A bare roll number is deliberately NOT accepted: the
 * club reaches people by email, and a roll number is not reachable.
 */
export function looksLikeEmail(raw: string): boolean {
  const v = normaliseEmail(raw);
  if (v.length < 6 || v.length > 120) return false;
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v);
}

export function isSnuDomain(raw: string): boolean {
  return /@([a-z0-9-]+\.)*snu\.edu\.in$/i.test(normaliseEmail(raw));
}

export function validName(raw: string): boolean {
  const v = raw.trim();
  return v.length >= 2 && v.length <= 40;
}

export interface RunSubmission {
  score: number;
  durationMs: number;
  fedoras: number;
}

export type ScoreVerdict = { ok: true } | { ok: false; reason: string };

/**
 * The physical ceiling comes straight out of the difficulty curve
 * (see MAX_SCORE_RATE), which already carries ~15% headroom over anything the
 * perfect-input bot can score. Below three seconds the rate is meaningless, so
 * a small flat allowance covers it.
 */
export function checkScore(sub: RunSubmission, tokenAgeMs: number): ScoreVerdict {
  const { score, durationMs } = sub;
  if (!Number.isFinite(score) || !Number.isInteger(score) || score < 0) {
    return { ok: false, reason: "score_not_an_integer" };
  }
  if (!Number.isFinite(durationMs) || durationMs < 500) {
    return { ok: false, reason: "duration_too_short" };
  }
  if (durationMs > 60 * 60 * 1000) return { ok: false, reason: "duration_too_long" };
  if (durationMs > tokenAgeMs + 5000) {
    return { ok: false, reason: "duration_exceeds_session" };
  }
  const seconds = durationMs / 1000;
  const allowance = MAX_SCORE_RATE * Math.max(seconds, 3);
  if (score > allowance) return { ok: false, reason: "score_rate_impossible" };
  // Number.isInteger also rejects NaN and Infinity: Number("abc") reaches here
  // as NaN, and every bare comparison against NaN is false.
  if (!Number.isInteger(sub.fedoras) || sub.fedoras < 0 || sub.fedoras * 50 > score) {
    return { ok: false, reason: "fedora_count_impossible" };
  }
  return { ok: true };
}

export const SUBMISSION_WINDOW_MS = 5 * 60 * 1000;
export const MAX_SUBMISSIONS_PER_WINDOW = 20;
