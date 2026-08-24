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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
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

**The difficulty curve.** Speed ramps linearly from 200 world px/s to 2.2× that
over 90 seconds. The base speed is picked so that even at the 2.2× ceiling an
obstacle entering the right edge of the screen still leaves ~0.7 s of reaction
time.

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

## Anti-cheat

`POST /api/run/start` issues an HMAC-signed token containing a run id, the
player id, a server timestamp and the seed. `POST /api/run/submit` rejects a
submission when the token is missing, forged, older than ten minutes, or
already used (the run id is the primary key of `runs`, so a replay collides),
when the score exceeds the maximum rate the difficulty curve physically allows
plus ~15% headroom, or when a player has submitted more than 20 runs in five
minutes. Everything rejected is written to `rejected_submissions` with a
reason, so patterns are visible after the fair.

This will not stop a determined attacker — the game runs on the player's own
device, so nothing can. It stops the devtools-console kid, which is the
realistic threat at a club fair.

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
  pool, no shadow blur — but headless Chromium on a server is not a ₹15,000
  phone.
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
