import { describe, expect, it } from "vitest";
import { nightAt } from "./render";

/**
 * Cosmetic, but it is a four-branch cycle and a wrong boundary would strand the
 * game in permanent dusk. Pure function of run time, so it is cheap to pin.
 */
describe("day/night cycle", () => {
  it("starts and stays in daylight through the opening run", () => {
    for (const t of [0, 5, 20, 41.9]) expect(nightAt(t)).toBe(0);
  });

  it("crossfades to night, holds, then comes back", () => {
    expect(nightAt(44.5)).toBeGreaterThan(0);
    expect(nightAt(44.5)).toBeLessThan(1);
    expect(nightAt(47)).toBe(1);
    expect(nightAt(80)).toBe(1);
    const returning = nightAt(91.5);
    expect(returning).toBeGreaterThan(0);
    expect(returning).toBeLessThan(1);
  });

  it("is continuous and always within range, including past one full cycle", () => {
    let prev = nightAt(0);
    for (let t = 0; t < 400; t += 0.1) {
      const v = nightAt(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      // No jump larger than one step of the fade.
      expect(Math.abs(v - prev)).toBeLessThan(0.1);
      prev = v;
    }
  });
});
