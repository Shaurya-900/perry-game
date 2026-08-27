/**
 * All gameplay is simulated in a fixed 450 x 800 "world" (portrait 9:16-ish).
 * The canvas scales this to the device, so physics is identical on every phone.
 *
 * Vertical convention inside gameplay code: `y` means HEIGHT ABOVE THE GROUND
 * LINE (up is positive). Only the renderer converts to canvas pixels.
 */
export const WORLD_W = 450;
export const WORLD_H = 800;

/** Canvas y of the ground surface. */
export const GROUND_Y = 640;

export const PLAYER_X = 84;
export const PLAYER_W = 44;
export const PLAYER_H = 56;
/**
 * Collision forgiveness. The drawn character is PLAYER_W x PLAYER_H, but the
 * box that kills is inset — near-misses read as skill, not as bugs. Standard
 * runner trick and the single biggest contributor to the game feeling fair.
 */
export const HITBOX_INSET_X = 7;
export const HITBOX_INSET_TOP = 5;

/** px/s^2 */
export const GRAVITY = 2400;
/** Reduced gravity while the jump button is held and the player is rising. */
export const HOLD_GRAVITY = 900;
/** px/s */
export const JUMP_V = 820;
/** Holding longer than this stops helping (spec: ~450ms). */
export const MAX_HOLD = 0.45;
/** Tap buffer: a jump pressed this long before landing still fires. */
export const JUMP_BUFFER = 0.12;
/** Coyote time after walking off nothing (kept tiny, it is a runner). */
export const COYOTE = 0.06;

/**
 * World px/s at t=0. Chosen so that at the 2.2x ceiling an obstacle entering
 * the right edge of the screen still gives ~0.6 s of reaction time:
 *   (WORLD_W - PLAYER_X - PLAYER_W) / (BASE_SPEED * MAX_MULT) = 322 / 440
 */
export const BASE_SPEED = 200;
/** Speed multiplier ceiling. */
export const MAX_MULT = 2.2;
/** Seconds to reach MAX_MULT (linear ramp). */
export const RAMP_TIME = 90;

/** World px per point of distance score. Deliberately coarse: the counter
 *  should tick, not blur. */
export const METRE = 25;

export const FEDORA_POINTS = 20;
/** Seconds of invincibility from a golden fedora. */
export const GOLDEN_TIME = 4;
/** Points per obstacle ploughed through while invincible. */
export const PLOUGH_POINTS = 30;

/** Obstacle geometry (heights are above the ground line). */
export const CRATE_W = 40;
export const CRATE_H = 42;
export const TOWER_W = 38;
export const TOWER_H = 145;
export const DRONE_W = 36;
export const DRONE_HALF_H = 14;
/** Drone centre oscillates between these heights. */
export const DRONE_MIN_C = 40;
export const DRONE_MAX_C = 190;

export const COIN_R = 11;

/** How far ahead of the camera the generator keeps the world populated. */
export const SPAWN_AHEAD = WORLD_W + 260;
/** Obstacles this far behind the camera are dropped. */
export const DESPAWN_BEHIND = 240;

/** Physics tick. Everything is simulated at exactly this rate. */
export const FIXED_DT = 1 / 60;

/**
 * Anti-cheat ceiling, points per second.
 *   distance: MAX_MULT * BASE_SPEED / METRE            = 18 pts/s
 *   fedoras:  generator emits at most one 5-coin arc per 1.4 s
 *             -> 3.58 coins/s * 20                     = 72 pts/s
 *   plough:   at most ~1 obstacle/s while invincible    = 30 pts/s (rare, bounded)
 * Sum ~ 120, plus ~15 % headroom.
 */
export const MAX_SCORE_RATE = 140;

export function speedAt(t: number): number {
  const m = 1 + (MAX_MULT - 1) * Math.min(1, t / RAMP_TIME);
  return BASE_SPEED * m;
}

/** Closed-form integral of speedAt, so camera position never drifts. */
export function distanceAt(t: number): number {
  const k = (MAX_MULT - 1) / RAMP_TIME;
  if (t <= RAMP_TIME) return BASE_SPEED * (t + (k * t * t) / 2);
  const dRamp = BASE_SPEED * (RAMP_TIME + (k * RAMP_TIME * RAMP_TIME) / 2);
  return dRamp + BASE_SPEED * MAX_MULT * (t - RAMP_TIME);
}

/** Inverse of distanceAt. */
export function timeAt(d: number): number {
  const k = (MAX_MULT - 1) / RAMP_TIME;
  const dRamp = BASE_SPEED * (RAMP_TIME + (k * RAMP_TIME * RAMP_TIME) / 2);
  if (d <= dRamp) return (-1 + Math.sqrt(1 + (2 * k * d) / BASE_SPEED)) / k;
  return RAMP_TIME + (d - dRamp) / (BASE_SPEED * MAX_MULT);
}
