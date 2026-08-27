import { describe, expect, it } from "vitest";
import { isPageKeystroke } from "./input";

/**
 * The canvas renders in attract mode behind the onboarding overlay, so its
 * window-level key handler is live while a visitor types their name and email.
 * It calls preventDefault() on W, S, Space and the arrows — which, unguarded,
 * silently ate those characters: "Riya Sw Menon" arrived as "RiyaMenon" and
 * "rs123@snu.edu.in" as "r123@nu.edu.in", and the form submitted the mangled
 * address. That is a corrupted lead, not just an annoyance, so it gets a test.
 */
const target = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable }) as unknown as EventTarget;

describe("keyboard controls vs. the rest of the page", () => {
  it("leaves keystrokes alone while someone is filling in the form", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "OPTION"]) {
      expect(isPageKeystroke(target(tag)), tag).toBe(true);
    }
    expect(isPageKeystroke(target("DIV", true))).toBe(true);
  });

  it("lets a focused button or link keep its own Space and Enter", () => {
    expect(isPageKeystroke(target("BUTTON"))).toBe(true);
    expect(isPageKeystroke(target("A"))).toBe(true);
  });

  it("still claims keys aimed at the game itself", () => {
    for (const tag of ["CANVAS", "BODY", "DIV", "MAIN"]) {
      expect(isPageKeystroke(target(tag)), tag).toBe(false);
    }
    expect(isPageKeystroke(null)).toBe(false);
    // window is a legitimate target and has no tagName.
    expect(isPageKeystroke({} as EventTarget)).toBe(false);
  });
});
