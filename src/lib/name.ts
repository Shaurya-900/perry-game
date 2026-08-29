import { SLURS, WORDS, WORD_SUFFIXES } from "./badwords";

/**
 * Leaderboard names: cleaned, then checked against `badwords.ts`.
 *
 * Both halves matter. The clean pass is what stops a name from wrecking the
 * booth display - zero-width padding, right-to-left overrides that reverse the
 * row, and stacked combining marks that spill over neighbouring rows are all
 * layout attacks no wordlist would catch. The blocklist pass is the one that
 * stops the slur.
 *
 * ponytail: substring wordlist, not a classifier. It catches the kid with a
 * keyboard, which is the threat at a club fair; it will not catch a novel
 * spelling. `/admin` keeps `hide` for the one that gets through.
 */

/** Control, invisible, and direction-flipping code points. Never a real name. */
function invisible(cp: number): boolean {
  return (
    cp < 0x20 ||
    (cp >= 0x7f && cp <= 0xa0) ||
    cp === 0xad ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0x202a && cp <= 0x202e) ||
    (cp >= 0x2060 && cp <= 0x206f) ||
    cp === 0xfeff
  );
}

/** Emoji only ever posted to be rude. */
const BANNED_CHARS = new Set([0x1f595, 0x1f346, 0x1f4a6, 0x1f351]);

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t",
  "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t",
  "(": "c", "<": "c",
};

function strip(s: string): string {
  let out = "";
  for (const ch of s) if (!invisible(ch.codePointAt(0)!)) out += ch;
  return out;
}

/** Whitespace collapsed, invisibles gone. This is what gets stored. */
export function cleanName(raw: string): string {
  return strip(raw.normalize("NFC")).replace(/\s+/g, " ").trim();
}

/** Lowercase, unaccented, de-leeted. Matching only - never displayed. */
function fold(name: string): string {
  const base = strip(name.normalize("NFKD").replace(/\p{M}/gu, "")).toLowerCase();
  let out = "";
  for (const ch of base) out += LEET[ch] ?? ch;
  return out;
}

/** Letters only, repeated letters collapsed: `n i i i g g er` -> `niger`. */
function squash(folded: string): string {
  return folded.replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
}

const WORD_RE = new RegExp(
  `(^|[^a-z])(${WORDS.join("|")})(${WORD_SUFFIXES.join("|")})?([^a-z]|$)`,
);
const SQUASHED_SLURS = SLURS.map(squash).filter(Boolean);

export function containsSlur(name: string): boolean {
  const folded = fold(name);
  if (WORD_RE.test(folded)) return true;
  const squashed = squash(folded);
  return SQUASHED_SLURS.some((s) => squashed.includes(s));
}

export type NameVerdict =
  | { ok: true; name: string }
  | { ok: false; reason: "invalid_name" | "blocked_name" };

export function checkName(raw: string): NameVerdict {
  const name = cleanName(raw ?? "");
  if (name.length < 2 || name.length > 40) return { ok: false, reason: "invalid_name" };
  // At least two letters in any script, so `...` and emoji-only get no row.
  const letters = (name.match(/\p{L}/gu) ?? []).length;
  if (letters < 2) return { ok: false, reason: "invalid_name" };
  // Zalgo: marks outnumbering the letters they sit on.
  if ((name.match(/\p{M}/gu) ?? []).length > letters) {
    return { ok: false, reason: "invalid_name" };
  }
  for (const ch of name) {
    if (BANNED_CHARS.has(ch.codePointAt(0)!)) return { ok: false, reason: "blocked_name" };
  }
  if (containsSlur(name)) return { ok: false, reason: "blocked_name" };
  return { ok: true, name };
}

/**
 * Display-side backstop. Rows written before this file existed, or edited
 * straight in the Supabase table, never passed `checkName` - and the one place
 * a bad name does damage is the wall at the stall, so it is also checked on
 * the way out. Cheap: the leaderboard read is cached for five seconds.
 */
export function safeName(raw: string | null | undefined): string {
  const name = cleanName(raw ?? "");
  return !name || containsSlur(name) ? "AGENT" : name;
}
