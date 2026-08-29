import { describe, expect, it } from "vitest";
import { isSnuDomain, looksLikeEmail } from "./validate";

describe("SNU-only enrolment", () => {
  it("accepts university addresses, including any subdomain", () => {
    for (const e of [
      "rs123@snu.edu.in",
      "RS123@SNU.EDU.IN",
      "  rs123@snu.edu.in  ",
      "a.b@cs.snu.edu.in",
    ]) {
      expect(looksLikeEmail(e), e).toBe(true);
      expect(isSnuDomain(e), e).toBe(true);
    }
  });

  it("rejects everything else, including lookalike domains", () => {
    for (const e of [
      "arshsecond112@gmail.com",
      "someone@snu.edu",
      "someone@snu.ac.in",
      // The suffix must be the domain, not merely present somewhere in it.
      "someone@notsnu.edu.in",
      "someone@snu.edu.in.evil.com",
    ]) {
      expect(isSnuDomain(e), e).toBe(false);
    }
  });
});
