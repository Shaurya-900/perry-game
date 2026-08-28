import { describe, expect, it } from "vitest";
import {
  FIXED_DT,
  GATE_HIGH,
  GATE_LOW,
  GATE_W,
  PLAYER_H,
  PLAYER_SLIDE_H,
  SLIDE_TIME,
} from "./constants";
import { createGame, newPlayer, playerHeight, step, stepPlayer } from "./engine";
import { NO_INPUT, type Input } from "./types";

const TAP: Input = { ...NO_INPUT, slidePressed: true };
const HOLD_START: Input = { ...NO_INPUT, slidePressed: true, slideHeld: true };
const HOLD: Input = { ...NO_INPUT, slideHeld: true };

describe("ducking", () => {
  it("gives a bare tap a guaranteed minimum duck, then stands back up", () => {
    const p = newPlayer();
    stepPlayer(p, FIXED_DT, TAP);
    expect(playerHeight(p)).toBe(PLAYER_SLIDE_H);
    // Still down halfway through the guaranteed window...
    for (let i = 0; i < Math.floor(SLIDE_TIME / FIXED_DT / 2); i++) {
      stepPlayer(p, FIXED_DT, NO_INPUT);
    }
    expect(playerHeight(p)).toBe(PLAYER_SLIDE_H);
    // ...and back up once it has fully elapsed. The +2 ticks are slack for the
    // float residue left by repeatedly subtracting 1/60 from SLIDE_TIME.
    for (let i = 0; i < Math.ceil(SLIDE_TIME / FIXED_DT / 2) + 2; i++) {
      stepPlayer(p, FIXED_DT, NO_INPUT);
    }
    expect(playerHeight(p)).toBe(PLAYER_H);
  });

  it("stays down for as long as the input is held", () => {
    const p = newPlayer();
    stepPlayer(p, FIXED_DT, HOLD_START);
    // Well past SLIDE_TIME — a tap would have expired long ago.
    for (let i = 0; i < 240; i++) stepPlayer(p, FIXED_DT, HOLD);
    expect(playerHeight(p)).toBe(PLAYER_SLIDE_H);
    stepPlayer(p, FIXED_DT, NO_INPUT);
    expect(playerHeight(p)).toBe(PLAYER_H);
  });
});

/**
 * The bug this guards: ducking early is the natural reaction to seeing a gate
 * coming, but a fixed-duration duck expires before the player arrives and they
 * hit it standing — which on screen looks like the hat clipping the beam.
 * Holding has to keep them down.
 */
describe("ducking in mid-air", () => {
  function airtime(duckFrom: number) {
    const p = newPlayer();
    stepPlayer(p, FIXED_DT, { ...NO_INPUT, jumpPressed: true, jumpHeld: true });
    let t = FIXED_DT;
    for (let i = 1; i < 400; i++) {
      const held = i >= duckFrom;
      stepPlayer(p, FIXED_DT, { ...NO_INPUT, jumpHeld: !held, slideHeld: held });
      t += FIXED_DT;
      if (p.onGround) break;
    }
    return t;
  }

  it("cancels the jump and lands sooner than riding it out", () => {
    const normal = airtime(9999);
    const cancelled = airtime(10);
    expect(cancelled).toBeLessThan(normal * 0.8);
  });

  it("still cannot duck while off the ground", () => {
    const p = newPlayer();
    stepPlayer(p, FIXED_DT, { ...NO_INPUT, jumpPressed: true, jumpHeld: true });
    stepPlayer(p, FIXED_DT, { ...NO_INPUT, slideHeld: true });
    expect(p.onGround).toBe(false);
    expect(playerHeight(p)).toBe(PLAYER_H);
  });
});

describe("an early duck at a gate", () => {
  function run(input: (tick: number) => Input) {
    const s = createGame({ seed: 5 });
    s.obstacles.length = 0;
    s.obstacles.push({
      id: 1,
      kind: "gate",
      x: s.camX + 300, // far enough that arriving takes longer than SLIDE_TIME
      w: GATE_W,
      yLow: GATE_LOW,
      yHigh: GATE_HIGH,
      variant: 0,
    });
    for (let i = 0; i < 110 && !s.dead; i++) step(s, input(i));
    return s;
  }

  it("dies if the duck is only tapped", () => {
    expect(run((i) => (i === 0 ? TAP : NO_INPUT)).dead).toBe(true);
  });

  it("survives if the duck is held", () => {
    expect(run((i) => (i === 0 ? HOLD_START : HOLD)).dead).toBe(false);
  });
});
