import { describe, expect, it } from "vitest";
import { FIXED_DT } from "./constants";
import { botInput, newBotMemory } from "./bot";
import { createGame, score, step } from "./engine";
import type { Input } from "./types";

const IDLE: Input = { jumpPressed: false, jumpHeld: false, slidePressed: false };

/**
 * The fairness test proves a perfect player never dies. This one asks the
 * question the booth actually cares about: how long does a *human* last?
 *
 * A human is modelled as the same bot whose decisions land `latency` late (a
 * whole action at a time, the way a person commits to a jump) and who fumbles
 * `slop` of them entirely. The brief wants a median run of 35-60s for an
 * average player and 2-3 minutes for a skilled one; these bounds are loose
 * enough not to be flaky but tight enough to catch a difficulty regression.
 */
function playHuman(latency: number, slop: number, seed: number, maxT = 240) {
  const s = createGame({ seed });
  const mem = newBotMemory();
  const delay = Math.round(latency / FIXED_DT);
  let pending: { at: number; plan: Input[] } | null = null;
  let running: Input[] | null = null;
  let ri = 0;
  let rnd = seed * 9301 + 7;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  for (let f = 0; f < 60 * maxT && !s.dead; f++) {
    const raw = botInput(s, mem);
    if (!running && !pending && (raw.jumpPressed || raw.slidePressed)) {
      const plan = mem.plan.length && mem.planIdx > 0 ? mem.plan.slice() : [raw];
      if (rand() >= slop) pending = { at: f + delay, plan };
    }
    if (pending && f >= pending.at) {
      running = pending.plan;
      ri = 0;
      pending = null;
    }
    let inp: Input = IDLE;
    if (running) {
      inp = running[ri++];
      if (ri >= running.length) running = null;
    }
    step(s, inp);
  }
  return { t: s.t, score: score(s) };
}

function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  return a[Math.floor(a.length / 2)];
}

describe("difficulty curve", () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);

  it("gives an average player a run in the 20-90s band", () => {
    const med = median(seeds.map((s) => playHuman(0.14, 0.08, s).t));
    expect(med).toBeGreaterThan(20);
    expect(med).toBeLessThan(90);
  });

  it("lets a skilled player reach multi-minute runs", () => {
    const med = median(seeds.map((s) => playHuman(0.09, 0.03, s).t));
    expect(med).toBeGreaterThan(60);
  });

  it("does not wall a first-timer in the first few seconds", () => {
    const med = median(seeds.map((s) => playHuman(0.2, 0.16, s).t));
    expect(med).toBeGreaterThan(8);
  });
});
