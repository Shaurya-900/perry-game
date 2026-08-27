"use client";

/** Everything the phone remembers between visits. No login, ever. */
export interface LocalPlayer {
  clientId: string;
  playerId: string | null;
  name: string;
  email: string;
  optedIn: boolean;
  best: number;
  runsToday: number;
  runsDate: string;
}

const KEY = "ecell.player";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function newClientId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `c-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

export function loadPlayer(): LocalPlayer | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LocalPlayer;
    if (!p?.name || !p?.email) return null;
    if (p.runsDate !== today()) {
      p.runsDate = today();
      p.runsToday = 0;
    }
    return p;
  } catch {
    return null;
  }
}

export function savePlayer(p: LocalPlayer): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode — the run still works, it just will not be remembered */
  }
}

export function makePlayer(
  name: string,
  email: string,
  optedIn: boolean,
): LocalPlayer {
  return {
    clientId: newClientId(),
    playerId: null,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    optedIn,
    best: 0,
    runsToday: 0,
    runsDate: today(),
  };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}
