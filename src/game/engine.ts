import {
  COYOTE,
  COIN_R,
  DESPAWN_BEHIND,
  FEDORA_POINTS,
  FIXED_DT,
  GOLDEN_TIME,
  GRAVITY,
  MAGNET_PULL,
  MAGNET_RADIUS,
  MAGNET_TIME,
  HITBOX_INSET_TOP,
  HITBOX_INSET_X,
  HOLD_GRAVITY,
  JUMP_BUFFER,
  JUMP_V,
  MAX_HOLD,
  METRE,
  PLAYER_H,
  PLAYER_SLIDE_H,
  PLAYER_W,
  PLAYER_X,
  PLOUGH_POINTS,
  SHIELD_GRACE,
  SLIDE_TIME,
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
  magnetT: number;
  /** One free hit, held until an obstacle takes it. */
  shield: boolean;
  dead: boolean;
  deadAt: number;
  fx: Fx[];
  best: number;
  beatBestAt: number;
}

export function playerHeight(p: PlayerState): number {
  return p.sliding ? PLAYER_SLIDE_H : PLAYER_H;
}

export function newPlayer(): PlayerState {
  return {
    y: 0,
    vy: 0,
    onGround: true,
    holding: false,
    holdT: 0,
    slideT: 0,
    slideBuffer: 0,
    sliding: false,
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
    magnetT: 0,
    shield: false,
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
  if (input.slidePressed) p.slideBuffer = JUMP_BUFFER;

  if (p.jumpBuffer > 0 && (p.onGround || p.coyote > 0)) {
    p.vy = JUMP_V;
    p.onGround = false;
    p.coyote = 0;
    p.jumpBuffer = 0;
    p.slideT = 0;
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

  if (p.slideBuffer > 0 && p.onGround && !p.sliding) {
    p.slideT = SLIDE_TIME;
    p.slideBuffer = 0;
  } else {
    p.slideBuffer = Math.max(0, p.slideBuffer - dt);
    if (p.slideT > 0) p.slideT = Math.max(0, p.slideT - dt);
  }
  // Holding keeps the duck open. Without this an early duck — the natural
  // reaction to seeing a gate coming — expires just before the gate and the
  // player arrives standing.
  p.sliding = p.onGround && (p.slideT > 0 || input.slideHeld);
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
  const top = p.y + playerHeight(p) - HITBOX_INSET_TOP;
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
  const wasSliding = s.player.sliding;

  s.t += dt;
  s.camX = distanceAt(s.t);
  s.speed = speedAt(s.t);
  if (s.invT > 0) s.invT = Math.max(0, s.invT - dt);
  if (s.magnetT > 0) s.magnetT = Math.max(0, s.magnetT - dt);

  const p = s.player;
  stepPlayer(p, dt, input);
  if (wasAir && p.onGround) fx(s, "land", PLAYER_X, 0);
  if (!wasAir && !p.onGround) fx(s, "jump", PLAYER_X, 0);
  if (!wasSliding && p.sliding) fx(s, "slide", PLAYER_X, 0);

  generate(s.gen, s.rng, s.obstacles, s.coins, s.camX + SPAWN_AHEAD);

  // Obstacles
  for (let i = s.obstacles.length - 1; i >= 0; i--) {
    const o = s.obstacles[i];
    if (o.x + o.w - s.camX < -DESPAWN_BEHIND) {
      s.obstacles.splice(i, 1);
      continue;
    }
    // Near miss: fires once, the first tick the obstacle is fully behind the
    // player's hitbox. Rewards the tight play the late-game gaps ask for.
    if (!o.passed && o.x + o.w - s.camX < PLAYER_X + HITBOX_INSET_X) {
      o.passed = true;
      const box = obBox(o, s.t);
      const top = p.y + playerHeight(p) - HITBOX_INSET_TOP;
      const clearance = Math.min(Math.abs(p.y - box.hi), Math.abs(top - box.lo));
      if (clearance < 14) fx(s, "nearmiss", PLAYER_X, p.y);
    }
    if (hits(o, p, s.camX, s.t)) {
      if (s.invT > 0) {
        if (!o.ploughed) {
          o.ploughed = true;
          s.bonusPoints += PLOUGH_POINTS;
          fx(s, "plough", o.x - s.camX, obBox(o, s.t).lo);
        }
      } else if (s.shield) {
        s.shield = false;
        s.invT = SHIELD_GRACE;
        fx(s, "shield_break", PLAYER_X, p.y);
      } else {
        s.dead = true;
        s.deadAt = s.t;
        fx(s, "death", PLAYER_X, p.y);
        return;
      }
    }
  }

  // Coins
  const h = playerHeight(p);
  if (s.magnetT > 0) {
    const px = s.camX + PLAYER_X + PLAYER_W / 2;
    const py = p.y + h / 2;
    for (const c of s.coins) {
      if (c.taken || c.power) continue;
      const dx = px - c.x;
      const dy = py - c.y;
      const d = Math.hypot(dx, dy);
      if (d > 1 && d < MAGNET_RADIUS) {
        const k = Math.min(1, (MAGNET_PULL * dt) / d);
        c.x += dx * k;
        c.y += dy * k;
      }
    }
  }
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
      c.y - COIN_R < p.y + h
    ) {
      c.taken = true;
      // Magnet and shield deliberately score nothing, which is what keeps
      // MAX_SCORE_RATE valid without recomputation.
      switch (c.power) {
        case "golden":
          s.invT = GOLDEN_TIME;
          s.coinPoints += FEDORA_POINTS * 2;
          fx(s, "golden", cx, c.y);
          break;
        case "magnet":
          s.magnetT = MAGNET_TIME;
          fx(s, "magnet", cx, c.y);
          break;
        case "shield":
          s.shield = true;
          fx(s, "shield", cx, c.y);
          break;
        default:
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
