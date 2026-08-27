"use client";

import type { LeaderboardPayload } from "@/app/api/leaderboard/route";
import type { LocalPlayer } from "./player";

/**
 * Every call here is allowed to fail. Campus wifi drops, the free tier hiccups,
 * someone walks out of range mid-run — none of that may ever block the game.
 * Failed score submissions go into a localStorage queue and are retried on the
 * next page load and after the next run.
 */

const QUEUE_KEY = "ecell.queue";

export interface PendingRun {
  token: string;
  score: number;
  durationMs: number;
  fedoras: number;
  at: number;
}

export interface SubmitResult {
  ok: true;
  best: number;
  isBest: boolean;
  rank: number;
  totalPlayers: number;
}

function readQueue(): PendingRun[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as PendingRun[];
  } catch {
    return [];
  }
}

function writeQueue(q: PendingRun[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-30)));
  } catch {
    /* nothing to do */
  }
}

export function queueSize(): number {
  return readQueue().length;
}

function enqueue(run: PendingRun): void {
  const q = readQueue();
  q.push(run);
  writeQueue(q);
}

async function post<T>(url: string, body: unknown, timeoutMs = 6000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function registerPlayer(
  p: LocalPlayer,
): Promise<{ playerId: string; best: number; runs: number } | null> {
  return post("/api/player", {
    clientId: p.clientId,
    name: p.name,
    email: p.email,
    optedIn: p.optedIn,
  });
}

export async function startRun(
  playerId: string | null,
): Promise<{ token: string; seed: number } | null> {
  if (!playerId) return null;
  return post("/api/run/start", { playerId });
}

/** Returns null when the score could not be delivered — it is queued instead. */
export async function submitRun(run: PendingRun): Promise<SubmitResult | null> {
  if (!run.token) return null;
  try {
    const res = await fetch("/api/run/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    if (res.ok) return (await res.json()) as SubmitResult;
    // 4xx that is not a rate limit means the server will never accept this
    // run; queueing it forever would just be noise.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) return null;
    enqueue(run);
    return null;
  } catch {
    enqueue(run);
    return null;
  }
}

/** Retry anything stranded by a dropped connection. */
export async function flushQueue(): Promise<number> {
  const q = readQueue();
  if (!q.length) return 0;
  writeQueue([]);
  const stillPending: PendingRun[] = [];
  let sent = 0;
  for (const run of q) {
    // Tokens expire after ten minutes; older runs are unrecoverable.
    if (Date.now() - run.at > 9 * 60 * 1000) continue;
    try {
      const res = await fetch("/api/run/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(run),
      });
      if (res.ok) sent++;
      else if (res.status >= 500 || res.status === 429) stillPending.push(run);
    } catch {
      stillPending.push(run);
    }
  }
  writeQueue(stillPending);
  return sent;
}

export async function fetchLeaderboard(
  playerId: string | null,
): Promise<LeaderboardPayload | null> {
  try {
    const res = await fetch(
      `/api/leaderboard${playerId ? `?playerId=${encodeURIComponent(playerId)}` : ""}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as LeaderboardPayload;
  } catch {
    return null;
  }
}

export function track(name: string): void {
  try {
    const body = JSON.stringify({ name });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/analytics", new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* analytics must never break the game */
  }
}
