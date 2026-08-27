export type ObKind = "crate" | "tower" | "drone";

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
  /** Cosmetic variant so the art is not uniform. */
  variant: number;
}

export interface Coin {
  id: number;
  x: number;
  /** Height above the ground line of the centre. */
  y: number;
  golden: boolean;
  taken: boolean;
}

export interface PlayerState {
  /** Height of the feet above the ground line. */
  y: number;
  vy: number;
  onGround: boolean;
  holding: boolean;
  holdT: number;
  jumpBuffer: number;
  coyote: number;
}

export interface Input {
  jumpPressed: boolean;
  jumpHeld: boolean;
}

export const NO_INPUT: Input = { jumpPressed: false, jumpHeld: false };

export type FxKind =
  | "collect"
  | "golden"
  | "death"
  | "best"
  | "plough"
  | "land"
  | "jump";

export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  t: number;
}
