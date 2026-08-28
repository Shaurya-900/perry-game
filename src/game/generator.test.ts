import { describe, expect, it } from "vitest";
import {
  COIN_R,
  CRATE_W,
  DRONE_HALF_H,
  DRONE_W,
  FEDORA_POINTS,
  FIXED_DT,
  GATE_HIGH,
  GATE_LOW,
  GATE_W,
  LASER_W,
  MAX_SCORE_RATE,
  PLAYER_W,
  PLAYER_X,
  SLIDE_TIME,
  TOWER_W,
} from "./constants";
import { MAX_PATTERN_SPAN, PATTERNS, createGen, generate } from "./generator";
import { makeRng } from "./rng";
import type { Coin, Obstacle } from "./types";
import { botInput, nextObstacle, newBotMemory } from "./bot";
import { createGame, hits, newPlayer, score, step, stepPlayer } from "./engine";

interface RunResult {
  seed: number;
  startTime: number;
  patterns: number;
  died: boolean;
  deathT: number;
  deathKind: string;
  maxRate: number;
}

function playWithBot(seed: number, startTime: number, maxSeconds: number): RunResult {
  const s = createGame({ seed, startTime });
  const mem = newBotMemory();
  const ticks = Math.round(maxSeconds / FIXED_DT);
  let deathKind = "";
  let maxRate = 0;
  for (let i = 0; i < ticks; i++) {
    const input = botInput(s, mem);
    const before = nextObstacle(s);
    step(s, input);
    if (s.dead) {
      deathKind = before ? before.kind : "unknown";
      break;
    }
    const elapsed = s.t - startTime;
    if (elapsed > 3) maxRate = Math.max(maxRate, score(s) / elapsed);
  }
  return {
    seed,
    startTime,
    patterns: s.gen.patternsEmitted,
    died: s.dead,
    deathT: s.t - startTime,
    deathKind,
    maxRate,
  };
}

describe("obstacle generator", () => {
  it("never produces an unwinnable pattern (10,000 patterns, perfect-input bot)", () => {
    const TARGET = 10_000;
    let patterns = 0;
    let runs = 0;
    const failures: RunResult[] = [];
    let worstRate = 0;

    // A third of the sample from a cold start (ramping difficulty), a third at
    // t=90s where the speed curve is pinned at its 2.2x ceiling, and a third at
    // t=180s where the gap squeeze is also maxed out — the hardest the game
    // ever gets.
    for (let seed = 1; patterns < TARGET; seed++) {
      const startTime = [0, 90, 180][seed % 3];
      const r = playWithBot(seed, startTime, 70);
      patterns += r.patterns;
      runs++;
      worstRate = Math.max(worstRate, r.maxRate);
      if (r.died) failures.push(r);
      if (runs > 2000) break;
    }

    if (failures.length) {
      const sample = failures
        .slice(0, 5)
        .map(
          (f) =>
            `seed=${f.seed} start=${f.startTime}s died after ${f.deathT.toFixed(2)}s on ${f.deathKind}`,
        )
        .join("\n  ");
      throw new Error(
        `${failures.length}/${runs} bot runs died over ${patterns} patterns:\n  ${sample}`,
      );
    }

    expect(patterns).toBeGreaterThanOrEqual(TARGET);
    expect(failures.length).toBe(0);
    // The anti-cheat ceiling must sit above anything a perfect player can score.
    expect(worstRate).toBeLessThan(MAX_SCORE_RATE);
  });

  it("keeps every pattern inside one readable screen", () => {
    const width: Record<string, number> = {
      crate: CRATE_W,
      tower: TOWER_W,
      laser: LASER_W,
      drone: DRONE_W,
      gate: GATE_W,
    };
    expect(MAX_PATTERN_SPAN).toBeGreaterThan(0);
    for (const p of PATTERNS) {
      const span = Math.max(...p.items.map((i) => i.dx + width[i.kind]));
      expect(
        span,
        `pattern "${p.name}" spans ${span}px, wider than the ${MAX_PATTERN_SPAN}px a player can read before committing`,
      ).toBeLessThanOrEqual(MAX_PATTERN_SPAN);
    }
  });

  /**
   * The bot above survives but ignores fedoras, so it under-measures the score
   * rate. This over-measures instead: every coin within REACH is taken as if
   * the player could be everywhere at once. The real player sits between the
   * two, so the ceiling must clear this bound — otherwise a genuine run is
   * rejected as `score_rate_impossible` and the player silently loses it.
   */
  it("cannot be out-scored by a greedy collector", () => {
    const REACH = 150;
    let worst = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const s = createGame({ seed, startTime: 60 });
      const mem = newBotMemory();
      for (let i = 0; i < 60 * 60 && !s.dead; i++) {
        step(s, botInput(s, mem));
        const px = s.camX + PLAYER_X + PLAYER_W / 2;
        for (const c of s.coins) {
          if (c.taken || c.power) continue;
          if (Math.abs(c.x - px) < REACH && c.y < 260) {
            c.taken = true;
            s.fedoras++;
            s.coinPoints += FEDORA_POINTS;
          }
        }
        const elapsed = s.t - 60;
        if (elapsed > 5) worst = Math.max(worst, score(s) / elapsed);
      }
    }
    expect(
      worst,
      `a greedy collector sustains ${worst.toFixed(1)} pts/s, at or above the ${MAX_SCORE_RATE} ceiling`,
    ).toBeLessThan(MAX_SCORE_RATE);
  });

  /**
   * Ducking used to be decorative: a bot restricted to jump-only plans cleared
   * all 10,000 patterns without a single death, because every obstacle top sat
   * below the jump apex. The gate is what makes sliding a real mechanic, and
   * these two properties are what make it one. The fairness test above already
   * proves the gate IS answerable; these prove it is answerable ONLY by ducking.
   */
  it("has an obstacle that no jump can clear", () => {
    let apex = 0;
    for (const holdFrames of [0, 7, 14, 27, 40, 60]) {
      const p = newPlayer();
      for (let i = 0; i < 200; i++) {
        stepPlayer(p, FIXED_DT, {
          jumpPressed: i === 0,
          jumpHeld: i < holdFrames,
          slidePressed: false,
          slideHeld: false,
        });
        apex = Math.max(apex, p.y);
        if (i > 2 && p.onGround) break;
      }
    }
    expect(
      apex,
      `the highest reachable jump is ${apex.toFixed(1)}px; the gate must stay above it`,
    ).toBeLessThan(GATE_HIGH);
  });

  it("lets a sliding player through the gate but not a standing one", () => {
    const gate = {
      id: 1,
      kind: "gate" as const,
      x: 100,
      w: GATE_W,
      yLow: GATE_LOW,
      yHigh: GATE_HIGH,
      variant: 0,
    };
    const standing = newPlayer();
    const sliding = newPlayer();
    sliding.sliding = true;
    expect(hits(gate, standing, 0, 0)).toBe(true);
    expect(hits(gate, sliding, 0, 0)).toBe(false);
  });

  /**
   * A fedora inside an obstacle can never be collected, so it reads as a bug
   * to the player and quietly taxes every run that goes past it. Drones move,
   * so the whole band they sweep counts as solid.
   */
  it("never places a fedora inside an obstacle", () => {
    let checked = 0;
    const bad: string[] = [];
    for (let seed = 1; seed <= 60; seed++) {
      const gen = createGen(0);
      const rng = makeRng(seed);
      const obstacles: Obstacle[] = [];
      const coins: Coin[] = [];
      for (let x = 4000; x <= 160000; x += 4000) {
        generate(gen, rng, obstacles, coins, x);
      }
      for (const c of coins) {
        checked++;
        for (const o of obstacles) {
          if (c.x + COIN_R < o.x || c.x - COIN_R > o.x + o.w) continue;
          const lo = o.amp === undefined ? o.yLow : o.cy! - o.amp - DRONE_HALF_H;
          const hi = o.amp === undefined ? o.yHigh : o.cy! + o.amp + DRONE_HALF_H;
          if (c.y + COIN_R > lo && c.y - COIN_R < hi) {
            bad.push(`seed ${seed}: fedora (${c.x.toFixed(0)}, ${c.y.toFixed(0)}) inside ${o.kind} [${lo.toFixed(0)}..${hi.toFixed(0)}]`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(bad.length, `${bad.length} unreachable fedoras:\n  ${bad.slice(0, 5).join("\n  ")}`).toBe(0);
  });

  it("is deterministic for a given seed", () => {
    const a = playWithBot(4242, 0, 20);
    const b = playWithBot(4242, 0, 20);
    expect(a).toEqual(b);
  });
});
