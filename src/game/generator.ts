import {
  BASE_SPEED,
  COIN_R,
  CRATE_H,
  CRATE_W,
  DRONE_HALF_H,
  DRONE_MAX_C,
  DRONE_MIN_C,
  DRONE_W,
  GATE_HIGH,
  GATE_LOW,
  GATE_W,
  LASER_EMITTER_H,
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
import type { Coin, ObKind, Obstacle, PowerKind } from "./types";

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
  // The only pattern that cannot be jumped. Held back to ~13 s so a first-timer
  // meets it after they have the hang of jumping, not before.
  { name: "gate", items: [{ dx: 0, kind: "gate" }], recovery: "slide", minLevel: 0.2 },
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
  // Late-game only. All three compose existing kinds (so MIN_ANSWER in bot.ts
  // needs no new entries) and fit inside MAX_PATTERN_SPAN. The 10k-pattern bot
  // test is what decides whether they stay.
  {
    name: "laser-drone",
    items: [
      { dx: 0, kind: "laser" },
      { dx: 60, kind: "drone" },
    ],
    recovery: "react",
    minLevel: 0.6,
  },
  {
    name: "tower-crate",
    items: [
      { dx: 0, kind: "tower" },
      { dx: 50, kind: "crate" },
    ],
    recovery: "jump",
    minLevel: 0.65,
  },
  {
    name: "double-drone",
    items: [
      { dx: 0, kind: "drone" },
      { dx: 50, kind: "drone" },
    ],
    recovery: "react",
    minLevel: 0.7,
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
  lastPowerX: number;
  patternsEmitted: number;
  /** Names of the last few patterns, so the mix does not visibly alternate. */
  recent: string[];
}

export function createGen(startX: number): GenState {
  return {
    nextX: startX + 520,
    nextId: 1,
    lastArcX: -1e9,
    lastPowerX: -1e9,
    patternsEmitted: 0,
    recent: [],
  };
}

/** Difficulty 0..1 from elapsed run time. */
export function levelAt(t: number): number {
  return Math.min(1, t / (RAMP_TIME * 0.75));
}

/**
 * Second, slower difficulty ramp (0..1 over PRESSURE_TIME): it keeps squeezing
 * the gap between patterns long after `level` and the speed curve have both
 * topped out, so a long run keeps getting harder instead of plateauing.
 * The floor is set by what the perfect-input bot can still answer —
 * `generator.test.ts` plays 10,000 patterns at the squeezed end of the curve.
 */
export const PRESSURE_TIME = 180;

export function pressureAt(t: number): number {
  return Math.min(1, t / PRESSURE_TIME);
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
    case "gate":
      return { id, kind, x, w: GATE_W, yLow: GATE_LOW, yHigh: GATE_HIGH, variant };
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
        om: randRange(rng, 1.4, 2.6 + 0.8 * level),
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
      power: null,
      taken: false,
    });
  }
  gen.lastArcX = centreX;
}

/** Flat run at a fixed height — rewards holding a clean line. */
function addLine(
  coins: Coin[],
  gen: GenState,
  startX: number,
  y: number,
  span: number,
) {
  const n = 5;
  for (let i = 0; i < n; i++) {
    coins.push({
      id: gen.nextId++,
      x: startX + (i / (n - 1)) * span,
      y,
      power: null,
      taken: false,
    });
  }
  gen.lastArcX = startX + span / 2;
}

/** Tight cluster, taken in a single well-timed jump. */
function addDiamond(coins: Coin[], gen: GenState, centreX: number, cy: number) {
  const r = 26;
  for (const [dx, dy] of [
    [0, r],
    [-r, 0],
    [r, 0],
    [0, -r],
  ]) {
    coins.push({
      id: gen.nextId++,
      x: centreX + dx,
      y: cy + dy,
      power: null,
      taken: false,
    });
  }
  gen.lastArcX = centreX;
}

/**
 * A fedora inside an obstacle can never be collected, so it reads as a bug and
 * quietly taxes every run that passes it. Cheaper to drop it than to make every
 * shape aware of every obstacle it might sweep across — an arc drawn over the
 * crate in `tower-crate`, for instance, reaches back over the tower.
 */
function blocked(obstacles: Obstacle[], c: Coin): boolean {
  for (const o of obstacles) {
    // The housing overhangs the beam by 4px on each side, so match its width.
    const drawnLeft = o.kind === "laser" || o.kind === "gate" ? o.x - 4 : o.x;
    const drawnRight =
      o.kind === "laser" || o.kind === "gate" ? o.x + o.w + 4 : o.x + o.w;
    if (c.x + COIN_R < drawnLeft || c.x - COIN_R > drawnRight) continue;
    // Drones move, so the whole band they sweep counts as solid.
    const lo = o.amp === undefined ? o.yLow : o.cy! - o.amp - DRONE_HALF_H;
    let hi = o.amp === undefined ? o.yHigh : o.cy! + o.amp + DRONE_HALF_H;
    // Blocked means "cannot be reached OR looks wrong", so the drawn extent
    // counts, not just the part that kills.
    if (o.kind === "laser" || o.kind === "gate") hi += LASER_EMITTER_H;
    if (c.y + COIN_R > lo && c.y - COIN_R < hi) return true;
  }
  return false;
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

    const unlocked = PATTERNS.filter((p) => p.minLevel <= level);
    // Depth adapts to how much is unlocked: early on only two patterns exist,
    // so blocking two of them would leave nothing to pick.
    const depth = Math.min(2, unlocked.length - 1);
    const recent = depth > 0 ? gen.recent.slice(-depth) : [];
    const eligible = unlocked.filter((p) => !recent.includes(p.name));
    const p = eligible[Math.floor(rng() * eligible.length) % eligible.length];
    gen.recent.push(p.name);
    if (gen.recent.length > 4) gen.recent.shift();
    gen.patternsEmitted++;

    let spanEnd = 0;
    for (const item of p.items) {
      const ox = x + item.dx;
      const o = makeObstacle(item.kind, ox, gen.nextId++, rng, level);
      obstacles.push(o);
      spanEnd = Math.max(spanEnd, ox + o.w);
    }

    const pressure = pressureAt(t);
    const gap =
      (REACTION + RECOVERY_TIME[p.recovery]) * (1.7 - 0.75 * pressure) +
      randRange(rng, 0, 0.45) * (1.1 - pressure);
    const nextStart = spanEnd + gap * speed;

    const coinsFrom = coins.length;

    // Fedoras. Placed AFTER nextStart is known, and every clear-air shape is
    // centred in the gap and clamped to it, so nothing can spill into the next
    // pattern. A start-anchored line used to run past the gap and drop coins
    // inside the following obstacle — most visibly at y=34, which is exactly a
    // laser's lower edge.
    if (x - gen.lastArcX > 1.4 * speed && rng() < 0.55) {
      const last = p.items[p.items.length - 1];
      const gapW = nextStart - spanEnd;
      if (last.kind === "crate" || last.kind === "tower") {
        // Arc over the obstacle: reward the optimal jump.
        const ox = x + last.dx;
        const peak = last.kind === "tower" ? 235 : 120;
        addArc(coins, gen, ox + 18, peak, Math.min(230, 0.62 * speed));
      } else if (last.kind === "gate") {
        // Swept up while sliding through, so the duck pays for itself instead
        // of only costing the player tempo.
        addLine(coins, gen, x + last.dx - 10, 14, GATE_W + 20);
      } else if (last.kind === "laser") {
        // Nothing over a laser. Between the beam and the emitter housing on top
        // of it there is no height that reads cleanly, so the fedoras for this
        // pattern are simply skipped.
      } else if (gapW > 150) {
        const centre = spanEnd + gapW / 2;
        const span = Math.min(230, gapW * 0.55);
        if (rng() < 0.4) addDiamond(coins, gen, centre, 86);
        else if (rng() < 0.5) addLine(coins, gen, centre - span / 2, 34, span);
        else addArc(coins, gen, centre, 90, span);
      }
    }

    // A power-up lives in the middle of a gap, at a comfortable height.
    if (
      x - gen.lastPowerX > 6000 &&
      nextStart - spanEnd > 0.9 * speed &&
      rng() < 0.14
    ) {
      // A free hit is worth most to someone still learning; the magnet is
      // worth most to someone already surviving deep into the curve.
      const shieldW = 0.45 - 0.25 * level;
      const magnetW = 0.2 + 0.25 * level;
      const r = rng();
      const power: PowerKind =
        r < shieldW ? "shield" : r < shieldW + magnetW ? "magnet" : "golden";
      coins.push({
        id: gen.nextId++,
        x: (spanEnd + nextStart) / 2,
        y: 72,
        power,
        taken: false,
      });
      gen.lastPowerX = x;
    }

    // Last line of defence, covering every shape at once.
    for (let i = coins.length - 1; i >= coinsFrom; i--) {
      if (blocked(obstacles, coins[i])) coins.splice(i, 1);
    }

    gen.nextX = nextStart;
  }
}
