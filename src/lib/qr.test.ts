import { describe, expect, it } from "vitest";
import { challengeUrl, parseChallenge } from "./qr";

/** In tests gameUrl() is empty, so the link is just the query string. */
const search = (url: string) => url.slice(url.indexOf("?"));
const roundTrip = (seed: number, score: number, name: string) =>
  parseChallenge(search(challengeUrl(seed, score, name)));

describe("challenge links", () => {
  it("round-trips a seed, score and name", () => {
    expect(roundTrip(3735928559, 1240, "Riya")).toEqual({
      seed: 3735928559,
      score: 1240,
      name: "Riya",
    });
  });

  it("survives a name containing the field separator", () => {
    // encodeURIComponent leaves "." alone, so a naive split would lose this.
    expect(roundTrip(42, 10, "Riya S.")?.name).toBe("Riya S.");
  });

  it("handles the full seed range and a zero score", () => {
    expect(roundTrip(0xffffffff, 0, "Max")).toEqual({
      seed: 0xffffffff,
      score: 0,
      name: "Max",
    });
  });

  it("returns null rather than a broken challenge", () => {
    for (const bad of ["", "?x=1", "?c=", "?c=zz", "?c=abc.def", "?c=1.2."]) {
      expect(parseChallenge(bad), bad).toBeNull();
    }
  });
});
