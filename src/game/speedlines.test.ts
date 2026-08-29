import { describe, expect, it } from "vitest";
import { SPEED_LINES, speedLine } from "./render";

describe("speed lines", () => {
  it("holds its height for the whole time a streak is on screen", () => {
    // Walk the camera across one full pass at a fine step. The streak's height
    // must not move while it is travelling: it raining down the sky was the bug.
    for (let i = 0; i < SPEED_LINES; i++) {
      const heights = new Set<number>();
      let x = Infinity;
      for (let camX = 5000; x > 0; camX += 3) {
        const l = speedLine(i, camX, 400);
        if (l.x < x) heights.add(l.y);
        else break; // wrapped: a new pass, and a new height is allowed
        x = l.x;
      }
      expect(heights.size, `streak ${i}`).toBe(1);
    }
  });

  it("moves right to left and re-shuffles height across passes", () => {
    const a = speedLine(0, 5000, 400);
    const b = speedLine(0, 5040, 400);
    expect(b.x).toBeLessThan(a.x);
    const seen = new Set<number>();
    for (let pass = 0; pass < 12; pass++) seen.add(speedLine(0, 5000 + pass * 500, 400).y);
    expect(seen.size).toBeGreaterThan(1);
  });
});
