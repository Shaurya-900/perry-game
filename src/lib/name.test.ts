import { describe, expect, it } from "vitest";
import { checkName, safeName } from "./name";

const blocked = (s: string) => checkName(s).ok === false;
const allowed = (s: string) => checkName(s).ok === true;

describe("checkName", () => {
  it("keeps ordinary names, including the ones a wordlist gets wrong", () => {
    // Every one of these contains a banned substring or nearly does, which is
    // the whole reason the short entries are word-matched instead.
    for (const n of [
      "Riya S.", "Kshitij Sharma", "Cassandra", "Assam Boy", "Mahatma Gandhi",
      "Homi Bhabha", "Kutty", "Anal Roy", "Saloni", "Aarav", "Zoë Fernandes",
      "Ravi Kumar", "Priyanshu", "Sana Q", "Coorg Kid",
    ]) {
      expect(allowed(n), n).toBe(true);
    }
  });

  it("blocks slurs however they are spelled", () => {
    for (const n of [
      "n1gg3r", "N I G G E R", "niiigggerrr", "F4GGOT", "ch00tiya",
      "Madarchod", "bhen chod", "retard", "Hitler", "@sshole", "Shit Face",
      "Team Ch1nki",
    ]) {
      expect(blocked(n), n).toBe(true);
    }
  });

  it("blocks names that would wreck the stall display", () => {
    const rtl = checkName("A‮BCDEF");           // right-to-left override
    expect(rtl.ok && rtl.name).toBe("ABCDEF");     // stripped, not rejected
    expect(blocked("​​​​")).toBe(true); // zero width only
    expect(blocked("á́́́́")).toBe(true); // zalgo
    expect(blocked("...")).toBe(true);
    expect(blocked("A")).toBe(true);
  });

  it("strips invisibles from the stored name", () => {
    const v = checkName("  Riya​   S.  ");
    expect(v.ok && v.name).toBe("Riya S.");
  });

  it("safeName covers rows written before the check existed", () => {
    expect(safeName("Madarchod")).toBe("AGENT");
    expect(safeName("Riya S.")).toBe("Riya S.");
    expect(safeName(null)).toBe("AGENT");
  });
});
