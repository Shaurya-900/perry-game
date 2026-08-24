import {
  BASE_SPEED,
  CRATE_H,
  CRATE_W,
  DRONE_HALF_H,
  DRONE_MAX_C,
  DRONE_MIN_C,
  DRONE_W,
  LASER_HIGH,
  LASER_LOW,
  LASER_W,
  MAX_MULT,
  PLAYER_W,
  PLAYER_X,
  TOWER_H,
  TOWER_W,
  RAMP_TIME,
  WORLD_W,
  speedAt,
  timeAt,
} from "./constants";
import { randInt, randRange, type Rng } from "./rng";
import type { Coin, ObKind, Obstacle } from "./types";

/**
 * The generator never places obstacles by pixel gap — it places them by TIME
 * gap at the speed the player will actually be travelling when they arrive.
 * Every gap is (reaction time + recovery time for the previous action), so a
 * pattern can always be answered. `src/game/generator.test.ts` proves it by
 * playing 10,000 generated patterns with a perfect-input bot.
 */

type Recovery = "jump" | "bigjump" | "slide" | "react";

interface PatternItem {
  /** Pixels after the pattern start. Fixed pixels, NOT time: a pattern has to
   *  be readable as one shape on screen at any speed. */
  dx: number;
  kind: ObKind;
}

interface Pattern {
  name: string;
  items: PatternItem[];
  recovery: Recovery;
  /** Difficulty (0..1) at which this pattern unlocks. */
  minLevel: number;
}

export const PATTERNS: Pattern[] = [
  { name: "crate", items: [{ dx: 0, kind: "crate" }], recovery: "jump", minLevel: 0 },
  { name: "laser", items: [{ dx: 0, kind: "laser" }], recovery: "slide", minLevel: 0 },
  { name: "drone", items: [{ dx: 0, kind: "drone" }], recovery: "react", minLevel: 0.05 },
  { name: "tower", items: [{ dx: 0, kind: "tower" }], recovery: "bigjump", minLevel: 0.12 },
  // Multi-obstacle patterns are spaced in PIXELS and kept inside
  // MAX_PATTERN_SPAN so the whole shape is on screen before the player has to
  // commit to a jump. Anything wider than that is not a pattern, it is two
  // patterns, and gets a full reaction gap between them.
  {
    name: "crate-stack",
    items: [
      { dx: 0, kind: "crate" },
      { dx: 42, kind: "crate" },
    ],
    recovery: "jump",
    minLevel: 0.2,
  },
  {
    name: "crate-pair",
    items: [
      { dx: 0, kind: "crate" },
      { dx: 58, kind: "crate" },
    ],
    recovery: "jump",
    minLevel: 0.45,
  },
];

/**
 * Longest a single pattern may span, in world px.
 *
 * The player sees WORLD_W - PLAYER_X - PLAYER_W px ahead of themselves and has
 * to commit to an answer roughly DECIDE_LEAD seconds before contact. Whatever
 * is left over is how wide a pattern may be and still be fully readable at the
 * moment of the decision — at the fastest the game ever runs.
 * `generator.test.ts` asserts every pattern respects this.
 */
export const MAX_PATTERN_SPAN =
  WORLD_W - PLAYER_X - PLAYER_W - 0.5 * BASE_SPEED * MAX_MULT;

/** Seconds the player needs after each kind of answer before the next one. */
const RECOVERY_TIME: Record<Recovery, number> = {
  jump: 0.3,
  bigjump: 0.55,
  slide: 0.2,
  react: 0.4,
};

/** Baseline reaction time budget, always granted on top of recovery. */
const REACTION = 0.72;

export interface GenState {
  nextX: number;
  nextId: number;
  lastArcX: number;
  lastGoldenX: number;
  patternsEmitted: number;
  lastPattern: string;
}

export function createGen(startX: number): GenState {
  return {
    nextX: startX + 520,
    nextId: 1,
    lastArcX: -1e9,
    lastGoldenX: -1e9,
    patternsEmitted: 0,
    lastPattern: "",
  };
}

/** Difficulty 0..1 from elapsed run time. */
export function levelAt(t: number): number {
  return Math.min(1, t / (RAMP_TIME * 0.75));
}

function makeObstacle(
  kind: ObKind,
  x: number,
  id: number,
  rng: Rng,
  level: number,
): Obstacle {
  const variant = randInt(rng, 0, 2);
  switch (kind) {
    case "crate":
      return { id, kind, x, w: CRATE_W, yLow: 0, yHigh: CRATE_H, variant };
    case "tower":
      return { id, kind, x, w: TOWER_W, yLow: 0, yHigh: TOWER_H, variant };
    case "laser":
      return { id, kind, x, w: LASER_W, yLow: LASER_LOW, yHigh: LASER_HIGH, variant };
    case "drone": {
      // Centre band shrinks inwards at low difficulty so early drones sit high
      // and read easily. Any centre in [DRONE_MIN_C, DRONE_MAX_C] is clearable:
      // low drones are jumped, high drones are run under.
      const lo = DRONE_MIN_C + (1 - level) * 40;
      const hi = DRONE_MAX_C;
      const cy = randRange(rng, lo, hi);
      const amp = Math.min(
        randRange(rng, 10, 30) * (0.4 + 0.6 * level),
        Math.min(cy - DRONE_MIN_C, DRONE_MAX_C - cy),
      );
      return {
        id,
        kind,
        x,
        w: DRONE_W,
        yLow: cy - DRONE_HALF_H,
        yHigh: cy + DRONE_HALF_H,
        cy,
        amp,
        om: randRange(rng, 1.4, 2.6),
        ph: randRange(rng, 0, Math.PI * 2),
        variant,
      };
    }
  }
}

/** Vertical extent of an obstacle at time `t` (drones move). */
export function obBox(o: Obstacle, t: number): { lo: number; hi: number } {
  if (o.amp === undefined) return { lo: o.yLow, hi: o.yHigh };
  const c = o.cy! + o.amp * Math.sin(o.om! * t + o.ph!);
  return { lo: c - DRONE_HALF_H, hi: c + DRONE_HALF_H };
}

function addArc(
  coins: Coin[],
  gen: GenState,
  centreX: number,
  peak: number,
  span: number,
) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1; // -1..1
    coins.push({
      id: gen.nextId++,
      x: centreX + u * (span / 2),
      y: 26 + peak * (1 - u * u),
      golden: false,
      taken: false,
    });
  }
  gen.lastArcX = centreX;
}

/**
 * Fill the world with patterns up to `untilX`. Pure function of (gen, rng).
 */
export function generate(
  gen: GenState,
  rng: Rng,
  obstacles: Obstacle[],
  coins: Coin[],
  untilX: number,
): void {
  let guard = 0;
  while (gen.nextX < untilX && guard++ < 200) {
    const x = gen.nextX;
    const t = timeAt(x);
    const level = levelAt(t);
    const speed = speedAt(t);

    const eligible = PATTERNS.filter(
      (p) => p.minLevel <= level && p.name !== gen.lastPattern,
    );
    const p = eligible[Math.floor(rng() * eligible.length) % eligible.length];
    gen.lastPattern = p.name;
    gen.patternsEmitted++;

    let spanEnd = 0;
    for (const item of p.items) {
      const ox = x + item.dx;
      const o = makeObstacle(item.kind, ox, gen.nextId++, rng, level);
      obstacles.push(o);
      spanEnd = Math.max(spanEnd, ox + o.w);
    }

    // Optional fedora arc — always in clear air, never forced.
    if (x - gen.lastArcX > 1.4 * speed && rng() < 0.55) {
      const last = p.items[p.items.length - 1];
      if (last.kind === "crate" || last.kind === "tower") {
        // Arc over the obstacle: reward the optimal jump.
        const ox = x + last.dx;
        const peak = last.kind === "tower" ? 235 : 120;
        addArc(coins, gen, ox + 18, peak, Math.min(230, 0.62 * speed));
      } else {
        addArc(coins, gen, spanEnd + 0.5 * speed, 90, Math.min(230, 0.6 * speed));
      }
    }

    const gap =
      (REACTION + RECOVERY_TIME[p.recovery]) * (1.7 - 0.6 * level) +
      randRange(rng, 0, 0.45) * (1.1 - level);
    const nextStart = spanEnd + gap * speed;

    // Golden fedora lives in the middle of a gap, at a comfortable height.
    if (
      x - gen.lastGoldenX > 6000 &&
      nextStart - spanEnd > 0.9 * speed &&
      rng() < 0.14
    ) {
      coins.push({
        id: gen.nextId++,
        x: (spanEnd + nextStart) / 2,
        y: 72,
        golden: true,
        taken: false,
      });
      gen.lastGoldenX = x;
    }

    gen.nextX = nextStart;
  }
}
