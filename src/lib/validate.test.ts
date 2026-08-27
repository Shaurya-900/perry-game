import { describe, expect, it } from "vitest";
import { checkScore } from "./validate";

/** A run the server should always accept, used as the baseline to perturb. */
const good = { score: 400, durationMs: 20_000, fedoras: 2 };
const age = 25_000;

describe("checkScore", () => {
  it("accepts an ordinary run", () => {
    expect(checkScore(good, age).ok).toBe(true);
  });

  // Regression: Number("abc") arrives as NaN, every bare comparison against it
  // is false, so it used to pass validation and then hit a NOT NULL column.
  it("rejects a non-numeric fedora count instead of passing it to the insert", () => {
    for (const fedoras of [NaN, Infinity, -1, 1.5]) {
      expect(checkScore({ ...good, fedoras }, age).ok).toBe(false);
    }
  });

  it("still rejects more fedoras than the score can account for", () => {
    expect(checkScore({ ...good, fedoras: 99 }, age).ok).toBe(false);
  });
});
