# E-Cell Agent Run

A one-thumb comic-book runner for the E-Cell stall at the Shiv Nadar University
club fair. Visitors scan a QR at the booth, play a 30–60 second run in their
phone browser, and their best score lands on a live leaderboard shown on a
monitor at the stall. Every play produces a named, contactable person in a
database E-Cell can export.

No login, no OAuth, no email verification. Two fields and a big red button.

```
/                 the game (phone)
/display          booth leaderboard for the monitor, refreshes every 5s
/admin?key=…      totals, funnel, runs-per-hour, CSV export, freeze switch
```

---

## Running it

```bash
npm install
cp .env.example .env.local     # fill in the values below
npm run dev                    # http://localhost:3000
```

The game is fully playable with no environment at all — the API degrades to
"not configured" and scores stay on the phone. That is deliberate: a Supabase
outage during the fair costs you the leaderboard, not the booth.

### Environment

| Variable | What it is |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL. Server-only — it is read in route handlers, never in the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key. Server-only — every table has RLS on with no policies, so route handlers are the only way in |
| `RUN_TOKEN_SECRET` | Long random string used to sign run tokens |
| `ADMIN_KEY` | Opens `/admin?key=…` |
| `NEXT_PUBLIC_GAME_URL` | Absolute URL of the deployment, used for the QR codes |
| `LEADERBOARD_FROZEN` | Optional `1` to hard-freeze the board without touching the database |

### Database

Paste `supabase/schema.sql` into the Supabase SQL editor once. It creates
`players`, `runs`, `rejected_submissions`, `events`, `settings` and the
`leaderboard` view.

`leaderboard` is a plain view, not a materialized one: the booth display has to
show a new score within five seconds, and `REFRESH MATERIALIZED VIEW` on every
submit is both slower and more load than an indexed read of
`players.best_score`, which is denormalised on submit.

### Deploying

Push to a Vercel project, set the same variables, and point the QR at
`NEXT_PUBLIC_GAME_URL`. Nothing else is needed — no cron, no workers, no
storage buckets.

---

## How the game works

Everything gameplay-related lives in `src/game/` and runs in plain TypeScript
with no engine, no physics library, and no image or audio assets. The whole art
pack is `src/game/art.ts` (canvas paths) and every sound is a WebAudio
oscillator, which is why the first load is ~124 KB of JS and no media.

**Deterministic simulation.** The world advances in fixed 1/60 s ticks and the
camera position is a closed-form integral of the speed curve, so a run is
identical on a 60 Hz phone and a 120 Hz one, and any run can be replayed from
its seed. The seed comes from the server at `POST /api/run/start`.

**The controls.** Tap anywhere to jump, hold for a higher one. Hold the lower
third of the screen (or swipe down) to duck, and you stay down for as long as
you hold. Ducking in mid-air cancels the jump and drops you fast, so a jump
taken by mistake is still recoverable.

Ducking is not decorative: the `gate` obstacle tops out above the measured
311px jump apex, so no jump can clear it, and its underside sits between the
sliding and standing hitbox tops. `generator.test.ts` pins both halves — that a
jump cannot pass it, and that a slide can.

**The difficulty curve.** Speed ramps linearly from 200 world px/s to 2.2× that
over 90 seconds. The base speed is picked so that even at the 2.2× ceiling an
obstacle entering the right edge of the screen still leaves ~0.7 s of reaction
time. A second, slower ramp (`pressureAt`, 180 s) keeps tightening the gap
between patterns after the speed curve has topped out, so a long run keeps
getting harder instead of plateauing.

**Obstacle generation.** The generator never places obstacles by pixel gap. It
places them by *time* gap at the speed the player will actually be travelling
when they arrive: reaction time plus the recovery time for the previous answer
(a held jump costs more than a slide). Multi-obstacle patterns are spaced in
fixed pixels and capped at `MAX_PATTERN_SPAN`, so the whole shape is on screen
before the player has to commit to a jump.

### The fairness test

`src/game/generator.test.ts` plays **10,000 generated patterns** with a
perfect-input bot and asserts zero deaths. The bot is deliberately not
superhuman:

- it only sees obstacles that are actually on screen, and
- it uses the exact `stepPlayer` physics the human's thumb drives.

It plans on a receding horizon — every tick it asks "if I do nothing, am I
still fine?" and only searches the action set when doing nothing leads to a
collision — so it acts at the last responsible moment, the same instant a good
player would. Half the sample is generated from a cold start and half from
`t = 90 s`, where the speed curve is pinned at its ceiling.

`src/game/playability.test.ts` asks the question the booth actually cares
about: how long does a *human* last? It models one as the same bot whose
decisions land late and who fumbles some of them entirely, and pins the median
run to the target band.

```bash
npm test          # 10k-pattern fairness proof + difficulty curve, ~10s
npm run typecheck
npm run build
```

---

## Names on the board

The leaderboard goes on a monitor in a public university corridor, so the name
field is the highest-risk input in the app — it is the only free text that ends
up on a wall.

`src/lib/name.ts` cleans it and then checks it, in that order:

- **Cleaning** removes control characters, zero-width padding and right-to-left
  overrides (which silently reverse a display row), collapses whitespace, and
  rejects a name whose combining marks outnumber its letters — the "zalgo"
  trick that spills text over neighbouring rows. None of this is a wordlist
  problem; a blocklist would never catch it.
- **The blocklist** in `src/lib/badwords.ts` matches against a folded form:
  lowercased, unaccented, leetspeak mapped (`n1gg3r`), and — for the slur list
  — letters only with repeats collapsed, so `N I I G G E R` folds to the same
  string. Slurs, caste and communal abuse, and Hindi/Punjabi profanity are
  matched anywhere inside the name; short or ambiguous entries are matched as
  whole words instead, because `Kshitij`, `Cassandra`, `Assam` and `Gandhi` all
  contain a banned substring and all are real names. `name.test.ts` pins both
  halves: those names pass, and a dozen spellings of the slurs do not.

The list is data, not logic — adding to it is the intended maintenance path.

The check runs in three places, and only the second one is a boundary: the
onboarding form (instant feedback), `POST /api/player` (the actual gate, on
both the insert and the returning-player update), and once more on the way out
in `/api/leaderboard` and `/api/display/live`, so a row written before this
existed or edited straight in the Supabase table still cannot reach the wall.
Anything that gets past the list is one `hide` click away in `/admin`.

Emails are unverified by design, and anyone can guess a classmate's address, so
the first device to claim a player row owns the name on it. A second phone with
the same email still lands on the same row and still scores — it just cannot
rename someone else's leaderboard entry.

---

## Anti-cheat

`POST /api/run/start` issues an HMAC-signed token containing a run id, the
player id, a server timestamp and the seed. `POST /api/run/submit` rejects a
submission when the token is missing, forged, older than ten minutes, or
already used (the run id is the primary key of `runs`, so a replay collides),
when the score exceeds the maximum rate the difficulty curve physically allows
plus ~15% headroom, or when a player has submitted more than 20 runs in five
minutes. Everything rejected is written to `rejected_submissions` with a
reason, so patterns are visible after the fair.

Two bounds close the gaps that leaves:

- Tokens are prefetched before a run, so a forged submission could otherwise
  claim a ten-minute "run" and buy ten minutes of score allowance. Credited
  duration is capped at five minutes (`MAX_CREDITED_MS`). It is a cap on the
  *allowance*, not a rejection, so an exceptional long run is still accepted at
  whatever it actually scored.
- Token minting is capped at 40 per player per five minutes, and new player
  rows at 40 per IP per ten minutes, which is well above a real booth rate — a
  queue of students shares one campus NAT — and low enough that a script cannot
  mint thousands of junk rows in the export. The limiter is in memory and
  therefore per-instance; see the note in `src/lib/ratelimit.ts`.

This will not stop a determined attacker — the game runs on the player's own
device, so nothing can, and the blocklist ships to the browser where anyone can
read it. It stops the devtools-console kid, which is the realistic threat at a
club fair, and it bounds the damage of everything else.

---

## Booth runbook

**Before the fair.** Deploy, run the schema, print the QR from `/display`
(bottom right), open `/display` full-screen on the stall monitor, and take one
run yourself on a real phone to confirm the whole loop.

**During.** `/admin?key=…` shows totals, the scan → first-run funnel (the
number to watch), and runs per hour. If someone submits an obvious junk entry,
hit `hide` next to their row — it is a soft delete, so the row survives for the
export.

**At the end.** Press **Freeze leaderboard** in `/admin`. The board stops
accepting new bests, the display shows `LEADERBOARD FINAL`, and the top 4 are
locked in. Then export the CSV.

**The lead list.** `/api/admin/export?key=…` gives every player;
`&optedIn=1` gives only the people who ticked *"Send me E-Cell updates"*. The
checkbox ships unchecked and the flag is exported exactly as the player left
it — filtering on it is the whole point.

---

## Verified, and not

Verified here: the 10,000-pattern fairness proof, the difficulty curve landing
in band, a clean production build at ~124 KB first-load JS with no media
assets, the full phone flow end to end (onboarding → run → post-run → share
card → leaderboard) driven in a real Chromium at a 390×844 viewport, the
1080×1920 score card, and the booth display.

Not verified here, and worth ten minutes each before the fair:

- **60 fps on an actual mid-range Android.** The frame budget is small by
  construction — one canvas, pre-rendered parallax strips, a capped particle
  pool, no shadow blur — but a desktop Chromium is not a ₹15,000 phone.

  What *was* measured, on desktop, is that the cost does not grow with run
  length: at t=240 s the simulation, the per-frame canvas call count, the time
  inside those calls and the JS heap all match t=0. So a long run is not
  leaking or accumulating; it is only denser, because the pressure ramp keeps
  tightening the gaps. The one measured spike is the day/night crossfade, which
  doubles the background blits (9 per frame to 18) for five seconds each way —
  the first one lands at t=42 s. If the booth phone stutters and it turns out
  to track nightfall, `DAY_LENGTH` and `NIGHT_FADE` in `render.ts` are the
  knobs, and drawing one parallax set instead of two through the fade is the
  cut to make.
- **Native share on iOS and Android.** The card falls back to a download when
  `navigator.share` cannot take files; both paths run, only the fallback was
  exercised here.
- **50 concurrent players on the Supabase free tier.** Every request is one or
  two indexed queries and the leaderboard is cached for five seconds, but the
  number itself is untested.

## Assets

All character and obstacle art is original and drawn procedurally. No
third-party characters, models, names, or audio are used anywhere — score cards
get shared publicly, so the IP stays clean.
