export type ObKind =
  | "crate"
  | "tower"
  | "laser"
  | "drone"
  | "gate"
  | "spikes"
  | "patrol";

export interface Obstacle {
  id: number;
  kind: ObKind;
  /** Absolute world x of the left edge. */
  x: number;
  w: number;
  /** Static vertical extent, heights above the ground line. */
  yLow: number;
  yHigh: number;
  /** Drone motion (undefined for static obstacles). */
  cy?: number;
  amp?: number;
  om?: number;
  ph?: number;
  /** Already scored as a plough-through. */
  ploughed?: boolean;
  /** Already gone by the player, so near-miss juice fires only once. */
  passed?: boolean;
  /** Cosmetic variant so the art is not uniform. */
  variant: number;
}

/** A pickup that does something other than score. */
export type PowerKind = "golden" | "magnet" | "shield";

export interface Coin {
  id: number;
  x: number;
  /** Height above the ground line of the centre. */
  y: number;
  /** null for a plain fedora. */
  power: PowerKind | null;
  taken: boolean;
}

export interface PlayerState {
  /** Height of the feet above the ground line. */
  y: number;
  vy: number;
  onGround: boolean;
  holding: boolean;
  holdT: number;
  slideT: number;
  slideBuffer: number;
  /** Actually ducked this tick — the tap minimum or the held input. */
  sliding: boolean;
  jumpBuffer: number;
  coyote: number;
}

export interface Input {
  jumpPressed: boolean;
  jumpHeld: boolean;
  slidePressed: boolean;
  /**
   * The duck stays open while this is held and ends when it is released. A tap
   * alone still guarantees SLIDE_TIME, so both a jab and a hold work.
   */
  slideHeld: boolean;
}

export const NO_INPUT: Input = {
  jumpPressed: false,
  jumpHeld: false,
  slidePressed: false,
  slideHeld: false,
};

export type FxKind =
  | "collect"
  | "golden"
  | "death"
  | "best"
  | "plough"
  | "land"
  | "jump"
  | "slide"
  | "magnet"
  | "shield"
  | "shield_break"
  | "nearmiss";

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  t: number;
}
