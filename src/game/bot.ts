import {
  FIXED_DT,
  MAX_HOLD,
  PLAYER_W,
  PLAYER_X,
  WORLD_W,
  distanceAt,
  speedAt,
} from "./constants";
import { hits, playerHeight, stepPlayer } from "./engine";
import type { GameState } from "./engine";
import type { Input, Obstacle, PlayerState } from "./types";

/**
 * A perfect-input bot used by the generator test.
 *
 * It is deliberately NOT superhuman: it only sees obstacles that are on screen
 * (same information a player has) and it plays with the exact physics from
 * `stepPlayer`. If this bot cannot survive a pattern, a human cannot either.
 *
 * Strategy is receding-horizon: every tick it asks "if I do nothing, am I still
 * fine?". Only when doing nothing leads to a collision within DECIDE_LEAD does
 * it search the (small) action set and commit to the first action that reaches
 * a recovered state.
 */

const HORIZON = 2.4;
const DECIDE_LEAD = 0.5;

/**
 * Minimum time needed to answer each obstacle type from a standing start —
 * derived from the physics: time to rise clear of it, or to duck.
 * A rollout counts as survived once the player is back on the ground with at
 * least this much time before the next obstacle, i.e. genuinely able to chain
 * into the next answer.
 */
const MIN_ANSWER: Record<string, number> = {
  crate: 0.16,
  laser: 0.1,
  gate: 0.1,
  tower: 0.3,
  drone: 0.24,
};

const HOLD_DURATIONS = [0, 0.12, 0.24, MAX_HOLD];

function press(hold: boolean): Input {
  return { jumpPressed: true, jumpHeld: hold, slidePressed: false, slideHeld: false };
}
const HOLD_ON: Input = {
  jumpPressed: false,
  jumpHeld: true,
  slidePressed: false,
  slideHeld: false,
};
const IDLE: Input = {
  jumpPressed: false,
  jumpHeld: false,
  slidePressed: false,
  slideHeld: false,
};

/** How long the bot is willing to hold a duck. */
const SLIDE_DURATIONS = [0.25, 0.5, 0.8];

function slidePlan(hold: number): Input[] {
  const frames = Math.max(1, Math.round(hold / FIXED_DT));
  const plan: Input[] = [
    { jumpPressed: false, jumpHeld: false, slidePressed: true, slideHeld: true },
  ];
  for (let i = 1; i < frames; i++) {
    plan.push({
      jumpPressed: false,
      jumpHeld: false,
      slidePressed: false,
      slideHeld: true,
    });
  }
  return plan;
}

function jumpPlan(hold: number): Input[] {
  const frames = Math.max(1, Math.round(hold / FIXED_DT));
  const plan: Input[] = [press(hold > 0)];
  for (let i = 1; i < frames; i++) plan.push(HOLD_ON);
  return plan;
}

export const PLANS: Input[][] = [
  ...SLIDE_DURATIONS.map(slidePlan),
  ...HOLD_DURATIONS.map(jumpPlan),
];

export function visible(obstacles: Obstacle[], camX: number): Obstacle[] {
  const out: Obstacle[] = [];
  for (const o of obstacles) {
    // Not yet passed, and already drawn on screen.
    if (o.x + o.w - camX <= PLAYER_X) continue;
    if (o.x - camX > WORLD_W) continue;
    out.push(o);
  }
  return out;
}

function passed(o: Obstacle, camX: number): boolean {
  return o.x + o.w - camX <= PLAYER_X;
}

function recovered(
  obs: Obstacle[],
  p: PlayerState,
  camX: number,
  speed: number,
  mustPass: Obstacle | null,
): boolean {
  if (!p.onGround || p.sliding) return false;
  // "Recovered" only counts once the threat we were reacting to is behind us,
  // otherwise standing still trivially looks safe and the bot reacts at the
  // last possible frame — which no human can match.
  if (mustPass && !passed(mustPass, camX)) return false;
  for (const o of obs) {
    const right = o.x + o.w - camX;
    if (right <= PLAYER_X) continue;
    const lead = (o.x - camX - (PLAYER_X + PLAYER_W)) / speed;
    if (lead < MIN_ANSWER[o.kind]) return false;
  }
  return true;
}

interface Sim {
  safe: boolean;
  survived: number;
}

export function simulate(
  obs: Obstacle[],
  t0: number,
  p0: PlayerState,
  plan: Input[],
  mustPass: Obstacle | null,
): Sim {
  const p: PlayerState = { ...p0 };
  let t = t0;
  const end = t0 + HORIZON;
  let i = 0;
  while (t < end) {
    const input = i < plan.length ? plan[i] : IDLE;
    i++;
    t += FIXED_DT;
    const camX = distanceAt(t);
    stepPlayer(p, FIXED_DT, input);
    for (const o of obs) {
      if (hits(o, p, camX, t)) return { safe: false, survived: t - t0 };
    }
    if (recovered(obs, p, camX, speedAt(t), mustPass)) {
      return { safe: true, survived: t - t0 };
    }
  }
  return { safe: true, survived: HORIZON };
}

export interface BotMemory {
  plan: Input[];
  planIdx: number;
}

export function newBotMemory(): BotMemory {
  return { plan: [], planIdx: 0 };
}

/** Decide this tick's input. */
export function botInput(
  s: GameState,
  mem: BotMemory,
  lead: number = DECIDE_LEAD,
): Input {
  if (mem.planIdx < mem.plan.length) {
    return mem.plan[mem.planIdx++];
  }
  const obs = visible(s.obstacles, s.camX);
  if (obs.length === 0) return IDLE;

  let mustPass: Obstacle | null = null;
  for (const o of obs) if (!mustPass || o.x < mustPass.x) mustPass = o;

  const doNothing = simulate(obs, s.t, s.player, [], mustPass);
  if (doNothing.safe || doNothing.survived > lead) return IDLE;

  let bestPlan: Input[] | null = null;
  let bestSurvived = doNothing.survived;
  let bestSafe = false;
  for (const plan of PLANS) {
    const r = simulate(obs, s.t, s.player, plan, mustPass);
    if (r.safe) {
      bestPlan = plan;
      bestSafe = true;
      break;
    }
    if (r.survived > bestSurvived) {
      bestSurvived = r.survived;
      bestPlan = plan;
    }
  }
  if (!bestPlan) return IDLE;
  if (!bestSafe) {
    // Nothing reaches safety yet. Wait a tick rather than commit to a doomed
    // plan — this is what makes the bot act at the last responsible moment,
    // the same instant a good player would.
    if (doNothing.survived > 2 * FIXED_DT) return IDLE;
    return bestPlan[0];
  }
  mem.plan = bestPlan;
  mem.planIdx = 1;
  return bestPlan[0];
}

/** Helper: describe what the player is about to hit (test diagnostics). */
export function nextObstacle(s: GameState): Obstacle | null {
  let best: Obstacle | null = null;
  for (const o of s.obstacles) {
    if (o.x + o.w - s.camX <= PLAYER_X) continue;
    if (!best || o.x < best.x) best = o;
  }
  return best;
}

export function debugPlayer(p: PlayerState): string {
  return `y=${p.y.toFixed(1)} vy=${p.vy.toFixed(0)} h=${playerHeight(p)}`;
}
