import { describe, expect, it } from "vitest";
import { CRATE_H, CRATE_W, PLAYER_X } from "./constants";
import { botInput, newBotMemory } from "./bot";
import { createGame, score, step, type GameState } from "./engine";
import { NO_INPUT } from "./types";

/** Drop a crate exactly where the player is about to be. */
function crateOnPlayer(s: GameState) {
  s.obstacles.length = 0;
  s.obstacles.push({
    id: 9999,
    kind: "crate",
    x: s.camX + PLAYER_X + 20,
    w: CRATE_W,
    yLow: 0,
    yHigh: CRATE_H,
    variant: 0,
  });
}

describe("shield", () => {
  // Control: without this the shield test below could pass vacuously by simply
  // never colliding.
  it("the same hit kills when no shield is held", () => {
    const s = createGame({ seed: 7 });
    crateOnPlayer(s);
    step(s, NO_INPUT);
    expect(s.dead).toBe(true);
  });

  it("absorbs exactly one hit, then stops helping", () => {
    const s = createGame({ seed: 7 });
    s.shield = true;
    crateOnPlayer(s);
    step(s, NO_INPUT);
    expect(s.dead).toBe(false);
    expect(s.shield).toBe(false);
    // Grace matters: without it the player is still inside the crate next tick.
    expect(s.invT).toBeGreaterThan(0);

    s.invT = 0;
    crateOnPlayer(s);
    step(s, NO_INPUT);
    expect(s.dead).toBe(true);
  });
});

describe("magnet", () => {
  function run(magnet: boolean) {
    const s = createGame({ seed: 11 });
    const mem = newBotMemory();
    for (let i = 0; i < 60 * 20 && !s.dead; i++) {
      if (magnet) s.magnetT = 5;
      step(s, botInput(s, mem));
    }
    return s;
  }

  it("collects fedoras the player would otherwise miss", () => {
    expect(run(true).fedoras).toBeGreaterThan(run(false).fedoras);
  });

  // Challenge links and any future replay rely on this holding.
  it("stays deterministic for a given seed", () => {
    const snap = (s: GameState) => ({
      score: score(s),
      fedoras: s.fedoras,
      coins: s.coins.map((c) => [c.x, c.y, c.taken]),
    });
    expect(snap(run(true))).toEqual(snap(run(true)));
  });
});

it("magnet and shield pickups score nothing", () => {
  // This is what keeps MAX_SCORE_RATE valid without recomputation.
  for (const power of ["magnet", "shield"] as const) {
    const s = createGame({ seed: 3 });
    s.obstacles.length = 0;
    s.coins.length = 0;
    s.coins.push({ id: 1, x: s.camX + PLAYER_X + 20, y: 20, power, taken: false });
    step(s, NO_INPUT);
    expect(s.coins[0].taken).toBe(true);
    expect(s.coinPoints).toBe(0);
    expect(s.fedoras).toBe(0);
  }
});
