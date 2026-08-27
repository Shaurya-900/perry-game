import {
  COYOTE,
  COIN_R,
  DESPAWN_BEHIND,
  FEDORA_POINTS,
  FIXED_DT,
  GOLDEN_TIME,
  GRAVITY,
  HITBOX_INSET_TOP,
  HITBOX_INSET_X,
  HOLD_GRAVITY,
  JUMP_BUFFER,
  JUMP_V,
  MAX_HOLD,
  METRE,
  PLAYER_H,
  PLAYER_W,
  PLAYER_X,
  PLOUGH_POINTS,
  SPAWN_AHEAD,
  distanceAt,
  speedAt,
} from "./constants";
import { createGen, generate, obBox, type GenState } from "./generator";
import { makeRng, type Rng } from "./rng";
import type { Coin, Fx, Input, Obstacle, PlayerState } from "./types";

export interface GameState {
  seed: number;
  rng: Rng;
  gen: GenState;
  /** Elapsed run time in seconds (fixed-step, exact). */
  t: number;
  /** Absolute camera x — closed form from `t`, so it never drifts. */
  camX: number;
  /** Camera x when the run began (runs can start mid-curve in tests). */
  startCamX: number;
  startTime: number;
  speed: number;
  player: PlayerState;
  obstacles: Obstacle[];
  coins: Coin[];
  distancePoints: number;
  coinPoints: number;
  bonusPoints: number;
  fedoras: number;
  invT: number;
  dead: boolean;
  deadAt: number;
  fx: Fx[];
  best: number;
  beatBestAt: number;
}

export function newPlayer(): PlayerState {
  return {
    y: 0,
    vy: 0,
    onGround: true,
    holding: false,
    holdT: 0,
    jumpBuffer: 0,
    coyote: COYOTE,
  };
}

export function createGame(opts: {
  seed: number;
  startTime?: number;
  best?: number;
}): GameState {
  const t = opts.startTime ?? 0;
  const camX = distanceAt(t);
  const rng = makeRng(opts.seed);
  const gen = createGen(camX);
  const state: GameState = {
    seed: opts.seed,
    rng,
    gen,
    t,
    camX,
    startCamX: camX,
    startTime: t,
    speed: speedAt(t),
    player: newPlayer(),
    obstacles: [],
    coins: [],
    distancePoints: 0,
    coinPoints: 0,
    bonusPoints: 0,
    fedoras: 0,
    invT: 0,
    dead: false,
    deadAt: 0,
    fx: [],
    best: opts.best ?? 0,
    beatBestAt: -1,
  };
  generate(gen, rng, state.obstacles, state.coins, camX + SPAWN_AHEAD);
  return state;
}

/**
 * One physics tick for the player. Shared by the game and the test bot so the
 * bot is provably playing the same game the human is.
 */
export function stepPlayer(p: PlayerState, dt: number, input: Input): void {
  if (input.jumpPressed) p.jumpBuffer = JUMP_BUFFER;

  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = JUMP_V;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.holding = true;
    p.holdT = 0;
  } else {
    p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  }

  if (p.holding) {
    if (!input.jumpHeld || p.vy <= 0 || p.holdT >= MAX_HOLD) p.holding = false;
    else p.holdT += dt;
  }

  const g = p.holding ? HOLD_GRAVITY : GRAVITY;
  p.vy -= g * dt;
  p.y += p.vy * dt;

  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.holding = false;
    p.coyote = COYOTE;
    p.onGround = true;
  } else {
    p.onGround = false;
    p.coyote = Math.max(0, p.coyote - dt);
  }
}

/** Does the player box overlap this obstacle at time `t` / camera `camX`? */
export function hits(
  o: Obstacle,
  p: PlayerState,
  camX: number,
  t: number,
): boolean {
  const sx = o.x - camX;
  const left = PLAYER_X + HITBOX_INSET_X;
  const right = PLAYER_X + PLAYER_W - HITBOX_INSET_X;
  if (sx > right || sx + o.w < left) return false;
  const top = p.y + PLAYER_H - HITBOX_INSET_TOP;
  const box = obBox(o, t);
  return p.y < box.hi && top > box.lo;
}

export function score(s: GameState): number {
  return Math.floor(s.distancePoints) + s.coinPoints + s.bonusPoints;
}

function fx(s: GameState, kind: Fx["kind"], x: number, y: number) {
  s.fx.push({ kind, x, y, t: s.t });
  if (s.fx.length > 64) s.fx.shift();
}

/** Advance exactly one fixed tick. */
export function step(s: GameState, input: Input): void {
  if (s.dead) return;
  const dt = FIXED_DT;
  const wasAir = !s.player.onGround;

  s.t += dt;
  s.camX = distanceAt(s.t);
  s.speed = speedAt(s.t);
  if (s.invT > 0) s.invT = Math.max(0, s.invT - dt);

  const p = s.player;
  stepPlayer(p, dt, input);
  if (wasAir && p.onGround) fx(s, "land", PLAYER_X, 0);
  if (!wasAir && !p.onGround) fx(s, "jump", PLAYER_X, 0);

  generate(s.gen, s.rng, s.obstacles, s.coins, s.camX + SPAWN_AHEAD);

  // Obstacles
  for (let i = s.obstacles.length - 1; i >= 0; i--) {
    const o = s.obstacles[i];
    if (o.x + o.w - s.camX < -DESPAWN_BEHIND) {
      s.obstacles.splice(i, 1);
      continue;
    }
    if (hits(o, p, s.camX, s.t)) {
      if (s.invT > 0) {
        if (!o.ploughed) {
          o.ploughed = true;
          s.bonusPoints += PLOUGH_POINTS;
          fx(s, "plough", o.x - s.camX, obBox(o, s.t).lo);
        }
      } else {
        s.dead = true;
        s.deadAt = s.t;
        fx(s, "death", PLAYER_X, p.y);
        return;
      }
    }
  }

  // Coins
  for (let i = s.coins.length - 1; i >= 0; i--) {
    const c = s.coins[i];
    if (c.x - s.camX < -DESPAWN_BEHIND) {
      s.coins.splice(i, 1);
      continue;
    }
    if (c.taken) continue;
    const cx = c.x - s.camX;
    if (
      cx + COIN_R > PLAYER_X &&
      cx - COIN_R < PLAYER_X + PLAYER_W &&
      c.y + COIN_R > p.y &&
      c.y - COIN_R < p.y + PLAYER_H
    ) {
      c.taken = true;
      if (c.golden) {
        s.invT = GOLDEN_TIME;
        s.coinPoints += FEDORA_POINTS * 2;
        fx(s, "golden", cx, c.y);
      } else {
        s.fedoras++;
        s.coinPoints += FEDORA_POINTS;
        fx(s, "collect", cx, c.y);
      }
    }
  }

  s.distancePoints = (s.camX - s.startCamX) / METRE;

  if (s.best > 0 && s.beatBestAt < 0 && score(s) > s.best) {
    s.beatBestAt = s.t;
    fx(s, "best", PLAYER_X, p.y);
  }
}

/** Convenience for tests / headless runs. */
export function stepMany(s: GameState, ticks: number, input: Input): void {
  for (let i = 0; i < ticks && !s.dead; i++) step(s, input);
}
