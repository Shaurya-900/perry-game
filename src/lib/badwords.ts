/**
 * Leaderboard name blocklist. This board is projected on a monitor at a public
 * university stall, so the bar is "would this embarrass E-Cell on a wall",
 * not "is it technically a slur".
 *
 * Two buckets, because the Scunthorpe problem is real and Indian names are the
 * common case here:
 *
 *   SLURS  — matched anywhere inside the squashed name (letters only, repeated
 *            letters collapsed), so `N I G G 3 R` and `niiiggerrr` both land.
 *            Only put entries here that cannot appear inside a real name.
 *            `gaand` is NOT here on purpose: squashing makes it `gand`, which
 *            is inside `Gandhi`.
 *   WORDS  — matched as a whole word with a small suffix tolerance, for short
 *            or ambiguous entries. `shit` here, not above, because `Kshitij`.
 *
 * Adding to the list is the intended maintenance path — it is data, not logic.
 */

/** Matched as a substring of the squashed name. Long, unambiguous entries. */
export const SLURS: string[] = [
  // racial / ethnic
  "nigger", "nigga", "jigaboo", "wetback", "towelhead", "raghead", "beaner",
  "darkie", "halfbreed", "mulatto", "redskin", "tarbaby", "zipperhead",
  "slanteye", "chinki", "chinky", "camel jockey",
  // caste / communal (India)
  "chamar", "bhangi", "chuhra", "mlechha", "katua", "landya",
  // homophobic / transphobic
  "faggot", "fagot", "tranny", "shemale", "ladyboy",
  // ableist
  "retard", "spastic", "mongoloid",
  // hate glorification
  "hitler", "nazi", "swastika", "isis", "taliban",
  // sexual / explicit
  "motherfucker", "fucker", "fuck", "bitch", "bastard", "cunt", "whore",
  "cocksucker", "dickhead", "blowjob", "handjob", "cumshot", "dildo", "porn",
  "penis", "vagina", "scrotum", "testicle", "masturbat", "jerkoff", "orgasm",
  "hentai", "incest", "bestiality", "necrophil", "rapist", "pedophile",
  "paedophile", "molester",
  // hindi / punjabi / urdu
  "bhenchod", "behenchod", "bhainchod", "betichod", "maachod", "madarchod",
  "maderchod", "madrchod", "bhosdi", "bhosda", "bhosad", "chutiya", "chutiye",
  "chutia", "chootiya", "chootia", "bhosdike", "bhosdika", "chodu", "gandu", "gaandu", "lauda", "lawda", "lodu", "randi",
  "raand", "harami", "kutiya", "kamina", "kamine", "bakchod", "chinal",
  "jhatu", "jhaat", "jhant", "tatti", "hijra",
];

/** Matched as a whole word (plus a common suffix) in the folded name. */
export const WORDS: string[] = [
  "ass", "asshole", "arse", "dick", "cock", "piss", "shit", "shite", "slut",
  "milf", "bdsm", "nude", "rape", "pedo", "cum", "boobs", "titties",
  "fag", "dyke", "homo", "queer", "chink", "gook", "spic", "kike", "coon",
  "paki", "wog", "negro", "midget", "cripple", "gimp",
  "gaand", "gand", "lund", "chut", "choot", "chod", "saala", "kutta", "kutte",
];

/** Suffixes tolerated on a WORDS hit, so `shitface` is not a loophole. */
export const WORD_SUFFIXES = [
  "s", "z", "es", "ed", "er", "ers", "ing", "y", "ie", "head", "face", "hole",
  "bag", "wad", "boy", "girl", "lord", "master", "ji", "u", "e", "a",
];
